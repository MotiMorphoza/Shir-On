import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';

function formatDuration(value) {
  const ms = Number(value || 0);
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
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

function renderSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    return '-';
  }

  return [
    summary.total !== undefined ? `Total: ${summary.total}` : null,
    summary.passed !== undefined ? `Passed: ${summary.passed}` : null,
    summary.imported !== undefined ? `Imported: ${summary.imported}` : null,
    summary.linked_existing !== undefined ? `Linked existing: ${summary.linked_existing}` : null,
    summary.fetched !== undefined ? `Fetched: ${summary.fetched}` : null,
    summary.blocked !== undefined ? `Blocked: ${summary.blocked}` : null,
    summary.failed !== undefined ? `Failed: ${summary.failed}` : null,
    summary.skipped ? `Skipped: ${summary.skipped}` : null,
    summary.success_rate !== undefined ? `Success: ${Math.round(Number(summary.success_rate || 0) * 100)}%` : null,
    summary.avg_duration_ms !== undefined ? `Avg time: ${formatDuration(summary.avg_duration_ms)}` : null,
  ]
    .filter(Boolean)
    .join(' | ');
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [providerStats, setProviderStats] = useState([]);
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load(cancelledRef) {
    setLoading(true);
    setError('');

    try {
      const [reportsData, statsData] = await Promise.all([
        api.getReports({ type, limit: 200 }),
        api.getLyricsProviderStats(),
      ]);

      if (!cancelledRef.cancelled) {
        setReports(Array.isArray(reportsData) ? reportsData : []);
        setProviderStats(Array.isArray(statsData) ? statsData : []);
      }
    } catch (e) {
      if (!cancelledRef.cancelled) {
        setError(e?.message || 'Failed to load reports');
        setReports([]);
        setProviderStats([]);
      }
    } finally {
      if (!cancelledRef.cancelled) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const cancelledRef = { cancelled: false };

    load(cancelledRef);

    return () => {
      cancelledRef.cancelled = true;
    };
  }, [type]);

  async function handleResetReports() {
    if (!window.confirm('Delete all active and legacy reports?')) {
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');

    try {
      const result = await api.resetReports({ includeLegacy: true });
      setInfo(
        `Reports reset. Removed ${Number(result?.removed_active || 0)} active and ${Number(result?.removed_legacy || 0)} legacy report(s).`
      );
      await load({ cancelled: false });
    } catch (e) {
      setError(e?.message || 'Failed to reset reports');
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Reports</h1>
        </div>

        <div style={styles.headerActions}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={styles.select}>
            <option value="">All Reports</option>
            <option value="import">Import Runs</option>
            <option value="lyrics_fetch">Lyrics Fetches</option>
          </select>
          <button type="button" style={styles.secondaryBtn} onClick={handleResetReports}>
            Reset Reports
          </button>
        </div>
      </header>

      {loading && <p style={styles.info}>Loading reports...</p>}
      {error && <p style={styles.error}>{error}</p>}
      {info && <p style={styles.success}>{info}</p>}

      {!loading && (
        <div style={styles.layout}>
          <section style={styles.mainPanel}>
            {reports.map((report) => (
              <article key={report.id} style={styles.reportCard}>
                <div style={styles.reportHeader}>
                  <div>
                    <div style={styles.reportType}>{formatReportKind(report)} / {formatReportSubtype(report)}</div>
                    <h2 style={styles.reportTitle}>{report.label || report.source_id || report.id}</h2>
                    <p style={styles.reportMeta}>
                      {report.created_at} | {report.entries_count || 0} entries
                    </p>
                  </div>

                  <button
                    type="button"
                    style={styles.openBtn}
                    onClick={() => navigate(`/reports/${report.id}`)}
                  >
                    Open
                  </button>
                </div>

                <div style={styles.reportSummary}>{renderSummary(report.summary)}</div>
              </article>
            ))}

            {!reports.length && !loading && (
              <p style={styles.info}>No reports found for the current filter.</p>
            )}
          </section>

          <aside style={styles.sidePanel}>
            <div style={styles.statsCard}>
              <strong style={styles.statsTitle}>Lyrics Provider Stats</strong>
              <p style={styles.statsHint}>All-time across all lyrics fetch reports</p>

              {providerStats.map((row) => (
                <div key={row.provider} style={styles.statsRow}>
                  <div>
                    <div style={styles.providerName}>{row.provider}</div>
                    <div style={styles.providerMeta}>
                      Wins {row.wins || 0} | Success {Math.round(Number(row.success_rate || 0) * 100)}% | Avg {formatDuration(row.avg_duration_ms)}
                    </div>
                  </div>
                  <div style={styles.providerAttempts}>{row.attempts}</div>
                </div>
              ))}
            </div>
          </aside>
        </div>
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
  title: {
    margin: '0 0 8px',
    fontSize: 40,
    color: '#2c241b',
  },
  headerActions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  select: {
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid rgba(114, 98, 78, 0.22)',
    background: '#fff',
  },
  secondaryBtn: {
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid rgba(114, 98, 78, 0.22)',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    color: '#3b332a',
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 320px',
    gap: 20,
    alignItems: 'start',
  },
  mainPanel: {
    display: 'grid',
    gap: 14,
  },
  sidePanel: {
    position: 'sticky',
    top: 96,
  },
  reportCard: {
    background: '#fffefb',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 18,
    padding: 18,
  },
  reportHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  reportType: {
    color: '#8a7a65',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  reportTitle: {
    margin: '4px 0 6px',
    fontSize: 24,
    color: '#2f261c',
  },
  reportMeta: {
    margin: 0,
    color: '#6f6356',
    fontSize: 13,
  },
  reportSummary: {
    color: '#463b2f',
    lineHeight: 1.6,
  },
  openBtn: {
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid rgba(114, 98, 78, 0.22)',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    color: '#3b332a',
  },
  statsCard: {
    background: '#fffdf8',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 18,
    padding: 18,
  },
  statsTitle: {
    display: 'block',
    marginBottom: 4,
    color: '#2f261c',
  },
  statsHint: {
    margin: '0 0 10px',
    color: '#7c6d5d',
    fontSize: 12,
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    padding: '10px 0',
    borderBottom: '1px solid rgba(114, 98, 78, 0.1)',
  },
  providerName: {
    color: '#3f352a',
    fontWeight: 700,
  },
  providerMeta: {
    color: '#7c6d5d',
    fontSize: 12,
  },
  providerAttempts: {
    color: '#5a4d3f',
    fontWeight: 700,
  },
  info: {
    color: '#6b6053',
  },
  success: {
    color: '#1e8449',
    fontWeight: 600,
  },
  error: {
    color: '#c0392b',
    fontWeight: 600,
  },
};
