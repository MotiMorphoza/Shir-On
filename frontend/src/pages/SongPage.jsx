import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';

const STATUS_LABELS = {
  missing: '❌ Missing',
  auto: '🤖 Auto',
  manual: '✏️ Manual',
  reviewed: '✅ Reviewed',
};

function isProbablyHebrew(text) {
  return /[\u0590-\u05FF]/.test(String(text || ''));
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
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [lastReportId, setLastReportId] = useState('');

  const isHebrew = useMemo(() => {
    return isProbablyHebrew(form.title) || isProbablyHebrew(lyrics);
  }, [form.title, lyrics]);

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
        setLoading(false);
        setError('');
        return;
      }

      setLoading(true);
      setError('');
      setMsg('');

      try {
        const s = await api.getSong(id);

        if (!cancelled) {
          if (!s) {
            setError('Song not found');
            setSong(null);
            return;
          }

          setSong(s);
          setForm({
            title: s.title || '',
            artist: s.artist_name || '',
            album: s.album_title || '',
            year: s.year || '',
          });
          setLyrics(s.lyrics?.text || '');
        }
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

  const save = async () => {
    setSaving(true);
    setMsg('');
    setError('');

    try {
      if (isNew) {
        const created = await api.createSong(form);

        if (lyrics.trim()) {
          await api.saveLyrics(created.id, { text: lyrics });
        }

        navigate(`/songs/${created.id}`);
        return;
      }

      await api.updateSong(id, form);

      if (lyrics !== (song?.lyrics?.text || '')) {
        await api.saveLyrics(id, { text: lyrics });
      }

      const updated = await api.getSong(id);
      setSong(updated);
      setLyrics(updated?.lyrics?.text || lyrics);
      setMsg('Saved.');
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const fetchLyrics = async () => {
    setSaving(true);
    setMsg('Fetching…');
    setError('');
    setLastReportId('');

    try {
      const result = await api.fetchLyrics(id);

      if (result?.fetched) {
        setLyrics(result.song?.lyrics?.text || '');
        setSong(result.song || null);
        setMsg('Lyrics fetched.');
      } else {
        setMsg('No lyrics found by any provider.');
      }

      if (result?.report_id) {
        setLastReportId(result.report_id);
      }
    } catch (e) {
      setError(e?.message || 'Lyrics fetch failed');
      setMsg('');
    } finally {
      setSaving(false);
    }
  };

  const togglePrintReady = async () => {
    if (!song) {
      return;
    }

    setSaving(true);
    setMsg('');
    setError('');

    try {
      const updated = await api.updateSong(id, {
        is_print_ready: song.is_print_ready ? 0 : 1,
      });
      setSong(updated);
      setMsg(updated?.is_print_ready ? 'Marked print ready.' : 'Unmarked print ready.');
    } catch (e) {
      setError(e?.message || 'Failed to update print-ready status');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <button type="button" style={styles.back} onClick={() => navigate('/')}>
          ← Library
        </button>
        <p style={styles.loading}>Loading song…</p>
      </div>
    );
  }

  if (!isNew && error && !song) {
    return (
      <div style={styles.page}>
        <button type="button" style={styles.back} onClick={() => navigate('/')}>
          ← Library
        </button>
        <p style={styles.error}>{error}</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <button type="button" style={styles.back} onClick={() => navigate('/')}>
        ← Library
      </button>

      <h2
        style={{
          ...styles.songTitle,
          direction: isHebrew ? 'rtl' : 'ltr',
          textAlign: isHebrew ? 'right' : 'left',
        }}
      >
        {isNew ? 'New Song' : song?.title || 'Song'}
      </h2>

      {!isNew && song && (
        <div style={styles.meta}>
          <span>
            Status: <strong>{STATUS_LABELS[song.lyrics_status] || song.lyrics_status || '—'}</strong>
          </span>
          <span>
            Print ready: <strong>{song.is_print_ready ? 'Yes' : 'No'}</strong>
          </span>
          <span>
            Spotify:{' '}
            <strong>
              {song.spotify_url ? (
                <a
                  href={song.spotify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.spotifyLink}
                >
                  Open
                </a>
              ) : (
                '—'
              )}
            </strong>
          </span>
        </div>
      )}

      <div style={styles.grid}>
        {[
          ['Title', 'title', 'text'],
          ['Artist', 'artist', 'text'],
          ['Album', 'album', 'text'],
          ['Year', 'year', 'number'],
        ].map(([label, key, type]) => (
          <label key={key} style={styles.label}>
            {label}
            <input
              style={styles.input}
              type={type}
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
      </div>

      <label style={{ ...styles.label, display: 'block', marginTop: 16 }}>
        Lyrics
        <textarea
          dir={isHebrew ? 'rtl' : 'ltr'}
          style={{
            ...styles.textarea,
            direction: isHebrew ? 'rtl' : 'ltr',
            textAlign: isHebrew ? 'right' : 'left',
          }}
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          placeholder="Paste or type lyrics here…"
        />
      </label>

      <div style={styles.btnRow}>
        <button type="button" style={styles.primary} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>

        {!isNew && (
          <>
            <button
              type="button"
              style={styles.secondary}
              onClick={fetchLyrics}
              disabled={saving}
            >
              Auto-fetch Lyrics
            </button>

            <button
              type="button"
              style={styles.secondary}
              onClick={togglePrintReady}
              disabled={saving}
            >
              {song?.is_print_ready ? 'Unmark Print Ready' : 'Mark Print Ready'}
            </button>

            <button
              type="button"
              style={{ ...styles.secondary, background: '#27ae60', color: '#fff' }}
              onClick={() =>
                api.printPdf({
                  songIds: [id],
                  config: {
                    format: 'A4',
                    layout: 'fit-one-page-two-columns',
                    includeToc: false,
                    titleSeparatePage: false,
                    autoFontSize: true,
                  },
                })
              }
              disabled={saving}
            >
              Print This Song
            </button>

            {lastReportId && (
              <button
                type="button"
                style={styles.secondary}
                onClick={() => navigate(`/reports/${lastReportId}`)}
              >
                View Fetch Report
              </button>
            )}

            <button
              type="button"
              style={styles.secondary}
              onClick={() => navigate('/reports')}
            >
              All Reports
            </button>
          </>
        )}
      </div>

      {msg && <p style={{ color: '#27ae60', marginTop: 8 }}>{msg}</p>}
      {error && song && <p style={styles.error}>{error}</p>}
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '24px 16px',
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
  songTitle: {
    marginBottom: 4,
  },
  meta: {
    display: 'flex',
    gap: 24,
    color: '#555',
    fontSize: 13,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  spotifyLink: {
    color: '#1db954',
    textDecoration: 'none',
    fontWeight: 600,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#333',
  },
  input: {
    display: 'block',
    width: '100%',
    padding: '7px 10px',
    border: '1px solid #ccc',
    borderRadius: 4,
    marginTop: 3,
    fontFamily: 'inherit',
  },
  textarea: {
    display: 'block',
    width: '100%',
    height: 300,
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: 4,
    marginTop: 3,
    fontFamily: 'inherit',
    fontSize: 15,
    resize: 'vertical',
    lineHeight: 1.8,
  },
  btnRow: {
    display: 'flex',
    gap: 8,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  primary: {
    padding: '8px 20px',
    background: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600,
  },
  secondary: {
    padding: '8px 14px',
    background: '#f0f0f0',
    color: '#333',
    border: '1px solid #ccc',
    borderRadius: 4,
    cursor: 'pointer',
  },
  loading: {
    color: '#888',
  },
  error: {
    color: '#c0392b',
    fontWeight: 600,
    marginTop: 8,
  },
};