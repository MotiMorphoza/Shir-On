import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';

function niceReason(reason) {
  const map = {
    created: 'Created',
    existing_spotify_id: 'Existing Spotify ID',
    existing_title_artist: 'Existing title + artist',
    invalid_track_payload: 'Invalid track payload',
    failed_insert: 'Insert failed',
    no_result: 'No result',
    ok: 'Matched',
    error: 'Error',
    query_variant: 'Query Variant',
  };

  return map[reason] || reason || '—';
}

function niceAction(action) {
  const map = {
    imported: 'Imported',
    skipped: 'Skipped',
    invalid: 'Invalid',
    error: 'Error',
  };

  return map[action] || action || '—';
}

function toneForRow(row) {
  if (row.action === 'imported') return '#1e8449';
  if (row.action === 'error') return '#c0392b';
  if (row.reason === 'existing_spotify_id' || row.reason === 'existing_title_artist') return '#b9770e';
  if (row.action === 'invalid') return '#7d3c98';
  return '#555';
}

function rowKey(row, index) {
  return [
    row.spotify_id || '',
    row.provider || '',
    row.title || '',
    row.artist || '',
    index,
  ].join('::');
}

function renderSummaryLine(summary) {
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

  if (summary.skipped_existing_spotify_id !== undefined) {
    parts.push(`Existing Spotify ID: ${summary.skipped_existing_spotify_id}`);
  }
  if (summary.skipped_existing_title_artist !== undefined) {
    parts.push(`Existing title + artist: ${summary.skipped_existing_title_artist}`);
  }

  return parts.join(' · ') || '—';
}

function matchesSearch(row, q) {
  if (!q) return true;

  const hay = [
    row.title,
    row.artist,
    row.album,
    row.reason,
    row.error,
    row.provider,
    row.spotify_id,
    row.query_variant,
    row.query_title,
    row.query_artist,
    row.matched_song_id,
    row.matched_title,
    row.matched_artist,
    row.normalized_title,
    row.normalized_artist,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return hay.includes(q);
}

export default function ReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [report, setReport] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showOnlyProblems, setShowOnlyProblems] = useState(false);
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

  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const q = search.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    let next = rows;

    if (filter !== 'all') {
      next = next.filter((row) => row.action === filter);
    }

    if (showOnlyProblems) {
      next = next.filter(
        (row) =>
          row.action === 'skipped' ||
          row.action === 'invalid' ||
          row.action === 'error'
      );
    }

    if (q) {
      next = next.filter((row) => matchesSearch(row, q));
    }

    return next;
  }, [rows, filter, q, showOnlyProblems]);

  const summary = report?.summary || {};
  const isImportReport = report?.type === 'import';
  const isLyricsReport = report?.type === 'lyrics_fetch';

  return (
    <div style={styles.page}>
      <button type="button" style={styles.back} onClick={() => navigate('/reports')}>
        ← Reports
      </button>

      <h2 style={styles.title}>
        {isImportReport ? 'Import Report' : isLyricsReport ? 'Lyrics Fetch Report' : 'Report'}
      </h2>

      {loading && <p style={styles.info}>Loading report…</p>}
      {error && <p style={styles.error}>{error}</p>}

      {!loading && report && (
        <>
          <div style={styles.meta}>
            <div><strong>ID:</strong> {report.id}</div>
            <div><strong>Type:</strong> {report.type || '—'}</div>
            <div><strong>Subtype:</strong> {report.subtype || '—'}</div>
            <div><strong>Source:</strong> {report.source_id || report.title || '—'}</div>
            <div><strong>Created:</strong> {report.created_at || '—'}</div>
          </div>

          <div style={styles.summaryBar}>
            <strong>Summary:</strong> {renderSummaryLine(summary)}
          </div>

          <div style={styles.cards}>
            <div style={styles.card}>
              <strong>All rows</strong>
              <div>{rows.length}</div>
            </div>

            {summary.found !== undefined && (
              <div style={styles.card}>
                <strong>Found</strong>
                <div>{Number(summary.found || 0)}</div>
              </div>
            )}

            {summary.imported !== undefined && (
              <div style={styles.cardGreen}>
                <strong>Imported</strong>
                <div>{Number(summary.imported || 0)}</div>
              </div>
            )}

            {summary.skipped !== undefined && (
              <div style={styles.cardAmber}>
                <strong>Skipped</strong>
                <div>{Number(summary.skipped || 0)}</div>
              </div>
            )}

            {summary.invalid !== undefined && (
              <div style={styles.cardPurple}>
                <strong>Invalid</strong>
                <div>{Number(summary.invalid || 0)}</div>
              </div>
            )}

            {summary.errors !== undefined && (
              <div style={styles.cardRed}>
                <strong>Errors</strong>
                <div>{Number(summary.errors || 0)}</div>
              </div>
            )}

            {summary.skipped_existing_spotify_id !== undefined && (
              <div style={styles.cardSmall}>
                <strong>Existing Spotify ID</strong>
                <div>{Number(summary.skipped_existing_spotify_id || 0)}</div>
              </div>
            )}

            {summary.skipped_existing_title_artist !== undefined && (
              <div style={styles.cardSmall}>
                <strong>Existing title + artist</strong>
                <div>{Number(summary.skipped_existing_title_artist || 0)}</div>
              </div>
            )}
          </div>

          <div style={styles.toolbar}>
            <div style={styles.filters}>
              <button
                type="button"
                style={filter === 'all' ? styles.activeFilter : styles.filterBtn}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                style={filter === 'imported' ? styles.activeFilter : styles.filterBtn}
                onClick={() => setFilter('imported')}
              >
                Imported
              </button>
              <button
                type="button"
                style={filter === 'skipped' ? styles.activeFilter : styles.filterBtn}
                onClick={() => setFilter('skipped')}
              >
                Skipped
              </button>
              <button
                type="button"
                style={filter === 'invalid' ? styles.activeFilter : styles.filterBtn}
                onClick={() => setFilter('invalid')}
              >
                Invalid
              </button>
              <button
                type="button"
                style={filter === 'error' ? styles.activeFilter : styles.filterBtn}
                onClick={() => setFilter('error')}
              >
                Error
              </button>
            </div>

            <div style={styles.searchWrap}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, artist, album, reason, spotify id…"
                style={styles.searchInput}
              />

              <label style={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={showOnlyProblems}
                  onChange={(e) => setShowOnlyProblems(e.target.checked)}
                />
                Problems only
              </label>
            </div>
          </div>

          <div style={styles.resultCount}>
            Showing {filteredRows.length} / {rows.length} row(s)
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Title</th>
                  <th style={styles.th}>Artist</th>
                  <th style={styles.th}>Album</th>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>Reason</th>
                  <th style={styles.th}>Provider</th>
                  <th style={styles.th}>Spotify ID</th>
                  <th style={styles.th}>Matched Existing</th>
                  <th style={styles.th}>Normalized</th>
                  <th style={styles.th}>Query Used</th>
                  <th style={styles.th}>Error</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={rowKey(row, index)}>
                    <td style={styles.td}>{index + 1}</td>

                    <td style={styles.td}>
                      <div style={styles.mainCell}>{row.title || '—'}</div>
                    </td>

                    <td style={styles.td}>
                      <div style={styles.mainCell}>{row.artist || '—'}</div>
                    </td>

                    <td style={styles.td}>
                      <div style={styles.mainCell}>{row.album || '—'}</div>
                    </td>

                    <td style={{ ...styles.td, color: toneForRow(row), fontWeight: 700 }}>
                      {niceAction(row.action)}
                    </td>

                    <td style={styles.td}>
                      <div style={styles.mainCell}>{niceReason(row.reason)}</div>
                    </td>

                    <td style={styles.td}>
                      <div style={styles.mono}>{row.provider || '—'}</div>
                    </td>

                    <td style={styles.td}>
                      <div style={styles.mono}>{row.spotify_id || '—'}</div>
                    </td>

                    <td style={styles.td}>
                      {row.matched_song_id || row.matched_title || row.matched_artist ? (
                        <div style={styles.stack}>
                          <div><strong>ID:</strong> {row.matched_song_id || '—'}</div>
                          <div><strong>Title:</strong> {row.matched_title || '—'}</div>
                          <div><strong>Artist:</strong> {row.matched_artist || '—'}</div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td style={styles.td}>
                      {row.normalized_title || row.normalized_artist ? (
                        <div style={styles.stack}>
                          <div><strong>Title:</strong> {row.normalized_title || '—'}</div>
                          <div><strong>Artist:</strong> {row.normalized_artist || '—'}</div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td style={styles.td}>
                      {row.query_variant || row.query_title || row.query_artist ? (
                        <div style={styles.stack}>
                          <div><strong>Variant:</strong> {row.query_variant || '—'}</div>
                          <div><strong>Title:</strong> {row.query_title || '—'}</div>
                          <div><strong>Artist:</strong> {row.query_artist || '—'}</div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td style={styles.tdError}>
                      <div style={styles.mainCell}>{row.error || '—'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!filteredRows.length && (
            <p style={styles.info}>No rows match the current filters.</p>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1700,
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
  title: {
    marginTop: 0,
    marginBottom: 18,
  },
  meta: {
    display: 'flex',
    gap: 20,
    flexWrap: 'wrap',
    marginBottom: 16,
    color: '#555',
  },
  summaryBar: {
    marginBottom: 16,
    padding: '12px 14px',
    border: '1px solid #dfe6e9',
    borderRadius: 8,
    background: '#fafafa',
  },
  cards: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  card: {
    minWidth: 120,
    padding: '12px 14px',
    background: '#f8f9fa',
    border: '1px solid #ddd',
    borderRadius: 8,
  },
  cardGreen: {
    minWidth: 120,
    padding: '12px 14px',
    background: '#eafaf1',
    border: '1px solid #a9dfbf',
    borderRadius: 8,
  },
  cardAmber: {
    minWidth: 120,
    padding: '12px 14px',
    background: '#fef5e7',
    border: '1px solid #f8c471',
    borderRadius: 8,
  },
  cardPurple: {
    minWidth: 120,
    padding: '12px 14px',
    background: '#f5eef8',
    border: '1px solid #d2b4de',
    borderRadius: 8,
  },
  cardRed: {
    minWidth: 120,
    padding: '12px 14px',
    background: '#fdedec',
    border: '1px solid #f5b7b1',
    borderRadius: 8,
  },
  cardSmall: {
    minWidth: 180,
    padding: '12px 14px',
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  filters: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  searchWrap: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  searchInput: {
    width: 360,
    maxWidth: '100%',
    padding: '8px 12px',
    border: '1px solid #ccc',
    borderRadius: 4,
  },
  checkLabel: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    fontSize: 14,
    color: '#444',
  },
  resultCount: {
    color: '#666',
    marginBottom: 12,
    fontSize: 14,
  },
  filterBtn: {
    padding: '7px 12px',
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
  },
  activeFilter: {
    padding: '7px 12px',
    border: '1px solid #3498db',
    borderRadius: 4,
    background: '#3498db',
    color: '#fff',
    cursor: 'pointer',
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
    verticalAlign: 'top',
  },
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #eee',
    verticalAlign: 'top',
  },
  tdError: {
    padding: '8px 12px',
    borderBottom: '1px solid #eee',
    verticalAlign: 'top',
    color: '#c0392b',
  },
  mainCell: {
    minWidth: 140,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  mono: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  stack: {
    display: 'grid',
    gap: 4,
    minWidth: 180,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  info: {
    color: '#666',
  },
  error: {
    color: '#c0392b',
    fontWeight: 600,
  },
};