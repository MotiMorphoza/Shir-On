import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

const SONGBOOK_VIEW_KEY = 'shir_on_songbook_view';
const SONGBOOK_RETURN_KEY = 'shir_on_songbook_return';
const SONGBOOK_NAV_RESET_KEY = 'shir_on_songbook_nav_reset';

function isHebrewText(value = '') {
  return /[\u0590-\u05FF]/.test(String(value || ''));
}

function readSongbookView() {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(SONGBOOK_VIEW_KEY) || '';
  } catch {
    return '';
  }
}

function storeSongbookReturn(target) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(SONGBOOK_RETURN_KEY, JSON.stringify(target || {}));
  } catch {
    // Ignore sessionStorage failures in restricted contexts.
  }
}

function readSongbookReturn() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(SONGBOOK_RETURN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSongbookReturn() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(SONGBOOK_RETURN_KEY);
  } catch {
    // Ignore sessionStorage failures in restricted contexts.
  }
}

function readSongbookNavReset() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.sessionStorage.getItem(SONGBOOK_NAV_RESET_KEY) === '1';
  } catch {
    return false;
  }
}

function clearSongbookNavReset() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(SONGBOOK_NAV_RESET_KEY);
  } catch {
    // Ignore sessionStorage failures in restricted contexts.
  }
}

function groupSongsByArtist(songs) {
  const groups = new Map();

  for (const song of songs) {
    const key = song.artist_name || 'Unknown Artist';

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(song);
  }

  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([artist, artistSongs]) => ({
      artist,
      songs: [...artistSongs].sort((a, b) => (a.title || '').localeCompare(b.title || '')),
    }));
}

export default function SongbookPage() {
  const tocCardRef = useRef(null);
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(() => readSongbookView());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

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
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const data = await api.getSongs({
          limit: 2000,
          sort: 'artist',
          playlistId: selectedPlaylistId,
          status: 'has_lyrics',
        });

        if (!cancelled) {
          setSongs(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load songbook');
          setSongs([]);
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
  }, [selectedPlaylistId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(SONGBOOK_VIEW_KEY, selectedPlaylistId || '');
    } catch {
      // Ignore localStorage failures in restricted contexts.
    }
  }, [selectedPlaylistId]);

  useEffect(() => {
    if (loading || error || songs.length === 0 || typeof window === 'undefined') {
      return;
    }

    if (readSongbookNavReset()) {
      const reset = window.requestAnimationFrame(() => {
        if (tocCardRef.current) {
          tocCardRef.current.scrollTop = 0;
        }

        window.scrollTo({ top: 0, behavior: 'auto' });
        clearSongbookReturn();
        clearSongbookNavReset();
      });

      return () => window.cancelAnimationFrame(reset);
    }

    const pendingReturn = readSongbookReturn();

    if (!pendingReturn?.songId) {
      return;
    }

    if ((pendingReturn.playlistId || '') !== (selectedPlaylistId || '')) {
      return;
    }

    const restore = window.requestAnimationFrame(() => {
      if (tocCardRef.current) {
        if (typeof pendingReturn.tocScrollTop === 'number') {
          tocCardRef.current.scrollTop = pendingReturn.tocScrollTop;
        } else {
          const tocLink = document.getElementById(`toc-song-${pendingReturn.songId}`);
          tocLink?.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
      }

      const songElement = document.getElementById(`song-${pendingReturn.songId}`);

      if (songElement) {
        songElement.scrollIntoView({ block: 'start', behavior: 'auto' });
      } else if (typeof pendingReturn.scrollY === 'number') {
        window.scrollTo({ top: pendingReturn.scrollY, behavior: 'auto' });
      }

      clearSongbookReturn();
    });

    return () => window.cancelAnimationFrame(restore);
  }, [loading, error, songs, selectedPlaylistId]);

  const artistGroups = useMemo(() => groupSongsByArtist(songs), [songs]);
  const selectedPlaylistName = useMemo(() => {
    if (!selectedPlaylistId) {
      return 'All songs';
    }

    return playlists.find((playlist) => playlist.id === selectedPlaylistId)?.name || 'Selected playlist';
  }, [playlists, selectedPlaylistId]);

  async function printSongbook() {
    setError('');
    setInfo('');

    try {
      const songIds = songs.map((song) => song.id).filter(Boolean);

      if (songIds.length === 0) {
        setInfo('No songs in the current songbook scope.');
        return;
      }

      await api.printPdf({
        songIds,
        config: {
          format: 'A4',
          includeToc: true,
          songsPerPage: 2,
        },
      });

      setInfo(`Opened print preview for ${songIds.length} song(s).`);
    } catch (e) {
      setError(e?.message || 'Failed to print songbook');
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Digital Songbook</h1>
          <p style={styles.subTitle}>
            {selectedPlaylistName} | {songs.length} song(s) | {artistGroups.length} artist group(s)
          </p>
        </div>

        <div style={styles.headerActions}>
          <button type="button" style={styles.primaryBtn} onClick={printSongbook}>
            Print Songbook
          </button>
          <label style={styles.filterField}>
            <select
              value={selectedPlaylistId}
              onChange={(e) => setSelectedPlaylistId(e.target.value)}
              style={styles.select}
            >
              <option value="">All songs</option>
              {playlists.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {loading && <p style={styles.info}>Loading songbook...</p>}
      {error && <p style={styles.error}>{error}</p>}
      {info && <p style={styles.info}>{info}</p>}

      {!loading && !error && (
        <div style={styles.layout}>
          <aside style={styles.toc}>
            <div ref={tocCardRef} style={styles.tocCard}>
              <strong style={styles.tocTitle}>Table of Contents</strong>
              <p style={styles.tocHint}>
                {selectedPlaylistName} | {songs.length} songs
              </p>

              {artistGroups.map((group) => (
                <div key={group.artist} style={styles.tocGroup}>
                  <div
                    style={{
                      ...styles.tocArtist,
                      direction: isHebrewText(group.artist) ? 'rtl' : 'ltr',
                      textAlign: isHebrewText(group.artist) ? 'right' : 'left',
                    }}
                  >
                    {group.artist}
                  </div>
                  {group.songs.map((song) => (
                    <a
                      key={song.id}
                      id={`toc-song-${song.id}`}
                      href={`#song-${song.id}`}
                      style={styles.tocLink}
                    >
                      {song.title}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </aside>

          <main style={styles.book}>
            {artistGroups.map((group) => (
              <section key={group.artist} style={styles.artistSection}>
                <h2 style={styles.artistHeading}>{group.artist}</h2>

                {group.songs.map((song) => {
                  const rtl = isHebrewText(song.title) || isHebrewText(song.lyrics?.text);
                  const metaParts = [song.album_title || 'Single', song.year || ''].filter(Boolean);
                  const headerTextStyle = {
                    direction: rtl ? 'rtl' : 'ltr',
                    textAlign: rtl ? 'right' : 'left',
                  };

                  return (
                    <article
                      key={song.id}
                      id={`song-${song.id}`}
                      style={styles.songCard}
                    >
                      <div
                        style={{
                          ...styles.songHeader,
                          flexDirection: rtl ? 'row-reverse' : 'row',
                        }}
                      >
                        <div
                          style={{
                            ...styles.songHeaderMain,
                            ...headerTextStyle,
                          }}
                        >
                          <h3 style={styles.songTitle}>
                            {song.title}
                          </h3>
                          <p style={styles.songArtist}>
                            {song.artist_name || 'Unknown Artist'}
                          </p>
                          <p style={styles.songMeta}>
                            {metaParts.join(' | ')}
                          </p>
                        </div>

                        <Link
                          to={`/songs/${song.id}`}
                          style={styles.openLink}
                          onClick={() =>
                            storeSongbookReturn({
                              songId: song.id,
                              playlistId: selectedPlaylistId || '',
                              scrollY: window.scrollY,
                              tocScrollTop: tocCardRef.current?.scrollTop || 0,
                            })
                          }
                        >
                          Open
                        </Link>
                      </div>

                      <div
                        style={{
                          ...styles.lyrics,
                          direction: rtl ? 'rtl' : 'ltr',
                          textAlign: rtl ? 'right' : 'left',
                        }}
                      >
                        {song.lyrics?.text ? (
                          song.lyrics.text
                        ) : (
                          <span style={styles.missing}>Lyrics not available yet.</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}

            {!artistGroups.length && (
              <p style={styles.info}>No songs match the current reading mode.</p>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1440,
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
    fontSize: 42,
    color: '#2c241b',
  },
  subTitle: {
    margin: 0,
    color: '#6b6053',
    lineHeight: 1.6,
  },
  headerActions: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
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
  layout: {
    display: 'grid',
    gridTemplateColumns: '280px minmax(0, 1fr)',
    gap: 24,
    alignItems: 'start',
  },
  toc: {
    position: 'sticky',
    top: 96,
  },
  tocCard: {
    background: '#fffdf8',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 18,
    padding: 18,
    maxHeight: 'calc(100vh - 130px)',
    overflowY: 'auto',
  },
  tocTitle: {
    display: 'block',
    color: '#2f281f',
    fontSize: 16,
    marginBottom: 4,
  },
  tocHint: {
    margin: '0 0 16px',
    color: '#847564',
    fontSize: 13,
  },
  tocGroup: {
    marginBottom: 16,
    display: 'grid',
    gap: 6,
  },
  tocArtist: {
    fontWeight: 700,
    color: '#44382b',
    fontSize: 13,
  },
  tocLink: {
    color: '#5a4d3f',
    textDecoration: 'none',
    fontSize: 13,
  },
  book: {
    display: 'grid',
    gap: 24,
  },
  artistSection: {
    display: 'grid',
    gap: 14,
  },
  artistHeading: {
    margin: 0,
    paddingBottom: 10,
    borderBottom: '1px solid rgba(114, 98, 78, 0.18)',
    color: '#2f261c',
    fontSize: 26,
  },
  songCard: {
    background: '#fffefb',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 18,
    padding: 20,
    boxShadow: '0 14px 30px rgba(77, 60, 35, 0.06)',
    scrollMarginTop: 132,
  },
  songHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  songHeaderMain: {
    display: 'grid',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  songTitle: {
    margin: 0,
    fontSize: 24,
    color: '#241d15',
  },
  songArtist: {
    margin: 0,
    color: '#4d4236',
    fontSize: 15,
    fontWeight: 700,
  },
  songMeta: {
    margin: 0,
    color: '#7e6f5c',
    fontSize: 13,
  },
  openLink: {
    textDecoration: 'none',
    color: '#2f6b5f',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  lyrics: {
    whiteSpace: 'pre-wrap',
    lineHeight: 1.95,
    fontSize: 17,
    color: '#2f271e',
  },
  missing: {
    color: '#8a7c6e',
    fontStyle: 'italic',
  },
  info: {
    color: '#6b6053',
  },
  error: {
    color: '#c0392b',
    fontWeight: 600,
  },
};
