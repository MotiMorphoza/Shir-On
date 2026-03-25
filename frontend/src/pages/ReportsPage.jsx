import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';

function renderSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    return '—';
  }

  const parts = [];

  if (summary.found !== undefined) parts.push(`Found: ${summary.found}`);
  if (summary.imported !== undefined) parts.push(`Imported: ${summary.imported}`);
  if (summary.skipped !== undefined) parts.push(`Skipped: ${summary.skipped}`);
  if (summary.invalid !== undefined) parts.push(`Invalid: ${summary.invalid}`);
  if (summary.errors !== undefined) parts.push(`Errors: ${summary.errors}`);
  if (summary.fetched !== undefined) parts.push(`Fetched: ${summary.fetched ? 'Yes' : 'No'}`);

  return parts.join(' · ') || '—';
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const data = await api.getReports({
          type,
          limit: 200,
        });

        if (!cancelled) {
          setReports(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load reports');
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
  }, [type]);

  return (
    <div style={styles.page}>
      <button type="button" style={styles.back} onClick={() => navigate('/')}>
        ← Library
      </button>

      <div style={styles.header}>
        <h2 style={styles.title}>Reports</h2>

        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={styles.select}
        >
          <option value="">All Reports</option>
          <option value="import">Import Reports</option>
          <option value="lyrics_fetch">Lyrics Fetch Reports</option>
        </select>
      </div>

      {loading && <p style={styles.info}>Loading reports…</p>}
      {error && <p style={styles.error}>{error}</p>}

      {!loading && reports.length === 0 && (
        <p style={styles.info}>No reports found.</p>
      )}

      {!loading && reports.length > 0 && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Created</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Subtype</th>
                <th style={styles.th}>Source</th>
                <th style={styles.th}>Summary</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td style={styles.td}>{report.created_at || '—'}</td>
                  <td style={styles.td}>{report.type || '—'}</td>
                  <td style={styles.td}>{report.subtype || '—'}</td>
                  <td style={styles.td}>{report.source_id || report.title || '—'}</td>
                  <td style={styles.td}>{renderSummary(report.summary)}</td>
                  <td style={styles.td}>
                    <button
                      type="button"
                      style={styles.openBtn}
                      onClick={() => navigate(`/reports/${report.id}`)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '24px 16px 48px',
  },
  back: {
    background: 'none',
    border: 'none',
    color: '#3498db',
    cursor: 'pointer',
    padding: 0,
    marginBottom: 12,
    fontSize: 14,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  title: {
    margin: 0,
  },
  select: {
    padding: '8px 12px',
    border: '1px solid #ccc',
    borderRadius: 4,
  },
  info: {
    color: '#666',
  },
  error: {
    color: '#c0392b',
    fontWeight: 600,
  },
  tableWrap: {
    overflowX: 'auto',
    border: '1px solid #e5e5e5',
    borderRadius: 8,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    background: '#f8f8f8',
    borderBottom: '1px solid #ddd',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #eee',
    verticalAlign: 'top',
  },
  openBtn: {
    padding: '6px 10px',
    border: '1px solid #bbb',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
  },
};