import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { importSpotifyTracks } from '../services/importService.js';
import { saveReport } from '../services/reportService.js';

const router = Router();

const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const DEFAULT_FRONTEND_URL = 'http://127.0.0.1:5174';

function getSpotifyConfig() {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim() || '';
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI?.trim() || '';
  const frontendUrl = process.env.FRONTEND_URL?.trim() || DEFAULT_FRONTEND_URL;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Spotify auth config missing');
  }

  return { clientId, clientSecret, redirectUri, frontendUrl };
}

function extractSpotifyId(input, expectedType = null) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  const value = input.trim();
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

function getAuthHeader(clientId, clientSecret) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

function getSpotifyErrorMessage(err, fallbackMessage) {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.error_description ||
    err?.message ||
    fallbackMessage
  );
}

async function refreshSpotifyAccessToken(refreshToken) {
  const { clientId, clientSecret } = getSpotifyConfig();

  const tokenRes = await axios.post(
    `${SPOTIFY_ACCOUNTS_BASE}/api/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
    {
      headers: {
        Authorization: getAuthHeader(clientId, clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return {
    access_token: tokenRes.data.access_token,
    refresh_token: tokenRes.data.refresh_token || refreshToken,
    expires_at: Date.now() + Number(tokenRes.data.expires_in || 3600) * 1000,
  };
}

async function saveSession(req) {
  await new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function ensureValidSpotifySession(req) {
  const spotifySession = req.session?.spotify;

  if (!spotifySession?.access_token) {
    return null;
  }

  const expiresAt = Number(spotifySession.expires_at || 0);
  const stillValid = expiresAt > Date.now() + 15_000;

  if (stillValid) {
    return spotifySession;
  }

  if (!spotifySession.refresh_token) {
    req.session.spotify = null;
    await saveSession(req);
    return null;
  }

  const refreshed = await refreshSpotifyAccessToken(spotifySession.refresh_token);
  req.session.spotify = refreshed;
  await saveSession(req);

  return refreshed;
}

async function spotifyGet(url, accessToken, params = {}) {
  const response = await axios.get(url, {
    params,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function extractArtists(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }

        if (entry && typeof entry === 'object') {
          return firstString(
            entry.name,
            entry.display_name,
            entry.artist,
            entry.title
          );
        }

        return '';
      })
      .filter(Boolean)
      .join(', ')
      .trim();
  }

  if (typeof value === 'object') {
    return firstString(value.name, value.display_name, value.artist);
  }

  return '';
}

function extractYear(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const match = value.match(/^(\d{4})/);
      if (match) {
        return Number(match[1]);
      }
    }
  }

  return null;
}

function normalizeTrackLikeObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return null;
  }

  const title = firstString(
    obj.name,
    obj.title,
    obj.track_name,
    obj.song,
    obj.song_name
  );

  const artist = firstString(
    extractArtists(obj.artists),
    extractArtists(obj.artist),
    extractArtists(obj.album?.artists),
    extractArtists(obj.track?.artists),
    extractArtists(obj.performers)
  );

  if (!title || !artist) {
    return null;
  }

  const album = firstString(
    obj.album?.name,
    obj.album_name,
    obj.albumTitle,
    obj.release?.name,
    obj.collection?.name
  );

  const year = extractYear(
    obj.album?.release_date,
    obj.release_date,
    obj.year,
    obj.album?.year,
    obj.release?.release_date
  );

  return {
    title,
    artist,
    album,
    year,
    spotify_id: firstString(obj.id, obj.spotify_id) || null,
    spotify_url: firstString(
      obj.external_urls?.spotify,
      obj.spotify_url,
      obj.url
    ) || null,
    album_spotify_id: firstString(obj.album?.id, obj.album_spotify_id) || null,
    track_number:
      Number.isFinite(obj.track_number) && obj.track_number > 0
        ? obj.track_number
        : null,
    cover_url: firstString(obj.album?.images?.[0]?.url, obj.cover_url) || null,
  };
}

function normalizePlaylistItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const candidates = [
    item.item,
    item.track,
    item.item?.item,
    item.track?.track,
    item.item?.track && typeof item.item.track === 'object' ? item.item.track : null,
    item,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = normalizeTrackLikeObject(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

async function fetchAllPlaylistTracks(playlistId, accessToken) {
  const allItems = [];
  let url = `${SPOTIFY_API_BASE}/playlists/${playlistId}/items?limit=100`;

  while (url) {
    const data = await spotifyGet(url, accessToken);

    if (Array.isArray(data.items)) {
      allItems.push(...data.items);
    }

    url = data.next || null;
  }

  return allItems
    .map((item) => normalizePlaylistItem(item))
    .filter(Boolean);
}

async function fetchAllAlbumTracks(albumId, accessToken) {
  const album = await spotifyGet(`${SPOTIFY_API_BASE}/albums/${albumId}`, accessToken);

  const albumName = firstString(album?.name);
  const year = extractYear(album?.release_date, album?.year);
  const albumSpotifyId = firstString(album?.id) || null;
  const coverUrl = firstString(album?.images?.[0]?.url) || null;

  const allItems = [];
  let url = `${SPOTIFY_API_BASE}/albums/${albumId}/tracks?limit=50`;

  while (url) {
    const data = await spotifyGet(url, accessToken);

    if (Array.isArray(data.items)) {
      allItems.push(...data.items);
    }

    url = data.next || null;
  }

  return allItems
    .map((track) => {
      const normalized = normalizeTrackLikeObject(track);
      if (!normalized) {
        return null;
      }

      return {
        ...normalized,
        album: normalized.album || albumName,
        year: normalized.year || year,
        album_spotify_id: normalized.album_spotify_id || albumSpotifyId,
        cover_url: normalized.cover_url || coverUrl,
      };
    })
    .filter(Boolean);
}

function persistImportReport(subtype, sourceId, tracks, report) {
  return saveReport({
    type: 'import',
    subtype,
    source_type: subtype,
    source_id: sourceId,
    summary: {
      found: Number(tracks.length || 0),
      imported: Number(report.imported || 0),
      skipped: Number(report.skipped || 0),
      invalid: Number(report.invalid || 0),
      errors: Number(report.errors || 0),
      ...(report.summary || {}),
    },
    preview_titles: tracks.slice(0, 10).map((t) => `${t.artist} — ${t.title}`),
    rows: Array.isArray(report.rows) ? report.rows : [],
    errors_list: Array.isArray(report.errors_list) ? report.errors_list : [],
    report,
  });
}

router.get('/login', async (req, res, next) => {
  try {
    const { clientId, redirectUri } = getSpotifyConfig();

    const state = crypto.randomBytes(16).toString('hex');
    req.session.spotify_state = state;

    const scope = [
      'playlist-read-private',
      'playlist-read-collaborative',
    ].join(' ');

    const url =
      `${SPOTIFY_ACCOUNTS_BASE}/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    await saveSession(req);
    res.redirect(url);
  } catch (err) {
    next(err);
  }
});

router.get('/callback', async (req, res, next) => {
  try {
    const { clientId, clientSecret, redirectUri, frontendUrl } = getSpotifyConfig();

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    if (!code) {
      return res.status(400).send('Missing code');
    }

    if (!state || state !== req.session?.spotify_state) {
      return res.status(400).send('Invalid auth state');
    }

    delete req.session.spotify_state;

    const tokenRes = await axios.post(
      `${SPOTIFY_ACCOUNTS_BASE}/api/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          Authorization: getAuthHeader(clientId, clientSecret),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    req.session.spotify = {
      access_token: tokenRes.data.access_token,
      refresh_token: tokenRes.data.refresh_token || null,
      expires_at: Date.now() + Number(tokenRes.data.expires_in || 3600) * 1000,
    };

    await saveSession(req);
    res.redirect(frontendUrl);
  } catch (err) {
    next(err);
  }
});

router.get('/session', async (req, res) => {
  try {
    const spotifySession = await ensureValidSpotifySession(req);

    res.json({
      authenticated: Boolean(spotifySession?.access_token),
    });
  } catch (err) {
    console.error('Spotify session check failed:', err?.response?.data || err);
    res.status(500).json({ error: 'Failed to verify Spotify session' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const spotifySession = await ensureValidSpotifySession(req);

    if (!spotifySession?.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }

    const me = await spotifyGet(
      `${SPOTIFY_API_BASE}/me`,
      spotifySession.access_token
    );

    return res.json({
      id: me.id,
      display_name: me.display_name,
      email: me.email || null,
      product: me.product || null,
    });
  } catch (err) {
    console.error('Spotify /me failed:', err?.response?.data || err);
    return res.status(err?.response?.status || 500).json({
      error: getSpotifyErrorMessage(err, 'Spotify /me failed'),
    });
  }
});

router.post('/logout', async (req, res) => {
  try {
    req.session.spotify = null;
    req.session.spotify_state = null;
    await saveSession(req);

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to clear Spotify session' });
  }
});

router.post('/import/playlist', async (req, res) => {
  try {
    const playlistId = extractSpotifyId(req.body?.playlistId, 'playlist');

    if (!playlistId) {
      return res.status(400).json({ error: 'Invalid playlist ID or URL' });
    }

    const spotifySession = await ensureValidSpotifySession(req);

    if (!spotifySession?.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }

    const tracks = await fetchAllPlaylistTracks(
      playlistId,
      spotifySession.access_token
    );

    const report = await importSpotifyTracks(tracks);
    const saved = persistImportReport('spotify_playlist', playlistId, tracks, report);

    return res.json({
      source_type: 'spotify_playlist',
      source_id: playlistId,
      tracks_found: tracks.length,
      preview_titles: tracks.slice(0, 10).map((t) => `${t.artist} — ${t.title}`),
      imported: report.imported,
      skipped: report.skipped,
      invalid: report.invalid,
      errors: report.errors,
      summary: report.summary,
      rows: report.rows,
      errors_list: report.errors_list,
      report,
      report_id: saved.id,
    });
  } catch (err) {
    console.error('Spotify playlist import failed:', err?.response?.data || err);
    return res.status(err?.response?.status || 500).json({
      error: getSpotifyErrorMessage(err, 'Spotify playlist import failed'),
    });
  }
});

router.post('/import/album', async (req, res) => {
  try {
    const albumId = extractSpotifyId(req.body?.albumId, 'album');

    if (!albumId) {
      return res.status(400).json({ error: 'Invalid album ID or URL' });
    }

    const spotifySession = await ensureValidSpotifySession(req);

    if (!spotifySession?.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }

    const tracks = await fetchAllAlbumTracks(
      albumId,
      spotifySession.access_token
    );

    const report = await importSpotifyTracks(tracks);
    const saved = persistImportReport('spotify_album', albumId, tracks, report);

    return res.json({
      source_type: 'spotify_album',
      source_id: albumId,
      tracks_found: tracks.length,
      preview_titles: tracks.slice(0, 10).map((t) => `${t.artist} — ${t.title}`),
      imported: report.imported,
      skipped: report.skipped,
      invalid: report.invalid,
      errors: report.errors,
      summary: report.summary,
      rows: report.rows,
      errors_list: report.errors_list,
      report,
      report_id: saved.id,
    });
  } catch (err) {
    console.error('Spotify album import failed:', err?.response?.data || err);
    return res.status(err?.response?.status || 500).json({
      error: getSpotifyErrorMessage(err, 'Spotify album import failed'),
    });
  }
});

export default router;