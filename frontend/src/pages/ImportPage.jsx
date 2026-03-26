import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, BASE as API_BASE } from '../api/client.js';
import SpotifyImportCard from '../components/SpotifyImportCard.jsx';

const LAST_IMPORT_JOB_KEY = 'shir-on:last-import-job';

function detectSpotifyInputKind(input) {
  const value = String(input || '').trim();
  if (!value) {
    return '';
  }

  const uriMatch = value.match(/^spotify:(playlist|album|track):([A-Za-z0-9]+)$/i);
  if (uriMatch) {
    return uriMatch[1].toLowerCase();
  }

  const urlMatch = value.match(
    /spotify\.com\/(playlist|album|track)\/([A-Za-z0-9]+)(?:\?|#|\/|$)/i
  );
  if (urlMatch) {
    return urlMatch[1].toLowerCase();
  }

  if (/^[A-Za-z0-9]{10,}$/.test(value)) {
    return 'auto';
  }

  return 'invalid';
}

function summaryLine(result) {
  const summary = result?.summary || result?.report?.summary || {};
  const found = Number(summary.found || result?.tracks_found || 0);
  const imported = Number(summary.imported || result?.imported || 0);
  const linkedExisting = Number(summary.linked_existing || result?.linked_existing || 0);
  const passed = Number(summary.passed || result?.passed || imported + linkedExisting);
  const blocked = Number(summary.blocked || result?.blocked || 0);
  const skipped = Number(summary.skipped || result?.skipped || 0);
  const invalid = Number(summary.invalid || result?.invalid || 0);
  const errors = Number(summary.errors || result?.errors || 0);

  return [
    `Passed: ${passed}`,
    `Imported: ${imported}`,
    linkedExisting ? `Linked existing: ${linkedExisting}` : null,
    found ? `Found: ${found}` : null,
    blocked ? `Blocked: ${blocked}` : null,
    skipped ? `Skipped: ${skipped}` : null,
    invalid ? `Invalid: ${invalid}` : null,
    errors ? `Errors: ${errors}` : null,
  ]
    .filter(Boolean)
    .join(' | ');
}

function readStoredImportJobId() {
  try {
    return window.localStorage.getItem(LAST_IMPORT_JOB_KEY) || '';
  } catch {
    return '';
  }
}

function storeImportJobId(jobId) {
  try {
    if (jobId) {
      window.localStorage.setItem(LAST_IMPORT_JOB_KEY, jobId);
    } else {
      window.localStorage.removeItem(LAST_IMPORT_JOB_KEY);
    }
  } catch {
    // Ignore localStorage failures in restricted browser contexts.
  }
}

function isMissingJobError(error) {
  return String(error?.message || '')
    .toLowerCase()
    .includes('job not found');
}

export default function ImportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const initialSpotifyInput =
    searchParams.get('spotify_input') ||
    searchParams.get('playlist') ||
    searchParams.get('album') ||
    '';

  const [spotifyInput, setSpotifyInput] = useState(initialSpotifyInput);
  const [jsonInput, setJsonInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [spotifyStatus, setSpotifyStatus] = useState(null);
  const [checkingSpotify, setCheckingSpotify] = useState(true);
  const [activeJob, setActiveJob] = useState(null);
  const [autoStartRequested, setAutoStartRequested] = useState(
    searchParams.get('autostart') === '1'
  );
  const spotifyError = searchParams.get('spotify_error') || '';

  const spotifyInputKind = useMemo(
    () => detectSpotifyInputKind(spotifyInput),
    [spotifyInput]
  );

  useEffect(() => {
    if (initialSpotifyInput) {
      setSpotifyInput(initialSpotifyInput);
    }

    setAutoStartRequested(searchParams.get('autostart') === '1');
  }, [initialSpotifyInput, searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      setCheckingSpotify(true);

      try {
        const data = await api.getSpotifyStatus();
        if (!cancelled) {
          setSpotifyStatus(data);
        }
      } catch (e) {
        if (!cancelled) {
          setSpotifyStatus(null);
          setError(e?.message || 'Failed to load Spotify status');
        }
      } finally {
        if (!cancelled) {
          setCheckingSpotify(false);
        }
      }
    }

    loadStatus();

    return () => {
      cancelled = true;
    };
  }, [location.key]);

  useEffect(() => {
    if (!activeJob?.id) {
      const storedJobId = readStoredImportJobId();

      if (storedJobId) {
        setActiveJob({ id: storedJobId });
      }
    }
  }, [activeJob?.id]);

  useEffect(() => {
    let cancelled = false;

    if (!activeJob?.id) {
      return undefined;
    }

    async function pollJob() {
      try {
        const job = await api.getJob(activeJob.id);

        if (cancelled) {
          return;
        }

        setActiveJob(job);
        storeImportJobId(job.id);

        if (job.status === 'completed' && job.result) {
          setResult(job.result);
        }
      } catch (e) {
        if (!cancelled) {
          if (isMissingJobError(e)) {
            storeImportJobId('');
            setActiveJob(null);
            setError('The last tracked import job is no longer available. It may have finished before this page reconnected, or the backend may have restarted.');
            return;
          }

          setError(e?.message || 'Failed to refresh background import');
        }
      }
    }

    pollJob();
    const timer = window.setInterval(pollJob, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeJob?.id]);

  function connectSpotify() {
    const returnTo = `/import?spotify_input=${encodeURIComponent(spotifyInput)}&spotify=connected${
      autoStartRequested ? '&autostart=1' : ''
    }`;
    window.location.href = `${API_BASE}/spotify/login?returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function disconnectSpotify() {
    setLoading(true);
    setError('');

    try {
      await api.logoutSpotify();
      setSpotifyStatus((current) => ({
        ...(current || {}),
        authenticated: false,
        account: null,
      }));
    } catch (e) {
      setError(e?.message || 'Failed to disconnect Spotify');
    } finally {
      setLoading(false);
    }
  }

  async function startJob(action) {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const job = await action();
      setActiveJob(job);
      storeImportJobId(job?.id || '');
      if (job?.reused) {
        setError('');
        setResult(null);
      }
    } catch (e) {
      setError(e?.message || 'Background import failed to start');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (
      !autoStartRequested ||
      checkingSpotify ||
      loading ||
      activeJob?.id ||
      !spotifyStatus?.authenticated ||
      !spotifyInput.trim()
    ) {
      return;
    }

    setAutoStartRequested(false);

    const nextSearch = new URLSearchParams(searchParams);
    nextSearch.delete('autostart');
    navigate(
      {
        pathname: '/import',
        search: nextSearch.toString() ? `?${nextSearch.toString()}` : '',
      },
      { replace: true }
    );

    startJob(() => api.startSpotifyImportJob(spotifyInput));
  }, [
    activeJob?.id,
    autoStartRequested,
    checkingSpotify,
    loading,
    navigate,
    searchParams,
    spotifyInput,
    spotifyStatus?.authenticated,
  ]);

  async function handleCsvUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await api.importCsv(file);
      setResult(response);
    } catch (e) {
      setError(e?.message || 'CSV import failed');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  }

  async function handleJsonImport() {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const parsed = JSON.parse(jsonInput);

      if (!Array.isArray(parsed)) {
        throw new Error('JSON input must be an array of song records');
      }

      const response = await api.importJson(parsed);
      setResult(response);
    } catch (e) {
      setError(e?.message || 'JSON import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Import</h1>
        </div>

        <div style={styles.headerActions}>
          {searchParams.get('spotify') === 'connected' && (
            <span style={styles.badge}>Returned from Spotify</span>
          )}
          {searchParams.get('spotify') === 'error' && (
            <span style={styles.errorBadge}>Spotify auth failed</span>
          )}
          {!checkingSpotify && spotifyStatus?.configured && (
            spotifyStatus?.authenticated ? (
              <button type="button" style={styles.secondaryBtn} onClick={disconnectSpotify} disabled={loading}>
                Disconnect Spotify
              </button>
            ) : (
              <button type="button" style={styles.primaryBtn} onClick={connectSpotify}>
                Connect Spotify
              </button>
            )
          )}
        </div>
      </header>

      {searchParams.get('spotify') === 'error' && spotifyError && (
        <p style={styles.error}>
          Spotify returned an auth error: <code>{spotifyError}</code>
        </p>
      )}

      {checkingSpotify && <p style={styles.info}>Checking Spotify session...</p>}

      {!checkingSpotify && !spotifyStatus?.configured && (
        <>
          <p style={styles.error}>Spotify is not configured on the backend.</p>
          <p style={styles.info}>
            Missing env vars: <code>{(spotifyStatus?.missing || []).join(', ') || 'unknown'}</code>
          </p>
          {spotifyStatus?.redirect_uri && (
            <p style={styles.info}>
              Expected redirect URI: <code>{spotifyStatus.redirect_uri}</code>
            </p>
          )}
        </>
      )}

      {!checkingSpotify && spotifyStatus?.configured && spotifyStatus?.authenticated && (
        <p style={styles.success}>
          Connected
          {spotifyStatus?.account?.display_name ? ` as ${spotifyStatus.account.display_name}` : ''}.
        </p>
      )}

      <div style={styles.grid}>
        <SpotifyImportCard
          value={spotifyInput}
          onChange={setSpotifyInput}
          onSubmit={() => startJob(() => api.startSpotifyImportJob(spotifyInput))}
          buttonLabel="Start Background Import"
          disabled={
            loading ||
            !spotifyStatus?.authenticated ||
            !spotifyInput.trim() ||
            spotifyInputKind === 'invalid'
          }
        >
          {spotifyInputKind === 'playlist' && (
            <p style={styles.info}>Detected: Spotify playlist</p>
          )}
          {spotifyInputKind === 'album' && (
            <p style={styles.info}>Detected: Spotify album</p>
          )}
          {spotifyInputKind === 'track' && (
            <p style={styles.info}>Detected: Spotify song</p>
          )}
          {spotifyInputKind === 'auto' && (
            <p style={styles.info}>Detected from raw Spotify ID when import starts.</p>
          )}
          {spotifyInput && spotifyInputKind === 'invalid' && (
            <p style={styles.error}>Invalid Spotify URL, URI, or ID.</p>
          )}
        </SpotifyImportCard>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>CSV Upload</h2>
          <p style={styles.sectionHint}>Columns: title, artist, album, year, language</p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvUpload}
          />
        </section>
      </div>

      <div style={styles.grid}>
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>JSON Import</h2>
          <p style={styles.sectionHint}>
            Advanced import for pasted export data or script output. Paste an array of song records.
          </p>
          <textarea
            style={styles.textarea}
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder='[{"title":"Song","artist":"Artist"}]'
          />
          <button
            type="button"
            style={styles.primaryBtn}
            disabled={loading || !jsonInput.trim()}
            onClick={handleJsonImport}
          >
            Import JSON
          </button>
        </section>
      </div>

      {loading && <p style={styles.info}>Working...</p>}
      {error && <p style={styles.error}>{error}</p>}

      {activeJob && (
        <section style={styles.jobCard}>
          <div style={styles.resultHeader}>
            <div>
              <strong>{activeJob.label}</strong>
              <p style={styles.info}>
                {activeJob.status} | {(activeJob.progress?.completed || 0)} / {(activeJob.progress?.total || 0)}
              </p>
              {activeJob.reused && (
                <p style={styles.info}>A matching import was already running, so this page reconnected to it.</p>
              )}
              {activeJob.current_label && <p style={styles.info}>Now: {activeJob.current_label}</p>}
            </div>

            <div style={styles.inlineRow}>
              <Link to={`/jobs?job=${activeJob.id}`} style={styles.secondaryLink}>
                Open Job Monitor
              </Link>
              {activeJob.report_id && (
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  onClick={() => navigate(`/reports/${activeJob.report_id}`)}
                >
                  Open Report
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {result && (
        <section style={styles.result}>
          <div style={styles.resultHeader}>
            <div>
              <strong>Done.</strong> {summaryLine(result)}
            </div>

            <div style={styles.inlineRow}>
              {result.report_id && (
                <button type="button" style={styles.secondaryBtn} onClick={() => navigate(`/reports/${result.report_id}`)}>
                  View Report
                </button>
              )}
              <button type="button" style={styles.secondaryBtn} onClick={() => navigate('/reports')}>
                All Reports
              </button>
            </div>
          </div>

          {result?.playlist?.name && (
            <p style={styles.success}>Playlist linked in library as "{result.playlist.name}".</p>
          )}

          {Number(result?.linked_existing || result?.summary?.linked_existing || 0) > 0 && (
            <p style={styles.info}>
              Existing songs were linked into this playlist as shared library songs. They were not blocked.
            </p>
          )}

          {Array.isArray(result.preview_titles) && result.preview_titles.length > 0 && (
            <div style={styles.previewBlock}>
              <strong>Preview</strong>
              <ul style={styles.list}>
                {result.preview_titles.map((entry, index) => (
                  <li key={`${entry}-${index}`}>{entry}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1080,
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
  title: {
    margin: '0 0 8px',
    fontSize: 40,
    color: '#2c241b',
  },
  headerActions: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    marginLeft: 'auto',
  },
  subTitle: {
    margin: 0,
    maxWidth: 640,
    color: '#6b6053',
    lineHeight: 1.6,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 16,
    marginBottom: 16,
  },
  section: {
    background: '#fffefb',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 18,
    padding: 20,
    boxShadow: '0 14px 30px rgba(77, 60, 35, 0.05)',
  },
  sectionTitle: {
    margin: 0,
    color: '#2f261c',
  },
  sectionHint: {
    margin: '6px 0 0',
    color: '#7c6d5d',
    fontSize: 13,
  },
  badge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: 999,
    background: '#eafaf1',
    color: '#1e8449',
    fontSize: 12,
    fontWeight: 700,
  },
  errorBadge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: 999,
    background: '#fdecea',
    color: '#c0392b',
    fontSize: 12,
    fontWeight: 700,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid #d2c7b7',
    background: '#fff',
    marginBottom: 12,
  },
  textarea: {
    width: '100%',
    minHeight: 180,
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid #d2c7b7',
    background: '#fff',
    resize: 'vertical',
    marginBottom: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  inlineRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
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
  secondaryBtn: {
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid rgba(114, 98, 78, 0.22)',
    background: '#fff',
    color: '#3b332a',
    fontWeight: 700,
    cursor: 'pointer',
  },
  result: {
    padding: 18,
    borderRadius: 18,
    background: '#f1f8f3',
    border: '1px solid rgba(47, 107, 95, 0.18)',
  },
  jobCard: {
    padding: 18,
    borderRadius: 18,
    background: '#fff8e8',
    border: '1px solid rgba(138, 111, 63, 0.22)',
    marginBottom: 16,
  },
  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  previewBlock: {
    marginTop: 12,
  },
  secondaryLink: {
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid rgba(114, 98, 78, 0.22)',
    background: '#fff',
    color: '#3b332a',
    fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'none',
  },
  list: {
    marginTop: 8,
    marginBottom: 0,
    paddingLeft: 18,
  },
  info: {
    color: '#6b6053',
  },
  error: {
    color: '#c0392b',
    fontWeight: 600,
  },
  success: {
    color: '#1e8449',
    fontWeight: 600,
  },
};
