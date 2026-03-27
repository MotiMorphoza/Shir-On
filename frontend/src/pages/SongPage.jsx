import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';

function isProbablyHebrew(text) {
  return /[\u0590-\u05FF]/.test(String(text || ''));
}

function parseTags(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildYearOptions() {
  return Array.from(
    { length: new Date().getFullYear() - 1899 },
    (_, index) => String(new Date().getFullYear() - index)
  );
}

export default function SongPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [song, setSong] = useState(null);
  const [form, setForm] = useState({
    title: '',
    artist: '',
    album: '',
    year: '',
  });
  const [lyrics, setLyrics] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const isHebrew = useMemo(
    () => isProbablyHebrew(form.title) || isProbablyHebrew(lyrics),
    [form.title, lyrics]
  );
  const yearOptions = useMemo(() => buildYearOptions(), []);

  useEffect(() => {
    let cancelled = false;

    async function loadSong() {
      if (isNew) {
        setSong(null);
        setForm({
          title: '',
          artist: '',
          album: '',
          year: '',
        });
        setLyrics('');
        setTagsText('');
        setLoading(false);
        setError('');
        return;
      }

      setLoading(true);
      setError('');
      setMsg('');

      try {
        const loadedSong = await api.getSong(id);

        if (cancelled) {
          return;
        }

        if (!loadedSong) {
          setError('Song not found');
          setSong(null);
          return;
        }

        setSong(loadedSong);
        setForm({
          title: loadedSong.title || '',
          artist: loadedSong.artist_name || '',
          album: loadedSong.album_title || '',
          year: loadedSong.year || '',
        });
        setLyrics(loadedSong.lyrics?.text || '');
        setTagsText(Array.isArray(loadedSong.tags) ? loadedSong.tags.join(', ') : '');
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load song');
          setSong(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSong();

    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  async function save() {
    setSaving(true);
    setMsg('');
    setError('');

    try {
      if (isNew) {
        const created = await api.createSong(form);

        if (lyrics.trim()) {
          await api.saveLyrics(created.id, { text: lyrics });
        }

        if (parseTags(tagsText).length > 0) {
          await api.setTags(created.id, parseTags(tagsText));
        }

        navigate(`/songs/${created.id}`);
        return;
      }

      await api.updateSong(id, form);

      if (lyrics !== (song?.lyrics?.text || '')) {
        await api.saveLyrics(id, { text: lyrics });
      }

      if (tagsText !== (Array.isArray(song?.tags) ? song.tags.join(', ') : '')) {
        await api.setTags(id, parseTags(tagsText));
      }

      const updated = await api.getSong(id);
      setSong(updated);
      setLyrics(updated?.lyrics?.text || lyrics);
      setTagsText(Array.isArray(updated?.tags) ? updated.tags.join(', ') : tagsText);
      setMsg('Song saved.');
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function printSong() {
    if (isNew) {
      return;
    }

    setError('');
    setMsg('');

    try {
      await api.printPdf({
        songIds: [id],
        config: {
          format: 'A4',
          songsPerPage: 1,
          layout: 'fit-one-page-two-columns',
          includeToc: false,
        },
      });

      setMsg('Opened print preview for this song.');
    } catch (e) {
      setError(e?.message || 'Print failed');
    }
  }

  async function deleteCurrentSong() {
    if (isNew || deleting || saving) {
      return;
    }

    const songTitle = song?.title || form.title || 'this song';
    if (!window.confirm(`Delete "${songTitle}"?`)) {
      return;
    }

    setDeleting(true);
    setError('');
    setMsg('');

    try {
      await api.deleteSong(id);
      navigate(window.history.length > 1 ? -1 : '/library');
    } catch (e) {
      setError(e?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <p style={styles.info}>Loading song...</p>
      </div>
    );
  }

  if (!isNew && error && !song) {
    return (
      <div style={styles.page}>
        <p style={styles.error}>{error}</p>
      </div>
    );
  }

  const artistName = song?.artist_name || form.artist || '-';
  const albumName = song?.album_title || form.album || 'Single';
  const metaParts = [albumName, form.year || song?.year || ''].filter(Boolean);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>{isNew ? 'Library / New Song' : 'Library / Song'}</p>
          <h1
            style={{
              ...styles.title,
              direction: isHebrew ? 'rtl' : 'ltr',
              textAlign: isHebrew ? 'right' : 'left',
            }}
          >
            {isNew ? 'New Song' : song?.title || 'Song'}
          </h1>
          <p style={styles.subTitle}>
            {artistName} {metaParts.length ? `| ${metaParts.join(' | ')}` : ''}
          </p>
        </div>

      </header>

      {msg && <p style={styles.success}>{msg}</p>}
      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.layout}>
        <section style={styles.editorCard}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Song Details</h2>
              <p style={styles.sectionHint}>Edit the core metadata stored in the library.</p>
            </div>
          </div>

          <div style={styles.formGrid}>
            {[
              ['Title', 'title', 'text'],
              ['Artist', 'artist', 'text'],
              ['Album', 'album', 'text'],
              ['Year', 'year', 'text'],
            ].map(([label, key, type]) => (
              <label key={key} style={styles.label}>
                <span style={styles.labelText}>{label}</span>
                <input
                  style={styles.input}
                  type={type}
                  inputMode={key === 'year' ? 'numeric' : undefined}
                  list={key === 'year' ? 'song-year-options' : undefined}
                  value={form[key] || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
              />
            </label>
          ))}

            <datalist id="song-year-options">
              {yearOptions.map((year) => (
                <option key={year} value={year} />
              ))}
            </datalist>

            <label style={styles.labelWide}>
              <span style={styles.labelText}>Tags</span>
              <input
                style={styles.input}
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="Comma-separated tags"
              />
            </label>
          </div>
        </section>

        <aside style={styles.sidebarCard}>
          <h2 style={styles.sectionTitle}>Actions</h2>
          <div style={styles.actionStack}>
            <button type="button" style={styles.primaryBtn} onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save Song'}
            </button>

            {!isNew && (
              <>
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  onClick={printSong}
                  disabled={saving || deleting}
                >
                  Print This Song
                </button>
                {song?.spotify_url && (
                  <a
                    href={song.spotify_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.linkButton}
                  >
                    Open in Spotify
                  </a>
                )}
                <button
                  type="button"
                  style={styles.deleteBtn}
                  onClick={deleteCurrentSong}
                  disabled={deleting || saving}
                >
                  {deleting ? 'Deleting...' : 'Delete Song'}
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      <section style={styles.lyricsCard}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Lyrics</h2>
            <p style={styles.sectionHint}>Paste text manually or refine what the fetch flow brings in.</p>
          </div>
        </div>

        <label style={styles.lyricsLabel}>
          <textarea
            dir={isHebrew ? 'rtl' : 'ltr'}
            style={{
              ...styles.textarea,
              direction: isHebrew ? 'rtl' : 'ltr',
              textAlign: isHebrew ? 'right' : 'left',
            }}
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder="Paste or type lyrics here..."
          />
        </label>
      </section>
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1240,
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
    fontSize: 38,
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
  layout: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 18,
    alignItems: 'start',
    marginBottom: 18,
  },
  editorCard: {
    background: '#fffefb',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 20,
    padding: 20,
    boxShadow: '0 14px 30px rgba(77, 60, 35, 0.05)',
  },
  sidebarCard: {
    background: '#fffdf8',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 20,
    padding: 20,
  },
  lyricsCard: {
    background: '#fffefb',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 20,
    padding: 20,
    boxShadow: '0 14px 30px rgba(77, 60, 35, 0.05)',
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    margin: 0,
    color: '#2f261c',
  },
  sectionHint: {
    margin: '6px 0 0',
    color: '#7c6d5d',
    fontSize: 13,
    lineHeight: 1.5,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 14,
  },
  label: {
    display: 'grid',
    gap: 6,
  },
  labelWide: {
    display: 'grid',
    gap: 6,
    gridColumn: '1 / -1',
  },
  labelText: {
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
  lyricsLabel: {
    display: 'block',
  },
  textarea: {
    display: 'block',
    width: '100%',
    minHeight: 420,
    padding: '16px 18px',
    border: '1px solid rgba(114, 98, 78, 0.2)',
    borderRadius: 16,
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 17,
    resize: 'vertical',
    lineHeight: 1.9,
  },
  actionStack: {
    display: 'grid',
    gap: 10,
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
  deleteBtn: {
    padding: '11px 16px',
    borderRadius: 999,
    border: '1px solid #d5c1bb',
    background: '#fff',
    color: '#b03a2e',
    fontWeight: 700,
    cursor: 'pointer',
  },
  linkButton: {
    padding: '11px 16px',
    borderRadius: 999,
    border: '1px solid rgba(114, 98, 78, 0.22)',
    background: '#fff',
    color: '#3b332a',
    fontWeight: 700,
    textDecoration: 'none',
    textAlign: 'center',
  },
  info: {
    color: '#6b6053',
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
