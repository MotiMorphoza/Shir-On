import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import BackToLibraryButton from '../components/BackToLibraryButton.jsx';

function formatDuration(value) {
  const ms = Number(value || 0);
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function isPassedResult(result) {
  return ['success', 'imported', 'linked_existing'].includes(result);
}

function isBlockedResult(result) {
  return ['fail', 'error', 'invalid', 'skipped'].includes(result);
}

function formatResultLabel(result) {
  switch (result) {
    case 'linked_existing':
      return 'Linked existing';
    case 'imported':
      return 'Imported';
    case 'success':
      return 'Success';
    case 'fail':
      return 'Failed';
    case 'invalid':
      return 'Invalid';
    case 'error':
      return 'Error';
    case 'skipped':
      return 'Skipped';
    default:
      return result || '-';
  }
}

function formatReasonLabel(reason) {
  switch (reason) {
    case 'existing_spotify_id':
      return 'Already exists by Spotify ID';
    case 'existing_title_artist':
      return 'Already exists by title + artist';
    case 'invalid_track_payload':
      return 'Invalid song payload';
    case 'failed_insert':
      return 'Failed to save song';
    case 'created':
      return 'Created';
    case 'no_result':
      return 'No lyrics found';
    default:
      return reason || 'No reason';
  }
}

function buildReasonCounts(entries) {
  const counts = {};

  for (const entry of entries) {
    const key = entry.failure_reason || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => ({
      reason,
      count,
      label: formatReasonLabel(reason),
    }));
}

function buildReportProviderStats(report) {
  return Array.isArray(report?.provider_stats_current) ? report.provider_stats_current : [];
}

function formatReportKind(report) {
  if (report?.type === 'lyrics_fetch') {
    return 'Lyrics Fetch';
  }

  if (report?.type === 'import') {
    return 'Import';
  }

  return report?.type || 'unknown';
}

function formatReportSubtype(report) {
  if (report?.type === 'lyrics_fetch') {
    return 'Fetch';
  }

  return report?.subtype || 'report';
}

export default function ReportPage() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('all');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const data = await api.getReport(id);
        if (!cancelled) {
          setReport(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load report');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const entries = Array.isArray(report?.entries) ? report.entries : [];
  const q = search.trim().toLowerCase();
  const providerStats = useMemo(() => buildReportProviderStats(report), [report]);

  const passedEntries = useMemo(
    () => entries.filter((entry) => isPassedResult(entry.result)),
    [entries]
  );
  const blockedEntries = useMemo(
    () => entries.filter((entry) => isBlockedResult(entry.result)),
    [entries]
  );
  const blockedReasonOptions = useMemo(
    () => buildReasonCounts(blockedEntries),
    [blockedEntries]
  );

  const filtered = useMemo(() => {
    let list = entries;

    if (resultFilter === 'passed') {
      list = list.filter((entry) => isPassedResult(entry.result));
    } else if (resultFilter === 'blocked') {
      list = list.filter((entry) => isBlockedResult(entry.result));
    }

    if (reasonFilter !== 'all') {
      list = list.filter((entry) => (entry.failure_reason || 'unknown') === reasonFilter);
    }

    if (!q) {
      return list;
    }

    return list.filter((entry) =>
      [
        entry.original_title,
        entry.original_artist,
        entry.provider_used,
        entry.failure_reason,
        formatResultLabel(entry.result),
        ...(entry.provider_plan || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [entries, q, reasonFilter, resultFilter]);

  const summaryCards = [
    {
      label: 'Total',
      value: report?.summary?.total ?? report?.summary?.found ?? entries.length,
    },
    {
      label: report?.type === 'import' ? 'Passed' : 'Success',
      value:
        report?.summary?.passed ??
        report?.summary?.fetched ??
        passedEntries.length,
    },
    {
      label: report?.type === 'import' ? 'Linked Existing' : 'Failed',
      value:
        report?.type === 'import'
          ? report?.summary?.linked_existing ?? entries.filter((entry) => entry.result === 'linked_existing').length
          : report?.summary?.failed ?? blockedEntries.length,
    },
    {
      label: report?.type === 'import' ? 'Blocked' : 'Avg time',
      value:
        report?.type === 'import'
          ? report?.summary?.blocked ?? blockedEntries.length
          : formatDuration(report?.summary?.avg_duration_ms),
    },
  ];

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Report</p>
          <h1 style={styles.title}>{report?.label || report?.source_id || id}</h1>
          <p style={styles.subTitle}>
            {formatReportKind(report)} / {formatReportSubtype(report)} | {entries.length} entries
          </p>
        </div>

        <div style={styles.actions}>
          <BackToLibraryButton />
          <Link to="/reports" style={styles.secondaryLink}>
            All Reports
          </Link>
          <Link to="/lyrics-run" style={styles.secondaryLink}>
            New Lyrics Fetch
          </Link>
        </div>
      </header>

      {loading && <p style={styles.info}>Loading report...</p>}
      {error && <p style={styles.error}>{error}</p>}

      {report && (
        <>
          <div style={styles.summaryGrid}>
            {summaryCards.map((card) => (
              <div key={card.label} style={styles.summaryCard}>
                <strong>{card.value}</strong>
                <span>{card.label}</span>
              </div>
            ))}
          </div>

          <div style={styles.toolbar}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, artist, provider, reason..."
              style={styles.search}
            />
          </div>

          <div style={styles.filtersBlock}>
            <div style={styles.filterGroup}>
              <span style={styles.filterLabel}>Show</span>
              <div style={styles.chips}>
                <button
                  type="button"
                  style={resultFilter === 'all' ? styles.activeChip : styles.chip}
                  onClick={() => {
                    setResultFilter('all');
                    setReasonFilter('all');
                  }}
                >
                  All ({entries.length})
                </button>
                <button
                  type="button"
                  style={resultFilter === 'passed' ? styles.activeChip : styles.chip}
                  onClick={() => {
                    setResultFilter('passed');
                    setReasonFilter('all');
                  }}
                >
                  Passed ({passedEntries.length})
                </button>
                <button
                  type="button"
                  style={resultFilter === 'blocked' ? styles.activeChip : styles.chip}
                  onClick={() => setResultFilter('blocked')}
                >
                  Blocked ({blockedEntries.length})
                </button>
              </div>
            </div>

            {blockedReasonOptions.length > 0 && (
              <div style={styles.filterGroup}>
                <span style={styles.filterLabel}>Blocked reasons</span>
                <div style={styles.chips}>
                  <button
                    type="button"
                    style={reasonFilter === 'all' ? styles.activeChip : styles.chip}
                    onClick={() => setReasonFilter('all')}
                  >
                    All reasons
                  </button>
                  {blockedReasonOptions.map((item) => (
                    <button
                      key={item.reason}
                      type="button"
                      style={reasonFilter === item.reason ? styles.activeChip : styles.chip}
                      onClick={() => {
                        setResultFilter('blocked');
                        setReasonFilter(item.reason);
                      }}
                    >
                      {item.label} ({item.count})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {report.type === 'lyrics_fetch' && providerStats.length > 0 && (
            <section style={styles.providerSection}>
              <div style={styles.providerSectionHeader}>
                <div>
                  <strong style={styles.providerSectionTitle}>Providers In This Fetch</strong>
                  <p style={styles.providerSectionHint}>
                    Attempted and winning providers for the current lyrics fetch only.
                  </p>
                </div>
              </div>

              <div style={styles.providerTableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Provider</th>
                      <th style={styles.th}>Attempts</th>
                      <th style={styles.th}>Wins</th>
                      <th style={styles.th}>Success</th>
                      <th style={styles.th}>Avg Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerStats.map((row) => (
                      <tr key={row.provider}>
                        <td style={styles.td}>{row.provider}</td>
                        <td style={styles.td}>{row.attempts}</td>
                        <td style={styles.td}>{row.wins || 0}</td>
                        <td style={styles.td}>{Math.round(Number(row.success_rate || 0) * 100)}%</td>
                        <td style={styles.td}>{formatDuration(row.avg_duration_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Song</th>
                  <th style={styles.th}>Result</th>
                  <th style={styles.th}>Provider</th>
                  <th style={styles.th}>Provider Plan</th>
                  <th style={styles.th}>Duration</th>
                  <th style={styles.th}>Reason</th>
                  <th style={styles.th}>Open</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, index) => (
                  <tr key={`${entry.song_id || 'entry'}-${entry.original_title}-${index}`}>
                    <td style={styles.td}>
                      <div style={styles.songCell}>
                        <strong>{entry.original_title || '-'}</strong>
                        <span>{entry.original_artist || '-'}</span>
                      </div>
                    </td>
                    <td style={styles.td}>{formatResultLabel(entry.result)}</td>
                    <td style={styles.td}>{entry.provider_used || '-'}</td>
                    <td style={styles.td}>{(entry.provider_plan || []).join(' -> ') || '-'}</td>
                    <td style={styles.td}>{formatDuration(entry.duration_ms)}</td>
                    <td style={styles.td}>{formatReasonLabel(entry.failure_reason)}</td>
                    <td style={styles.td}>
                      {entry.song_id ? (
                        <Link to={`/songs/${entry.song_id}`} style={styles.openLink}>
                          Song
                        </Link>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td style={styles.emptyCell} colSpan={7}>
                      No entries match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1320,
    margin: '0 auto',
    padding: '28px 20px 48px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 20,
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
    fontSize: 34,
    color: '#2c241b',
  },
  subTitle: {
    margin: 0,
    color: '#6b6053',
  },
  actions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  secondaryLink: {
    padding: '10px 14px',
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
    marginBottom: 16,
  },
  summaryCard: {
    display: 'grid',
    gap: 4,
    padding: '16px 18px',
    borderRadius: 18,
    background: '#fffefb',
    border: '1px solid rgba(114, 98, 78, 0.18)',
  },
  toolbar: {
    marginBottom: 12,
  },
  search: {
    width: '100%',
    maxWidth: 420,
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid #d2c7b7',
    background: '#fff',
  },
  filtersBlock: {
    display: 'grid',
    gap: 12,
    marginBottom: 14,
  },
  filterGroup: {
    display: 'grid',
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#7d6c58',
  },
  chips: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(114, 98, 78, 0.2)',
    background: '#fff',
    color: '#4b4034',
    cursor: 'pointer',
    fontWeight: 600,
  },
  activeChip: {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(47, 107, 95, 0.2)',
    background: '#2f6b5f',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
  },
  tableWrap: {
    overflowX: 'auto',
    borderRadius: 18,
    border: '1px solid rgba(114, 98, 78, 0.18)',
    background: '#fffefb',
  },
  providerSection: {
    marginBottom: 14,
  },
  providerSectionHeader: {
    marginBottom: 10,
  },
  providerSectionTitle: {
    display: 'block',
    color: '#2f261c',
  },
  providerSectionHint: {
    margin: '4px 0 0',
    color: '#7c6d5d',
    fontSize: 13,
  },
  providerTableWrap: {
    overflowX: 'auto',
    borderRadius: 18,
    border: '1px solid rgba(114, 98, 78, 0.18)',
    background: '#fffdf8',
    marginBottom: 14,
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
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '12px 14px',
    borderBottom: '1px solid rgba(114, 98, 78, 0.12)',
    verticalAlign: 'top',
    color: '#3c3126',
  },
  songCell: {
    display: 'grid',
    gap: 4,
  },
  openLink: {
    textDecoration: 'none',
    color: '#2f6b5f',
    fontWeight: 700,
  },
  emptyCell: {
    padding: '18px 14px',
    textAlign: 'center',
    color: '#6b6053',
  },
  info: {
    color: '#6b6053',
  },
  error: {
    color: '#c0392b',
    fontWeight: 600,
  },
};
