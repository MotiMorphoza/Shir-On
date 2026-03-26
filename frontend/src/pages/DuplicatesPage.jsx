import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import BackToLibraryButton from '../components/BackToLibraryButton.jsx';

function conflictFields(group) {
  const fields = [
    ['title', group.map((song) => song.title || '')],
    ['artist', group.map((song) => song.artist_name || '')],
    ['album', group.map((song) => song.album_title || '')],
    ['year', group.map((song) => String(song.year || ''))],
    ['spotify_id', group.map((song) => song.spotify_id || '')],
    ['lyrics_status', group.map((song) => song.lyrics_status || '')],
  ];

  return fields
    .filter(([, values]) => new Set(values).size > 1)
    .map(([field]) => field);
}

export default function DuplicatesPage() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyGroup, setBusyGroup] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const data = await api.getDuplicates();
      setGroups(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || 'Failed to load duplicates');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function mergeGroup(group) {
    const keepId = group[0]?.id;
    const mergeIds = group.slice(1).map((song) => song.id);

    if (!keepId || mergeIds.length === 0) {
      return;
    }

    setBusyGroup(keepId);
    setError('');
    setInfo('');

    try {
      await api.mergeSongs({
        keepId,
        mergeIds,
        useMetadataFrom: keepId,
        useLyricsFrom: keepId,
      });
      setInfo(`Merged duplicate group into "${group[0].title}".`);
      await load();
    } catch (e) {
      setError(e?.message || 'Merge failed');
    } finally {
      setBusyGroup('');
    }
  }

  async function deleteSong(songId) {
    if (!window.confirm('Delete this duplicate entry?')) {
      return;
    }

    setBusyGroup(songId);
    setError('');
    setInfo('');

    try {
      await api.deleteSong(songId);
      setInfo('Duplicate entry deleted.');
      await load();
    } catch (e) {
      setError(e?.message || 'Delete failed');
    } finally {
      setBusyGroup('');
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Review</p>
          <h1 style={styles.title}>Duplicates</h1>
        </div>

        <div style={styles.headerActions}>
          <BackToLibraryButton />
          <div style={styles.countCard}>
            <strong>{groups.length}</strong>
            <span>duplicate groups</span>
          </div>
        </div>
      </header>

      {loading && <p style={styles.info}>Loading duplicate groups...</p>}
      {error && <p style={styles.error}>{error}</p>}
      {info && <p style={styles.success}>{info}</p>}

      {!loading && groups.length === 0 && (
        <p style={styles.info}>No duplicates were found.</p>
      )}

      <div style={styles.groups}>
        {groups.map((group, index) => {
          const key = group.map((song) => song.id).join(':');
          const conflicts = conflictFields(group);

          return (
            <section key={key} style={styles.groupCard}>
              <div style={styles.groupHeader}>
                <div>
                  <p style={styles.groupLabel}>Group {index + 1}</p>
                  <h2 style={styles.groupTitle}>
                    {group[0]?.title || 'Untitled'} / {group[0]?.artist_name || 'Unknown Artist'}
                  </h2>
                  <p style={styles.groupReason}>
                    Flagged because title + artist normalize to the same key. The first row stays unless you open songs and choose differently.
                  </p>
                </div>

                <button
                  type="button"
                  style={styles.mergeBtn}
                  onClick={() => mergeGroup(group)}
                  disabled={Boolean(busyGroup)}
                >
                  Merge Into First Song
                </button>
              </div>

              <div style={styles.conflictBox}>
                <strong>Conflicting fields:</strong>{' '}
                {conflicts.length > 0 ? conflicts.join(', ') : 'No major conflicts beyond duplicate identity'}
              </div>

              <div style={styles.songList}>
                {group.map((song) => (
                  <article key={song.id} style={styles.songCard}>
                    <div style={styles.songMain}>
                      <strong>{song.title}</strong>
                      <span>{song.artist_name || 'Unknown Artist'}</span>
                      <span>Album: {song.album_title || 'Single'}</span>
                      <span>Year: {song.year || '-'}</span>
                      <span>Lyrics: {song.lyrics_status || '-'}</span>
                      <span>Spotify ID: {song.spotify_id || '-'}</span>
                    </div>

                    <div style={styles.songActions}>
                      <Link to={`/songs/${song.id}`} style={styles.openLink}>
                        Open
                      </Link>
                      <button
                        type="button"
                        style={styles.deleteBtn}
                        onClick={() => deleteSong(song.id)}
                        disabled={busyGroup === song.id}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
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
  },
  countCard: {
    display: 'grid',
    gap: 4,
    minWidth: 120,
    padding: '14px 16px',
    borderRadius: 18,
    background: '#fffdf8',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    textAlign: 'center',
  },
  headerActions: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  groups: {
    display: 'grid',
    gap: 18,
  },
  groupCard: {
    background: '#fffefb',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 18,
    padding: 20,
    boxShadow: '0 14px 30px rgba(77, 60, 35, 0.06)',
  },
  groupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  groupLabel: {
    margin: 0,
    color: '#8b7a65',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  groupTitle: {
    margin: '4px 0 6px',
    color: '#2b241c',
    fontSize: 24,
  },
  groupReason: {
    margin: 0,
    color: '#6d6152',
  },
  conflictBox: {
    padding: '12px 14px',
    borderRadius: 14,
    background: '#f8f3ea',
    color: '#4f4336',
    marginBottom: 14,
  },
  mergeBtn: {
    padding: '10px 14px',
    borderRadius: 999,
    border: 'none',
    background: '#2f6b5f',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
  songList: {
    display: 'grid',
    gap: 10,
  },
  songCard: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 16px',
    borderRadius: 14,
    background: '#fffaf0',
    border: '1px solid rgba(114, 98, 78, 0.16)',
    flexWrap: 'wrap',
  },
  songMain: {
    display: 'grid',
    gap: 4,
    color: '#3f352a',
  },
  songActions: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
  },
  openLink: {
    textDecoration: 'none',
    color: '#2f6b5f',
    fontWeight: 700,
  },
  deleteBtn: {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid #d5c1bb',
    background: '#fff',
    color: '#b03a2e',
    fontWeight: 700,
    cursor: 'pointer',
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
