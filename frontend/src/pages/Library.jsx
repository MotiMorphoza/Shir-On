import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import FilterBar from '../components/FilterBar.jsx';
import SongTable from '../components/SongTable.jsx';

const FETCH_LIMIT = 1000;

function formatFetchSummary(summary) {
  if (!summary) {
    return '';
  }

  const parts = [
    `Fetched: ${summary.fetched}`,
    `Not found: ${summary.notFound}`,
    `Errors: ${summary.errors}`,
  ];

  if (summary.details.length > 0) {
    const sample = summary.details
      .slice(0, 8)
      .map((entry) => `${entry.title || entry.id}: ${entry.message}`)
      .join(' | ');

    parts.push(sample);
  }

  return parts.join(' · ');
}

export default function Library() {
  const [songs, setSongs] = useState([]);
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await api.getSongs({
        ...filters,
        limit: FETCH_LIMIT,
        page: 1,
      });

      setSongs(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || 'Failed to load songs');
      setSongs([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const bulkPrintReady = async (val) => {
    if (!selected.size || bulkBusy) {
      return;
    }

    setBulkBusy(true);
    setError('');
    setInfo('');

    try {
      await api.bulkUpdate([...selected], { is_print_ready: val ? 1 : 0 });
      setInfo(
        val
          ? `Marked ${selected.size} song(s) as print ready.`
          : `Unmarked ${selected.size} song(s) from print ready.`
      );
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e?.message || 'Bulk update failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkFetchLyrics = async () => {
    if (!selected.size || bulkBusy) {
      return;
    }

    setBulkBusy(true);
    setError('');
    setInfo(`Fetching lyrics for ${selected.size} song(s)…`);

    const ids = [...selected];
    const currentSongsById = new Map(songs.map((song) => [song.id, song]));
    const summary = {
      fetched: 0,
      notFound: 0,
      errors: 0,
      details: [],
    };

    try {
      for (const id of ids) {
        const song = currentSongsById.get(id);

        try {
          const result = await api.fetchLyrics(id);

          if (result?.fetched) {
            summary.fetched += 1;
            continue;
          }

          summary.notFound += 1;
          summary.details.push({
            id,
            title: song?.title || '',
            message: 'No lyrics found',
          });
        } catch (e) {
          summary.errors += 1;
          summary.details.push({
            id,
            title: song?.title || '',
            message: e?.message || 'Request failed',
          });
        }
      }

      setInfo(formatFetchSummary(summary));
      setSelected(new Set());
      await load();
    } finally {
      setBulkBusy(false);
    }
  };

  const deleteSelected = async () => {
    if (!selected.size || bulkBusy) {
      return;
    }

    if (!window.confirm(`Delete ${selected.size} songs?`)) {
      return;
    }

    setBulkBusy(true);
    setError('');
    setInfo('');

    try {
      for (const id of selected) {
        await api.deleteSong(id);
      }

      setInfo(`Deleted ${selected.size} song(s).`);
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e?.message || 'Delete failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const printSelected = async () => {
    setError('');
    setInfo('');

    try {
      await api.printPdf({
        songIds: selected.size ? [...selected] : undefined,
        config: {
          format: 'A4',
          layout: 'fit-one-page-two-columns',
          includeToc: false,
          titleSeparatePage: false,
          autoFontSize: true,
        },
      });
    } catch (e) {
      setError(e?.message || 'Print failed');
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Song Library</h1>
          <p style={styles.subTitle}>
            Showing {songs.length} song(s)
            {songs.length >= FETCH_LIMIT ? ` (capped at ${FETCH_LIMIT})` : ''}
          </p>
        </div>

        <div style={styles.actions}>
          <button
            type="button"
            style={styles.btn}
            onClick={() => navigate('/songs/new')}
          >
            + Add Song
          </button>

          <button
            type="button"
            style={styles.btn}
            onClick={() => navigate('/import')}
          >
            Import
          </button>

          <button
            type="button"
            style={{ ...styles.btn, background: '#27ae60' }}
            onClick={printSelected}
          >
            Print {selected.size ? `(${selected.size})` : 'All Ready'}
          </button>
        </div>
      </div>

      <FilterBar
        filters={filters}
        onChange={(nextFilters) => {
          setFilters(nextFilters || {});
          setSelected(new Set());
          setInfo('');
          setError('');
        }}
      />

      {selected.size > 0 && (
        <div style={styles.bulk}>
          <strong>{selected.size} selected —</strong>

          <button
            type="button"
            style={styles.smBtn}
            onClick={() => bulkPrintReady(true)}
            disabled={bulkBusy}
          >
            Mark Print Ready
          </button>

          <button
            type="button"
            style={styles.smBtn}
            onClick={() => bulkPrintReady(false)}
            disabled={bulkBusy}
          >
            Unmark Print Ready
          </button>

          <button
            type="button"
            style={styles.smBtn}
            onClick={bulkFetchLyrics}
            disabled={bulkBusy}
          >
            Fetch Lyrics
          </button>

          <button
            type="button"
            style={{ ...styles.smBtn, color: '#c0392b' }}
            onClick={deleteSelected}
            disabled={bulkBusy}
          >
            Delete
          </button>
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}
      {info && <p style={styles.info}>{info}</p>}
      {(loading || bulkBusy) && <p style={styles.loading}>Loading…</p>}

      {!loading && songs.length === 0 && (
        <p style={styles.empty}>
          No songs found. Import a playlist or add a song manually.
        </p>
      )}

      <SongTable
        songs={songs}
        selected={selected}
        onSelect={setSelected}
        onOpen={(id) => navigate(`/songs/${id}`)}
      />
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '24px 16px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
    fontSize: 28,
  },
  subTitle: {
    margin: '6px 0 0',
    color: '#666',
    fontSize: 13,
  },
  actions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  btn: {
    padding: '8px 16px',
    background: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600,
  },
  bulk: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    padding: '8px 12px',
    background: '#eaf3fb',
    borderRadius: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  smBtn: {
    padding: '4px 10px',
    background: '#fff',
    border: '1px solid #ccc',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
  error: {
    color: '#c0392b',
    fontWeight: 600,
  },
  info: {
    color: '#1f618d',
    fontWeight: 600,
  },
  loading: {
    color: '#888',
  },
  empty: {
    color: '#888',
    marginTop: 40,
    textAlign: 'center',
  },
};