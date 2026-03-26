import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';

const LAST_LYRICS_JOB_KEY = 'shir-on:last-lyrics-job';

function parseIds(params) {
  return String(params.get('ids') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function summarizeEntries(entries) {
  const total = entries.length;
  const succeeded = entries.filter((entry) => entry.result === 'success').length;
  const failed = entries.filter((entry) => entry.result === 'fail').length;
  const avg =
    total > 0
      ? Math.round(
          entries.reduce((sum, entry) => sum + Number(entry.duration_ms || 0), 0) / total
        )
      : 0;

  return { total, succeeded, failed, avg };
}

function readStoredJobId() {
  try {
    return window.localStorage.getItem(LAST_LYRICS_JOB_KEY) || '';
  } catch {
    return '';
  }
}

function storeJobId(jobId) {
  try {
    if (jobId) {
      window.localStorage.setItem(LAST_LYRICS_JOB_KEY, jobId);
    } else {
      window.localStorage.removeItem(LAST_LYRICS_JOB_KEY);
    }
  } catch {
    // Ignore localStorage failures in private or restricted contexts.
  }
}

function isMissingJobError(error) {
  return String(error?.message || '')
    .toLowerCase()
    .includes('job not found');
}

export default function LyricsRunPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedIds = useMemo(() => parseIds(searchParams), [searchParams]);
  const selectedPlaylistId = searchParams.get('playlist') || '';
  const trackedJobId = searchParams.get('job') || '';

  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [activeJob, setActiveJob] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  const selectedPlaylistName = useMemo(() => {
    if (!selectedPlaylistId) {
      return 'All missing songs';
    }

    return playlists.find((playlist) => playlist.id === selectedPlaylistId)?.name || 'Selected playlist';
  }, [playlists, selectedPlaylistId]);

  const entries = activeJob?.entries || [];
  const reportId = activeJob?.report_id || '';
  const summary = summarizeEntries(entries);

  function updateSearch(nextPatch, { replace = false } = {}) {
    const next = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(nextPatch)) {
      if (value === undefined || value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    setSearchParams(next, { replace });
  }

  useEffect(() => {
    let cancelled = false;

    async function loadPlaylists() {
      try {
        const data = await api.getPlaylists();

        if (!cancelled) {
          setPlaylists(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setPlaylists([]);
        }
      }
    }

    loadPlaylists();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!trackedJobId) {
      const storedJobId = readStoredJobId();

      if (storedJobId) {
        updateSearch({ job: storedJobId }, { replace: true });
      }
    }
  }, [trackedJobId]);

  useEffect(() => {
    if (trackedJobId) {
      return undefined;
    }

    return undefined;
  }, [trackedJobId]);

  useEffect(() => {
    let cancelled = false;

    async function loadSongs() {
      setLoading(true);
      setError('');

      try {
        const sourceSongs =
          requestedIds.length > 0
            ? await api.getSongsByIds(requestedIds)
            : await api.getSongs({
                limit: 1000,
                status: 'missing',
                sort: 'artist',
                playlistId: selectedPlaylistId,
              });

        if (!cancelled) {
          const nextSongs = (Array.isArray(sourceSongs) ? sourceSongs : []).filter(Boolean);
          const orderedSongs =
            requestedIds.length > 0
              ? requestedIds
                  .map((id) => nextSongs.find((song) => song.id === id))
                  .filter(Boolean)
              : nextSongs;

          setSongs(orderedSongs);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load lyrics run scope');
          setSongs([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSongs();

    return () => {
      cancelled = true;
    };
  }, [requestedIds, selectedPlaylistId, reloadTick]);

  useEffect(() => {
    let cancelled = false;

    if (!trackedJobId) {
      setActiveJob(null);
      setRunning(false);
      return undefined;
    }

    async function pollJob() {
      try {
        const job = await api.getJob(trackedJobId);

        if (cancelled) {
          return;
        }

        setError('');
        setInfo('');
        setActiveJob(job);

        const isRunning = job.status === 'queued' || job.status === 'running';
        setRunning(isRunning);

        if (!isRunning) {
          setReloadTick((value) => value + 1);
        }
      } catch (e) {
        if (cancelled) {
          return;
        }

        if (isMissingJobError(e)) {
          setActiveJob(null);
          setRunning(false);
          setInfo('The last tracked fetch job is no longer available. It may have finished before this page reconnected, or the backend may have restarted.');
          storeJobId('');
          updateSearch({ job: '' }, { replace: true });
          return;
        }

        setError(e?.message || 'Failed to refresh lyrics job');
      }
    }

    pollJob();
    const timer = window.setInterval(pollJob, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [trackedJobId]);

  async function runFetch() {
    if (songs.length === 0 || running) {
      return;
    }

    setRunning(true);
    setError('');
    setInfo('');

    try {
      const job = await api.startLyricsRunJob(songs.map((song) => song.id));
      setActiveJob(job);
      storeJobId(job.id);
      if (job.reused) {
        setInfo('A matching fetch is already running. Reconnected to the existing job instead of starting a duplicate run.');
      }
      updateSearch({ job: job.id });
    } catch (e) {
      setError(e?.message || 'Lyrics fetch failed to start');
      setRunning(false);
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Monitor</p>
          <h1 style={styles.title}>Fetch Lyrics</h1>
          <p style={styles.subTitle}>
            {requestedIds.length > 0
              ? `${songs.length} selected song(s)`
              : `${selectedPlaylistName} | ${songs.length} missing song(s) in scope`}
          </p>
        </div>

        <div style={styles.headerActions}>
          <button
            type="button"
            style={styles.primaryBtn}
            onClick={runFetch}
            disabled={running || songs.length === 0}
          >
            {running ? 'Fetching...' : 'Start Fetch'}
          </button>
          {activeJob?.id && (
            <Link to={`/jobs?job=${activeJob.id}`} style={styles.secondaryLink}>
              Open Job Monitor
            </Link>
          )}
          {reportId && (
            <Link to={`/reports/${reportId}`} style={styles.secondaryLink}>
              Open Report
            </Link>
          )}
        </div>
      </header>

      {requestedIds.length === 0 && (
        <div style={styles.filtersRow}>
          <label style={styles.filterField}>
            <span style={styles.filterLabel}>Playlist</span>
            <select
              value={selectedPlaylistId}
              onChange={(e) => {
                updateSearch({ playlist: e.target.value, job: '' });
                setActiveJob(null);
                setRunning(false);
                storeJobId('');
              }}
              style={styles.select}
            >
              <option value="">All missing songs</option>
              {playlists.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <strong>{songs.length}</strong>
          <span>songs in scope</span>
        </div>
        <div style={styles.summaryCard}>
          <strong>{summary.succeeded}</strong>
          <span>success</span>
        </div>
        <div style={styles.summaryCard}>
          <strong>{summary.failed}</strong>
          <span>failed</span>
        </div>
        <div style={styles.summaryCard}>
          <strong>{summary.avg}ms</strong>
          <span>avg time</span>
        </div>
      </div>

      {loading && <p style={styles.info}>Loading songs...</p>}
      {error && <p style={styles.error}>{error}</p>}
      {info && <p style={styles.info}>{info}</p>}

      {!loading && songs.length === 0 && (
        <p style={styles.info}>No songs are waiting for a lyrics fetch in the current scope.</p>
      )}

      {!loading && songs.length > 0 && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Title</th>
                <th style={styles.th}>Artist</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Provider</th>
                <th style={styles.th}>Duration</th>
                <th style={styles.th}>Failure Reason</th>
              </tr>
            </thead>
            <tbody>
              {songs.map((song) => {
                const entry = entries.find((item) => item.song_id === song.id);

                return (
                  <tr key={song.id}>
                    <td style={styles.td}>{song.title}</td>
                    <td style={styles.td}>{song.artist_name || '-'}</td>
                    <td style={styles.td}>
                      {entry ? (
                        <span
                          style={{
                            ...styles.status,
                            background:
                              entry.result === 'success'
                                ? '#dff4ea'
                                : entry.result === 'fail'
                                  ? '#fdecea'
                                  : '#f2f2f2',
                            color:
                              entry.result === 'success'
                                ? '#1e8449'
                                : entry.result === 'fail'
                                  ? '#c0392b'
                                  : '#555',
                          }}
                        >
                          {entry.result}
                        </span>
                      ) : (
                        <span style={styles.pending}>pending</span>
                      )}
                    </td>
                    <td style={styles.td}>{entry?.provider_used || '-'}</td>
                    <td style={styles.td}>{entry ? `${entry.duration_ms || 0}ms` : '-'}</td>
                    <td style={styles.td}>{entry?.failure_reason || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && activeJob && (
        <div style={styles.footerBar}>
          <span>
            {activeJob.status === 'completed'
              ? `Fetch completed. ${entries.length} song(s) processed.`
              : `Processed ${entries.length} / ${songs.length}`}
          </span>
          <Link to="/reports" style={styles.secondaryLink}>
            All Reports
          </Link>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '28px 20px 48px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  eyebrow: {
    margin: 0,
    color: '#8a6f3f',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    fontSize: 12,
    fontWeight: 700,
  },
  title: {
    margin: '6px 0 8px',
    fontSize: 36,
    color: '#2c241b',
  },
  subTitle: {
    margin: 0,
    color: '#6b6053',
    lineHeight: 1.6,
    maxWidth: 620,
  },
  headerActions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  filtersRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 18,
  },
  filterField: {
    display: 'grid',
    gap: 6,
  },
  filterLabel: {
    color: '#7d6c58',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  select: {
    minWidth: 220,
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid rgba(114, 98, 78, 0.22)',
    background: '#fff',
    color: '#3b332a',
  },
  primaryBtn: {
    padding: '10px 16px',
    borderRadius: 999,
    border: 'none',
    background: '#2f6b5f',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondaryLink: {
    padding: '10px 16px',
    borderRadius: 999,
    border: '1px solid rgba(114, 98, 78, 0.22)',
    background: '#fff',
    color: '#3b332a',
    fontWeight: 700,
    textDecoration: 'none',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
    marginBottom: 18,
  },
  summaryCard: {
    display: 'grid',
    gap: 4,
    padding: '16px 18px',
    borderRadius: 18,
    background: '#fffefb',
    border: '1px solid rgba(114, 98, 78, 0.18)',
  },
  tableWrap: {
    overflowX: 'auto',
    borderRadius: 18,
    border: '1px solid rgba(114, 98, 78, 0.18)',
    background: '#fffefb',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '12px 14px',
    background: '#faf5ec',
    borderBottom: '1px solid rgba(114, 98, 78, 0.18)',
    color: '#493d30',
  },
  td: {
    padding: '12px 14px',
    borderBottom: '1px solid rgba(114, 98, 78, 0.12)',
    verticalAlign: 'top',
    color: '#3c3126',
  },
  status: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'capitalize',
  },
  pending: {
    color: '#8a7c6e',
  },
  footerBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    flexWrap: 'wrap',
    color: '#5d5246',
  },
  info: {
    color: '#6b6053',
  },
  error: {
    color: '#c0392b',
    fontWeight: 600,
  },
};
