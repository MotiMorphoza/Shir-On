import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';

function summarize(job) {
  const progress = job?.progress || {};
  const total = Number(progress.total || 0);
  const completed = Number(progress.completed || 0);
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    percent,
    succeeded: Number(progress.succeeded || 0),
    failed: Number(progress.failed || 0),
    skipped: Number(progress.skipped || 0),
  };
}

export default function JobsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedJobId = searchParams.get('job') || '';
  const [jobs, setJobs] = useState([]);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      try {
        const data = await api.getJobs();
        if (!cancelled) {
          const nextJobs = Array.isArray(data) ? data : [];
          setJobs(nextJobs);
          setError('');

          if (!selectedJobId && nextJobs.length > 0) {
            setSearchParams({ job: nextJobs[0].id }, { replace: true });
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load jobs');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadJobs();
    const timer = window.setInterval(loadJobs, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedJobId, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedJobId) {
      setJob(null);
      return undefined;
    }

    async function loadJob() {
      try {
        const data = await api.getJob(selectedJobId);
        if (!cancelled) {
          setJob(data);
          setError('');
          setInfo('');
        }
      } catch (e) {
        if (!cancelled) {
          if (String(e?.message || '').toLowerCase().includes('job not found')) {
            setJob(null);
            setInfo('The selected job is no longer available. The job list on the left is still current.');
            setSearchParams({}, { replace: true });
            return;
          }

          setError(e?.message || 'Failed to load job details');
        }
      }
    }

    loadJob();
    const timer = window.setInterval(loadJob, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedJobId]);

  const selectedSummary = useMemo(() => summarize(job), [job]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Jobs</h1>
        </div>
      </header>

      {error && <p style={styles.error}>{error}</p>}
      {info && <p style={styles.info}>{info}</p>}
      {loading && <p style={styles.info}>Loading jobs...</p>}

      <div style={styles.layout}>
        <section style={styles.listPanel}>
          {jobs.length === 0 ? (
            <p style={styles.info}>No jobs yet.</p>
          ) : (
            jobs.map((entry) => {
              const summary = summarize(entry);
              const active = entry.id === selectedJobId;

              return (
                <button
                  key={entry.id}
                  type="button"
                  style={{
                    ...styles.jobButton,
                    ...(active ? styles.jobButtonActive : {}),
                  }}
                  onClick={() => setSearchParams({ job: entry.id })}
                >
                  <strong>{entry.label}</strong>
                  <span style={styles.jobMeta}>
                    {entry.status} | {summary.completed}/{summary.total || '?'}
                  </span>
                </button>
              );
            })
          )}
        </section>

        <section style={styles.detailPanel}>
          {!job ? (
            <p style={styles.info}>Select a job to monitor it.</p>
          ) : (
            <>
              <div style={styles.detailHeader}>
                <div>
                  <h2 style={styles.sectionTitle}>{job.label}</h2>
                  <p style={styles.jobMeta}>
                    {job.status} {job.phase ? `| ${job.phase}` : ''}
                  </p>
                </div>

                <div style={styles.inlineRow}>
                  {job.report_id ? (
                    <Link to={`/reports/${job.report_id}`} style={styles.secondaryLink}>
                      Open Report
                    </Link>
                  ) : null}
                </div>
              </div>

              <div style={styles.summaryGrid}>
                <div style={styles.summaryCard}>
                  <strong>{selectedSummary.completed}</strong>
                  <span>completed</span>
                </div>
                <div style={styles.summaryCard}>
                  <strong>{selectedSummary.succeeded}</strong>
                  <span>succeeded</span>
                </div>
                <div style={styles.summaryCard}>
                  <strong>{selectedSummary.failed}</strong>
                  <span>failed</span>
                </div>
                <div style={styles.summaryCard}>
                  <strong>{selectedSummary.percent}%</strong>
                  <span>progress</span>
                </div>
              </div>

              <div style={styles.progressTrack}>
                <div
                  style={{
                    ...styles.progressBar,
                    width: `${selectedSummary.percent}%`,
                  }}
                />
              </div>

              {job.current_label && <p style={styles.info}>Now working on: {job.current_label}</p>}
              {job.error && <p style={styles.error}>{job.error}</p>}

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Title</th>
                      <th style={styles.th}>Artist</th>
                      <th style={styles.th}>Result</th>
                      <th style={styles.th}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(job.entries || []).slice(-150).reverse().map((entry, index) => (
                      <tr key={`${entry.song_id || entry.title || 'row'}-${index}`}>
                        <td style={styles.td}>{entry.original_title || entry.title || '-'}</td>
                        <td style={styles.td}>{entry.original_artist || entry.artist || '-'}</td>
                        <td style={styles.td}>{entry.result || entry.action || '-'}</td>
                        <td style={styles.td}>{entry.failure_reason || entry.reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '28px 20px 48px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  title: {
    margin: '0 0 8px',
    fontSize: 40,
    color: '#2c241b',
  },
  subTitle: {
    margin: 0,
    color: '#6b6053',
    lineHeight: 1.6,
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: '320px minmax(0, 1fr)',
    gap: 18,
    alignItems: 'start',
  },
  listPanel: {
    display: 'grid',
    gap: 10,
  },
  detailPanel: {
    background: '#fffefb',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 18,
    padding: 20,
  },
  jobButton: {
    textAlign: 'left',
    padding: '14px 16px',
    borderRadius: 16,
    border: '1px solid rgba(114, 98, 78, 0.18)',
    background: '#fffefb',
    cursor: 'pointer',
    display: 'grid',
    gap: 4,
  },
  jobButtonActive: {
    borderColor: '#2f6b5f',
    boxShadow: '0 0 0 2px rgba(47, 107, 95, 0.12)',
  },
  jobMeta: {
    color: '#7a6d5d',
    fontSize: 13,
  },
  detailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  sectionTitle: {
    margin: 0,
    color: '#2f261c',
  },
  inlineRow: {
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 12,
    marginBottom: 14,
  },
  summaryCard: {
    display: 'grid',
    gap: 4,
    padding: '14px 16px',
    borderRadius: 16,
    background: '#faf5ec',
    border: '1px solid rgba(114, 98, 78, 0.12)',
  },
  progressTrack: {
    width: '100%',
    height: 10,
    borderRadius: 999,
    background: '#eadfce',
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    background: '#2f6b5f',
  },
  tableWrap: {
    overflowX: 'auto',
    border: '1px solid rgba(114, 98, 78, 0.12)',
    borderRadius: 14,
    marginTop: 14,
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
  },
  td: {
    padding: '12px 14px',
    borderBottom: '1px solid rgba(114, 98, 78, 0.12)',
    color: '#3c3126',
    verticalAlign: 'top',
  },
  info: {
    color: '#6b6053',
  },
  error: {
    color: '#c0392b',
    fontWeight: 600,
  },
};
