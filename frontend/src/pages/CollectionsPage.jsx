import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import BackToLibraryButton from '../components/BackToLibraryButton.jsx';

export default function CollectionsPage() {
  const navigate = useNavigate();

  const [collections, setCollections] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function loadCollections(preferredId = '') {
    setLoading(true);
    setError('');

    try {
      const data = await api.getCollections();
      const list = Array.isArray(data) ? data : [];
      setCollections(list);

      const nextId =
        preferredId ||
        (list.some((collection) => collection.id === selectedId)
          ? selectedId
          : list[0]?.id || '');

      setSelectedId(nextId);
    } catch (e) {
      setError(e?.message || 'Failed to load collections');
      setCollections([]);
      setSelectedId('');
    } finally {
      setLoading(false);
    }
  }

  async function loadCollectionDetail(collectionId) {
    if (!collectionId) {
      setSelectedCollection(null);
      return;
    }

    setDetailLoading(true);
    setError('');

    try {
      const data = await api.getCollection(collectionId);
      setSelectedCollection(data || null);
    } catch (e) {
      setError(e?.message || 'Failed to load collection');
      setSelectedCollection(null);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadCollections();
  }, []);

  useEffect(() => {
    loadCollectionDetail(selectedId);
  }, [selectedId]);

  async function createCollection(event) {
    event.preventDefault();

    const cleanName = name.trim();
    if (!cleanName) {
      return;
    }

    setBusy(true);
    setError('');
    setInfo('');

    try {
      const created = await api.createCollection(cleanName, description.trim());
      setName('');
      setDescription('');
      setInfo('Collection created.');
      await loadCollections(created?.id || '');
    } catch (e) {
      setError(e?.message || 'Failed to create collection');
    } finally {
      setBusy(false);
    }
  }

  async function removeSong(songId) {
    if (!selectedId || !songId || busy) {
      return;
    }

    setBusy(true);
    setError('');
    setInfo('');

    try {
      await api.removeFromCollection(selectedId, songId);
      setInfo('Song removed from collection.');
      await Promise.all([loadCollections(selectedId), loadCollectionDetail(selectedId)]);
    } catch (e) {
      setError(e?.message || 'Failed to remove song');
    } finally {
      setBusy(false);
    }
  }

  async function removeCollection() {
    if (!selectedId || busy) {
      return;
    }

    if (!window.confirm('Delete this collection?')) {
      return;
    }

    setBusy(true);
    setError('');
    setInfo('');

    try {
      await api.deleteCollection(selectedId);
      setSelectedCollection(null);
      setInfo('Collection deleted.');
      await loadCollections('');
    } catch (e) {
      setError(e?.message || 'Failed to delete collection');
    } finally {
      setBusy(false);
    }
  }

  async function printCollection() {
    if (!selectedId) {
      return;
    }

    setError('');

    try {
        await api.printPdf({
          collectionId: selectedId,
          config: {
            format: 'A4',
            includeToc: true,
            songsPerPage: 1,
          },
        });
    } catch (e) {
      setError(e?.message || 'Failed to print collection');
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Collections</p>
          <h1 style={styles.title}>Collection Library</h1>
          <p style={styles.subTitle}>Group songs for browsing, curation, and printing.</p>
        </div>

        <div style={styles.headerActions}>
          <BackToLibraryButton />
          {selectedId && (
            <>
              <button type="button" style={styles.secondaryBtn} onClick={printCollection}>
                Print Collection
              </button>
              <button
                type="button"
                style={styles.dangerBtn}
                onClick={removeCollection}
                disabled={busy}
              >
                Delete Collection
              </button>
            </>
          )}
        </div>
      </header>

      <form style={styles.createCard} onSubmit={createCollection}>
        <div style={styles.createFields}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Name</span>
            <input
              style={styles.input}
              placeholder="New collection name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Description</span>
            <input
              style={styles.input}
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>
        <button type="submit" style={styles.primaryBtn} disabled={busy || !name.trim()}>
          Create Collection
        </button>
      </form>

      {error && <p style={styles.error}>{error}</p>}
      {info && <p style={styles.success}>{info}</p>}

      <div style={styles.layout}>
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <h2 style={styles.sectionTitle}>All Collections</h2>
            <div style={styles.countPill}>{collections.length}</div>
          </div>

          {loading ? (
            <p style={styles.muted}>Loading collections...</p>
          ) : collections.length === 0 ? (
            <p style={styles.muted}>No collections yet.</p>
          ) : (
            <div style={styles.collectionList}>
              {collections.map((collection) => {
                const active = collection.id === selectedId;

                return (
                  <button
                    key={collection.id}
                    type="button"
                    style={active ? styles.collectionItemActive : styles.collectionItem}
                    onClick={() => setSelectedId(collection.id)}
                  >
                    <strong>{collection.name}</strong>
                    <span style={styles.collectionMeta}>
                      {Number(collection.songs_count || 0)} song(s)
                    </span>
                    {collection.description ? (
                      <span style={styles.collectionDescription}>{collection.description}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section style={styles.detail}>
          {!selectedId ? (
            <p style={styles.muted}>Select a collection to view its songs.</p>
          ) : detailLoading ? (
            <p style={styles.muted}>Loading collection...</p>
          ) : !selectedCollection ? (
            <p style={styles.muted}>Collection not found.</p>
          ) : (
            <>
              <div style={styles.detailHeader}>
                <div>
                  <p style={styles.detailEyebrow}>Selected collection</p>
                  <h2 style={styles.detailTitle}>{selectedCollection.name}</h2>
                  <p style={styles.detailDescription}>
                    {selectedCollection.description || 'No description'}
                  </p>
                </div>
                <div style={styles.detailSummary}>
                  <div style={styles.summaryCard}>
                    <strong>{selectedCollection.songs?.length || 0}</strong>
                    <span>songs</span>
                  </div>
                </div>
              </div>

              {Array.isArray(selectedCollection.songs) && selectedCollection.songs.length > 0 ? (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>#</th>
                        <th style={styles.th}>Title</th>
                        <th style={styles.th}>Artist</th>
                        <th style={styles.th}>Lyrics</th>
                        <th style={styles.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCollection.songs.map((song, index) => (
                        <tr key={song.id}>
                          <td style={styles.td}>{index + 1}</td>
                          <td style={styles.td}>{song.title || '-'}</td>
                          <td style={styles.td}>{song.artist_name || '-'}</td>
                          <td style={styles.td}>{song.lyrics_status || '-'}</td>
                          <td style={styles.td}>
                            <div style={styles.rowActions}>
                              <button
                                type="button"
                                style={styles.rowBtn}
                                onClick={() => navigate(`/songs/${song.id}`)}
                              >
                                Open
                              </button>
                              <button
                                type="button"
                                style={styles.rowDangerBtn}
                                onClick={() => removeSong(song.id)}
                                disabled={busy}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={styles.muted}>This collection is empty.</p>
              )}
            </>
          )}
        </section>
      </div>
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
    fontSize: 36,
    color: '#2c241b',
  },
  subTitle: {
    margin: 0,
    color: '#6b6053',
    lineHeight: 1.6,
  },
  headerActions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  createCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 14,
    flexWrap: 'wrap',
    background: '#fffefb',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 20,
    padding: 20,
    boxShadow: '0 14px 30px rgba(77, 60, 35, 0.05)',
    marginBottom: 18,
  },
  createFields: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 14,
    flex: '1 1 520px',
  },
  field: {
    display: 'grid',
    gap: 6,
  },
  fieldLabel: {
    color: '#6a5d4f',
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  input: {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 14,
    border: '1px solid rgba(114, 98, 78, 0.2)',
    background: '#fff',
    color: '#2f261c',
    fontFamily: 'inherit',
  },
  primaryBtn: {
    padding: '11px 16px',
    borderRadius: 999,
    border: 'none',
    background: '#2f6b5f',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '11px 16px',
    borderRadius: 999,
    border: '1px solid rgba(114, 98, 78, 0.22)',
    background: '#fff',
    color: '#3b332a',
    fontWeight: 700,
    cursor: 'pointer',
  },
  dangerBtn: {
    padding: '11px 16px',
    borderRadius: 999,
    border: '1px solid rgba(192, 57, 43, 0.24)',
    background: '#fff',
    color: '#b03a2e',
    fontWeight: 700,
    cursor: 'pointer',
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 18,
    alignItems: 'start',
  },
  sidebar: {
    background: '#fffdf8',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 20,
    padding: 18,
  },
  sidebarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    margin: 0,
    color: '#2f261c',
  },
  countPill: {
    padding: '6px 10px',
    borderRadius: 999,
    background: '#f3ece0',
    color: '#55493d',
    fontSize: 13,
    fontWeight: 700,
  },
  collectionList: {
    display: 'grid',
    gap: 10,
  },
  collectionItem: {
    display: 'grid',
    gap: 4,
    textAlign: 'left',
    padding: '14px 16px',
    border: '1px solid rgba(114, 98, 78, 0.16)',
    borderRadius: 16,
    background: '#fffefb',
    cursor: 'pointer',
    color: '#3f352a',
  },
  collectionItemActive: {
    display: 'grid',
    gap: 4,
    textAlign: 'left',
    padding: '14px 16px',
    border: '1px solid rgba(47, 107, 95, 0.24)',
    borderRadius: 16,
    background: '#eef7f3',
    cursor: 'pointer',
    color: '#2f261c',
    boxShadow: '0 0 0 2px rgba(47, 107, 95, 0.08)',
  },
  collectionMeta: {
    color: '#7a6d5d',
    fontSize: 12,
  },
  collectionDescription: {
    color: '#6b6053',
    fontSize: 13,
    lineHeight: 1.5,
  },
  detail: {
    background: '#fffefb',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 20,
    padding: 20,
    minHeight: 320,
    boxShadow: '0 14px 30px rgba(77, 60, 35, 0.05)',
  },
  detailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  detailEyebrow: {
    margin: 0,
    color: '#8a6f3f',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    fontSize: 12,
    fontWeight: 700,
  },
  detailTitle: {
    margin: '6px 0 8px',
    color: '#2b241c',
    fontSize: 28,
  },
  detailDescription: {
    margin: 0,
    color: '#6d6152',
    lineHeight: 1.6,
  },
  detailSummary: {
    display: 'grid',
    gap: 10,
  },
  summaryCard: {
    display: 'grid',
    gap: 4,
    minWidth: 120,
    padding: '14px 16px',
    borderRadius: 18,
    background: '#faf5ec',
    border: '1px solid rgba(114, 98, 78, 0.12)',
    textAlign: 'center',
  },
  tableWrap: {
    overflowX: 'auto',
    borderRadius: 18,
    border: '1px solid rgba(114, 98, 78, 0.14)',
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
  rowActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowBtn: {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(114, 98, 78, 0.2)',
    background: '#fff',
    color: '#3b332a',
    cursor: 'pointer',
    fontWeight: 700,
  },
  rowDangerBtn: {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(192, 57, 43, 0.24)',
    background: '#fff',
    color: '#b03a2e',
    cursor: 'pointer',
    fontWeight: 700,
  },
  muted: {
    color: '#777',
  },
  success: {
    color: '#1e8449',
    fontWeight: 600,
    marginBottom: 14,
  },
  error: {
    color: '#c0392b',
    fontWeight: 600,
    marginBottom: 14,
  },
};
