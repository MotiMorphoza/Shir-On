import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, BASE as API_BASE } from '../api/client.js';

function extractSpotifyId(input, expectedType = null) {
  const value = String(input || '').trim();
  if (!value) {
    return '';
  }

  if (/^[A-Za-z0-9]{10,}$/.test(value)) {
    return value;
  }

  const uriMatch = value.match(/^spotify:(playlist|album):([A-Za-z0-9]+)$/i);
  if (uriMatch) {
    const [, type, id] = uriMatch;
    if (!expectedType || type.toLowerCase() === expectedType.toLowerCase()) {
      return id;
    }
    return '';
  }

  const urlMatch = value.match(
    /spotify\.com\/(playlist|album)\/([A-Za-z0-9]+)(?:\?|#|\/|$)/i
  );
  if (urlMatch) {
    const [, type, id] = urlMatch;
    if (!expectedType || type.toLowerCase() === expectedType.toLowerCase()) {
      return id;
    }
    return '';
  }

  return '';
}

function summaryLine(result) {
  const found = Number(result?.tracks_found || result?.report?.found || 0);
  const imported = Number(result?.imported || result?.report?.imported || 0);
  const skipped = Number(result?.skipped || result?.report?.skipped || 0);
  const invalid = Number(result?.invalid || result?.report?.invalid || 0);
  const errors = Number(result?.errors || result?.report?.errors || 0);

  const parts = [`Imported: ${imported}`, `Skipped: ${skipped}`];

  if (Number.isFinite(found) && found > 0) {
    parts.push(`Found: ${found}`);
  }
  if (invalid > 0) {
    parts.push(`Invalid: ${invalid}`);
  }
  if (errors > 0) {
    parts.push(`Errors: ${errors}`);
  }

  return parts.join(' · ');
}

export default function ImportPage() {
  const navigate = useNavigate();

  const [playlistInput, setPlaylistInput] = useState('');
  const [albumInput, setAlbumInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [spotifyReady, setSpotifyReady] = useState(false);
  const [checkingSpotify, setCheckingSpotify] = useState(true);

  const playlistId = useMemo(
    () => extractSpotifyId(playlistInput, 'playlist'),
    [playlistInput]
  );

  const albumId = useMemo(
    () => extractSpotifyId(albumInput, 'album'),
    [albumInput]
  );

  useEffect(() => {
    let cancelled = false;

    async function checkSpotify() {
      setCheckingSpotify(true);

      try {
        const data = await api.getSpotifySession();
        if (!cancelled) {
          setSpotifyReady(Boolean(data?.authenticated));
        }
      } catch {
        if (!cancelled) {
          setSpotifyReady(false);
        }
      } finally {
        if (!cancelled) {
          setCheckingSpotify(false);
        }
      }
    }

    checkSpotify();

    return () => {
      cancelled = true;
    };
  }, []);

  async function run(action) {
    setLoading(true);
    setResult(null);
    setError('');

    try {
      const response = await action();
      setResult(response);
    } catch (err) {
      setError(err?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  function connectSpotify() {
    window.location.href = `${API_BASE}/spotify/login`;
  }

  async function handleCsvUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await api.importCsv(file);
      setResult(response);
    } catch (err) {
      setError(err?.message || 'CSV import failed');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  }

  return (
    <div style={styles.page}>
      <button type="button" style={styles.back} onClick={() => navigate('/')}>
        ← Library
      </button>

      <h2 style={styles.title}>Import</h2>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Spotify Connection</h3>

        {checkingSpotify ? (
          <p style={styles.hint}>Checking Spotify session…</p>
        ) : spotifyReady ? (
          <p style={styles.success}>Spotify connected.</p>
        ) : (
          <>
            <p style={styles.hint}>
              You must connect Spotify before importing a playlist or album.
            </p>
            <button type="button" style={styles.btn} onClick={connectSpotify}>
              Connect Spotify
            </button>
          </>
        )}
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Spotify Playlist</h3>

        <div style={styles.row}>
          <input
            style={styles.input}
            placeholder="Playlist URL, URI, or ID"
            value={playlistInput}
            onChange={(e) => setPlaylistInput(e.target.value)}
          />

          <button
            type="button"
            style={styles.btn}
            disabled={loading || !spotifyReady || !playlistId}
            onClick={() => run(() => api.importPlaylist(playlistId))}
          >
            Import Playlist
          </button>
        </div>

        {playlistInput && !playlistId && (
          <p style={styles.errorHint}>Invalid Spotify playlist URL or ID.</p>
        )}
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Spotify Album</h3>

        <div style={styles.row}>
          <input
            style={styles.input}
            placeholder="Album URL, URI, or ID"
            value={albumInput}
            onChange={(e) => setAlbumInput(e.target.value)}
          />

          <button
            type="button"
            style={styles.btn}
            disabled={loading || !spotifyReady || !albumId}
            onClick={() => run(() => api.importAlbum(albumId))}
          >
            Import Album
          </button>
        </div>

        {albumInput && !albumId && (
          <p style={styles.errorHint}>Invalid Spotify album URL or ID.</p>
        )}
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>CSV Upload</h3>

        <p style={styles.hint}>
          Columns: <code>title, artist, album, year, language</code>
        </p>

        <input type="file" accept=".csv,text/csv" onChange={handleCsvUpload} />
      </section>

      {loading && <p style={styles.loading}>Importing…</p>}
      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.result}>
          <div style={styles.resultHeader}>
            <div>
              <strong>Done.</strong> {summaryLine(result)}
            </div>

            <div style={styles.resultActions}>
              {result.report_id && (
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  onClick={() => navigate(`/reports/${result.report_id}`)}
                >
                  View This Report
                </button>
              )}

              <button
                type="button"
                style={styles.secondaryBtn}
                onClick={() => navigate('/reports')}
              >
                All Reports
              </button>
            </div>
          </div>

          {Array.isArray(result.preview_titles) && result.preview_titles.length > 0 && (
            <div style={styles.previewBlock}>
              <strong>Preview:</strong>
              <ul style={styles.list}>
                {result.preview_titles.map((entry, index) => (
                  <li key={`${entry}-${index}`}>{entry}</li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(result.errors_list) && result.errors_list.length > 0 && (
            <div style={styles.previewBlock}>
              <strong>Errors:</strong>
              <ul style={styles.errorList}>
                {result.errors_list.slice(0, 20).map((entry, index) => (
                  <li key={index}>
                    {entry?.track || entry?.record || '[unknown]'}: {entry?.error || 'Unknown error'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '24px 16px 48px',
  },
  title: {
    marginTop: 0,
    marginBottom: 20,
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
  section: {
    background: '#f9f9f9',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: 14,
  },
  row: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  input: {
    flex: '1 1 320px',
    minWidth: 240,
    padding: '8px 12px',
    border: '1px solid #ccc',
    borderRadius: 4,
  },
  btn: {
    padding: '8px 18px',
    background: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600,
  },
  secondaryBtn: {
    padding: '8px 14px',
    background: '#fff',
    color: '#333',
    border: '1px solid #bbb',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600,
  },
  resultActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  hint: {
    color: '#777',
    fontSize: 13,
    marginTop: 0,
    marginBottom: 12,
  },
  success: {
    color: '#1e8449',
    fontWeight: 600,
    marginTop: 0,
    marginBottom: 0,
  },
  loading: {
    color: '#777',
  },
  error: {
    color: '#c0392b',
    fontWeight: 600,
  },
  errorHint: {
    color: '#c0392b',
    fontSize: 13,
    marginTop: 10,
    marginBottom: 0,
  },
  result: {
    padding: '12px 16px',
    background: '#eafaf1',
    border: '1px solid #a9dfbf',
    borderRadius: 6,
    overflowWrap: 'anywhere',
  },
  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  previewBlock: {
    marginTop: 12,
  },
  list: {
    marginTop: 8,
    marginBottom: 0,
    paddingLeft: 18,
  },
  errorList: {
    marginTop: 8,
    marginBottom: 0,
    paddingLeft: 18,
    color: '#c0392b',
  },
};