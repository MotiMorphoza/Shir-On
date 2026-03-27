import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import FilterBar from '../components/FilterBar.jsx';
import SongTable from '../components/SongTable.jsx';
import SpotifyImportCard from '../components/SpotifyImportCard.jsx';

const FETCH_LIMIT = 1000;
const LIBRARY_VIEW_KEY = 'shir_on_library_view';
const PENDING_COLLECTION_ADD_KEY = 'shir_on_pending_collection_add';
const DEFAULT_FILTERS = {
  search: '',
  status: '',
  year: '',
  sort: 'artist',
};

function normalizeLibraryFilters(raw = {}) {
  return {
    search: typeof raw?.search === 'string' ? raw.search : '',
    status: typeof raw?.status === 'string' ? raw.status : '',
    year: typeof raw?.year === 'string' ? raw.year : '',
    sort: typeof raw?.sort === 'string' ? raw.sort : 'artist',
  };
}

function isHebrewText(value = '') {
  return /[\u0590-\u05FF]/.test(String(value || ''));
}

function readLibraryView() {
  if (typeof window === 'undefined') {
    return {
      filters: DEFAULT_FILTERS,
      playlistId: '',
    };
  }

  try {
    const raw = window.localStorage.getItem(LIBRARY_VIEW_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    return {
      filters: normalizeLibraryFilters(parsed?.filters || {}),
      playlistId: typeof parsed?.playlistId === 'string' ? parsed.playlistId : '',
    };
  } catch {
    return {
      filters: DEFAULT_FILTERS,
      playlistId: '',
    };
  }
}

function getPlaylistScope(playlists, playlistId) {
  if (!playlistId) {
    return {
      title: 'Library',
      description: 'Entire library',
    };
  }

  const playlist = playlists.find((entry) => entry.id === playlistId);

  return {
    title: playlist?.name || 'Selected Playlist',
    description: `${playlist?.songs_count || 0} linked song(s)`,
  };
}

export default function Library() {
  const navigate = useNavigate();
  const initialView = useMemo(() => readLibraryView(), []);

  const [songs, setSongs] = useState([]);
  const [filters, setFilters] = useState(initialView.filters);
  const [selected, setSelected] = useState(new Set());
  const [playlists, setPlaylists] = useState([]);
  const [playlistId, setPlaylistId] = useState(initialView.playlistId);
  const [loading, setLoading] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [spotifyImportInput, setSpotifyImportInput] = useState('');

  const scope = useMemo(() => getPlaylistScope(playlists, playlistId), [playlists, playlistId]);
  const summary = useMemo(() => {
    const withLyrics = songs.filter((song) => song.lyrics_status && song.lyrics_status !== 'missing').length;
    const missingLyrics = songs.filter((song) => (song.lyrics_status || 'missing') === 'missing').length;
    const artistCount = new Set(songs.map((song) => song.artist_name || 'Unknown Artist')).size;

    return {
      total: songs.length,
      withLyrics,
      missingLyrics,
      artistCount,
    };
  }, [songs]);

  const loadSongs = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await api.getSongs({
        ...filters,
        playlistId,
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
  }, [filters, playlistId]);

  const loadPlaylists = useCallback(async () => {
    try {
      const data = await api.getPlaylists();
      setPlaylists(Array.isArray(data) ? data : []);
    } catch {
      setPlaylists([]);
    }
  }, []);

  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(
        LIBRARY_VIEW_KEY,
        JSON.stringify({
          filters,
          playlistId,
        })
      );
    } catch {
      // Ignore localStorage write failures in restricted contexts.
    }
  }, [filters, playlistId]);

  async function deleteSelected() {
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
      await loadSongs();
    } catch (e) {
      setError(e?.message || 'Delete failed');
    } finally {
      setBulkBusy(false);
    }
  }

  function addSelectedToCollection() {
    if (!selected.size || bulkBusy) {
      return;
    }

    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          PENDING_COLLECTION_ADD_KEY,
          JSON.stringify({
            songIds: [...selected],
          })
        );
      }
    } catch {
      // Ignore sessionStorage failures and still navigate.
    }

    navigate('/collections?pending_add=1');
  }

  async function printSelected() {
    setError('');
    setInfo('');

    try {
      const targetIds = selected.size ? [...selected] : songs.map((song) => song.id);
      const bookTitle = playlistId ? scope.title : 'All Songs';

      if (targetIds.length === 0) {
        setInfo('No visible songs to print.');
        return;
      }

      await api.printPdf({
        songIds: targetIds,
        config: {
          format: 'A4',
          includeToc: true,
          songsPerPage: 2,
          bookTitle,
          playlistId: playlistId || '',
          tocStartColumn: isHebrewText(bookTitle) ? 'right' : 'left',
        },
      });

      setInfo(
        selected.size
          ? `Opened print preview for ${targetIds.length} selected song(s).`
          : `Opened print preview for ${targetIds.length} visible song(s).`
      );
    } catch (e) {
      setError(e?.message || 'Print failed');
    }
  }

  function openLyricsRun() {
    const ids = selected.size ? [...selected] : songs.map((song) => song.id);
    navigate(`/lyrics-run?ids=${ids.join(',')}`);
  }

  function openSpotifyImport() {
    if (!spotifyImportInput.trim()) {
      return;
    }

    navigate(
      `/import?spotify_input=${encodeURIComponent(spotifyImportInput)}&autostart=1`
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerPanel}>
        <header style={styles.header}>
          <div style={styles.headerCopy}>
            <h1 style={styles.title}>{scope.title}</h1>
            <p style={styles.subTitle}>
              {scope.description} | {songs.length} visible song(s)
              {songs.length >= FETCH_LIMIT ? ` (capped at ${FETCH_LIMIT})` : ''}
            </p>
          </div>

          <div style={styles.spotifyImportShell}>
            <div style={styles.spotifyImportCard}>
              <SpotifyImportCard
                flat
                value={spotifyImportInput}
                onChange={setSpotifyImportInput}
                onSubmit={openSpotifyImport}
                subtitle=""
                hideFooterButton
                disabled={!spotifyImportInput.trim()}
                headerAction={(
                  <button
                    type="button"
                    style={styles.spotifyImportBtn}
                    onClick={openSpotifyImport}
                    disabled={!spotifyImportInput.trim()}
                  >
                    IMPORT
                  </button>
                )}
              />
            </div>
          </div>

          <div style={styles.headerActions}>
            <button type="button" style={{ ...styles.secondaryBtn, ...styles.headerActionBtn }} onClick={openLyricsRun}>
              FETCH LYRICS
            </button>
            <button type="button" style={{ ...styles.primaryBtn, ...styles.headerActionBtn }} onClick={printSelected}>
              PRINT
            </button>
          </div>
        </header>
      </div>

      <FilterBar
        filters={filters}
        playlistId={playlistId}
        playlists={playlists}
        onPlaylistChange={(nextPlaylistId) => {
          setPlaylistId(nextPlaylistId);
          setSelected(new Set());
          setInfo('');
          setError('');
        }}
        onChange={(nextFilters) => {
          setFilters({
            ...DEFAULT_FILTERS,
            ...(nextFilters || {}),
          });
          setSelected(new Set());
          setInfo('');
          setError('');
        }}
      />

      <div style={styles.actionBar}>
        <div style={styles.actionBarLeft}>
          <strong>{selected.size} selected</strong>

          <button
            type="button"
            style={styles.bulkBtn}
            onClick={addSelectedToCollection}
            disabled={bulkBusy || !selected.size}
          >
            Add to Collection
          </button>

          <button type="button" style={styles.bulkBtn} onClick={deleteSelected} disabled={bulkBusy || !selected.size}>
            Delete Selected
          </button>
        </div>

        <div style={styles.actionBarStats}>
          <span style={styles.scopeChip}>{summary.total} visible</span>
          <span style={styles.scopeChip}>{summary.artistCount} artists</span>
          <span style={styles.scopeChip}>{summary.withLyrics} with lyrics</span>
          <span style={styles.scopeChip}>{summary.missingLyrics} missing</span>
        </div>
      </div>

      {error && <p style={styles.error}>{error}</p>}
      {info && <p style={styles.info}>{info}</p>}
      {(loading || bulkBusy) && <p style={styles.loading}>Loading...</p>}

      {!loading && songs.length === 0 && (
        <p style={styles.empty}>No songs match the current library scope.</p>
      )}

      <SongTable
        songs={songs}
        selected={selected}
        onSelect={setSelected}
        onOpen={(id) => navigate(`/songs/${id}`)}
        groupByArtist={filters.sort !== 'title'}
      />
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '28px 20px 48px',
  },
  headerPanel: {
    background: '#fffefb',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 22,
    padding: '22px 22px 18px',
    boxShadow: '0 14px 30px rgba(77, 60, 35, 0.05)',
    marginBottom: 16,
  },
  header: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 460px) minmax(0, 1fr)',
    alignItems: 'flex-start',
    gap: 24,
    width: '100%',
  },
  headerCopy: {
    minWidth: 0,
    textAlign: 'left',
    gridColumn: 1,
  },
  headerActions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
    gridColumn: 3,
    justifySelf: 'end',
    width: 210,
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
  headerActionBtn: {
    width: '100%',
    textAlign: 'center',
  },
  spotifyImportShell: {
    gridColumn: 2,
    justifySelf: 'center',
    alignSelf: 'flex-start',
    width: '100%',
  },
  spotifyImportCard: {
    width: '100%',
  },
  spotifyImportBtn: {
    padding: '10px 16px',
    borderRadius: 999,
    border: 'none',
    background: '#2f6b5f',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.04em',
  },
  scopeChip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 12px',
    borderRadius: 999,
    background: '#f5efe4',
    color: '#5f5040',
    fontWeight: 700,
    fontSize: 13,
  },
  actionBar: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    background: '#f7f2e8',
    border: '1px solid rgba(114, 98, 78, 0.14)',
    borderRadius: 16,
    marginBottom: 12,
    flexWrap: 'wrap',
    color: '#4a3f31',
  },
  actionBarLeft: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  actionBarStats: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  bulkBtn: {
    padding: '8px 12px',
    background: '#fff',
    border: '1px solid #d0d8d2',
    borderRadius: 999,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    color: '#32443d',
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
    color: '#6b6053',
  },
  empty: {
    color: '#6b6053',
    marginTop: 40,
    textAlign: 'center',
  },
};
