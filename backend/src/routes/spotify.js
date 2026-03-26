import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { importSpotifyTracks } from '../services/importService.js';
import { createImportBatchReport } from '../services/reportService.js';
import {
  createBackgroundJob,
  findActiveJobByMeta,
} from '../services/jobService.js';
import {
  replacePlaylistSongs,
  upsertSpotifyPlaylist,
} from '../services/playlistsService.js';

const router = Router();

const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const DEFAULT_FRONTEND_URL = 'http://127.0.0.1:5173';
const SPOTIFY_TIMEOUT_MS = 15000;
const ALLOWED_FRONTEND_HOSTS = new Set(['127.0.0.1', 'localhost']);
const ALLOWED_FRONTEND_PORTS = new Set(['5173', '5174']);

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

function getSpotifyStatusPayload() {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim() || '';
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI?.trim() || '';
  const frontendUrl = process.env.FRONTEND_URL?.trim() || DEFAULT_FRONTEND_URL;

  const missing = [];

  if (!clientId) missing.push('SPOTIFY_CLIENT_ID');
  if (!clientSecret) missing.push('SPOTIFY_CLIENT_SECRET');
  if (!redirectUri) missing.push('SPOTIFY_REDIRECT_URI');

  return {
    configured: missing.length === 0,
    missing,
    redirect_uri: redirectUri || null,
    frontend_url: frontendUrl,
  };
}

function getSafeFrontendOrigin(req) {
  const candidates = [req.get('origin'), req.get('referer')];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') {
      continue;
    }

    try {
      const url = new URL(candidate);
      const port =
        url.port || (url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : '');

      if (!ALLOWED_FRONTEND_HOSTS.has(url.hostname)) {
        continue;
      }

      if (!ALLOWED_FRONTEND_PORTS.has(port)) {
        continue;
      }

      return url.origin;
    } catch {
      continue;
    }
  }

  return '';
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

  const uriMatch = value.match(/^spotify:(playlist|album|track):([A-Za-z0-9]+)$/i);
  if (uriMatch) {
    const [, type, id] = uriMatch;
    if (!expectedType || type.toLowerCase() === expectedType.toLowerCase()) {
      return id;
    }
    return '';
  }

  const urlMatch = value.match(
    /spotify\.com\/(playlist|album|track)\/([A-Za-z0-9]+)(?:\?|#|\/|$)/i
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

function extractSpotifyTarget(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const value = input.trim();
  if (!value) {
    return null;
  }

  const uriMatch = value.match(/^spotify:(playlist|album|track):([A-Za-z0-9]+)$/i);
  if (uriMatch) {
    return {
      type: uriMatch[1].toLowerCase(),
      id: uriMatch[2],
    };
  }

  const urlMatch = value.match(
    /spotify\.com\/(playlist|album|track)\/([A-Za-z0-9]+)(?:\?|#|\/|$)/i
  );
  if (urlMatch) {
    return {
      type: urlMatch[1].toLowerCase(),
      id: urlMatch[2],
    };
  }

  const rawId = extractSpotifyId(value);
  if (!rawId) {
    return null;
  }

  return {
    type: null,
    id: rawId,
  };
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

function buildFrontendReturnUrl(frontendUrl, returnTo, params = {}) {
  const url = new URL(returnTo || '/import', frontendUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
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
      timeout: SPOTIFY_TIMEOUT_MS,
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
    timeout: SPOTIFY_TIMEOUT_MS,
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

async function fetchPlaylistDetails(playlistId, accessToken) {
  const playlist = await spotifyGet(
    `${SPOTIFY_API_BASE}/playlists/${playlistId}`,
    accessToken,
    {
      fields: 'id,name,description,external_urls,images',
    }
  );

  return {
    spotifyId: firstString(playlist?.id),
    name: firstString(playlist?.name, 'Spotify Playlist'),
    description: firstString(playlist?.description) || null,
    sourceUrl: firstString(playlist?.external_urls?.spotify) || null,
    imageUrl: firstString(playlist?.images?.[0]?.url) || null,
  };
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

async function fetchSpotifyTrack(trackId, accessToken) {
  const track = await spotifyGet(`${SPOTIFY_API_BASE}/tracks/${trackId}`, accessToken);
  const normalized = normalizeTrackLikeObject(track);

  if (!normalized) {
    throw new Error('Spotify track could not be normalized');
  }

  return [normalized];
}

function shouldContinueSpotifyTypeProbe(err) {
  const status = Number(err?.response?.status || 0);
  return status === 400 || status === 404;
}

async function detectSpotifyImportTarget(input, accessToken) {
  const extracted = extractSpotifyTarget(input);

  if (!extracted?.id) {
    return null;
  }

  if (extracted.type) {
    return extracted;
  }

  const probes = [
    {
      type: 'track',
      run: () => spotifyGet(`${SPOTIFY_API_BASE}/tracks/${extracted.id}`, accessToken),
    },
    {
      type: 'album',
      run: () => spotifyGet(`${SPOTIFY_API_BASE}/albums/${extracted.id}`, accessToken),
    },
    {
      type: 'playlist',
      run: () =>
        spotifyGet(`${SPOTIFY_API_BASE}/playlists/${extracted.id}`, accessToken, {
          fields: 'id',
        }),
    },
  ];

  for (const probe of probes) {
    try {
      await probe.run();
      return {
        type: probe.type,
        id: extracted.id,
      };
    } catch (err) {
      if (shouldContinueSpotifyTypeProbe(err)) {
        continue;
      }

      throw err;
    }
  }

  return null;
}

function getSpotifyImportMeta(target) {
  const typeMap = {
    playlist: {
      jobType: 'spotify_playlist_import',
      label: 'Spotify playlist import',
      subtype: 'spotify_playlist',
      fetchPhase: 'fetching_playlist',
      fetchLabel: 'Fetching Spotify playlist',
    },
    album: {
      jobType: 'spotify_album_import',
      label: 'Spotify album import',
      subtype: 'spotify_album',
      fetchPhase: 'fetching_album',
      fetchLabel: 'Fetching Spotify album',
    },
    track: {
      jobType: 'spotify_track_import',
      label: 'Spotify song import',
      subtype: 'spotify_track',
      fetchPhase: 'fetching_song',
      fetchLabel: 'Fetching Spotify song',
    },
  };

  return typeMap[target?.type] || null;
}

async function runSpotifyImportTarget(target, accessToken, controls = null) {
  const meta = getSpotifyImportMeta(target);

  if (!meta) {
    throw new Error('Unsupported Spotify import target');
  }

  controls?.setPhase(meta.fetchPhase, meta.fetchLabel);

  let tracks = [];
  let playlist = null;

  if (target.type === 'playlist') {
    const playlistMeta = await fetchPlaylistDetails(target.id, accessToken);
    tracks = await fetchAllPlaylistTracks(target.id, accessToken);
    controls?.setTotal(tracks.length);
    controls?.setPhase('importing_tracks', `Importing ${tracks.length} tracks`);

    const report = importSpotifyTracks(tracks, controls ? {
      onRow(row, liveReport) {
        controls.setCurrent(`${row.artist || ''} - ${row.title || ''}`.trim());
        controls.addEntry(row);
        controls.updateProgress({
          total: tracks.length,
          completed: liveReport.rows.length,
          succeeded: liveReport.imported + liveReport.linked_existing,
          failed: liveReport.errors + liveReport.invalid,
          skipped: 0,
        });
      },
    } : undefined);

    const saved = persistImportReport(meta.subtype, target.id, tracks, report);
    const linkedSongIds = (Array.isArray(report.rows) ? report.rows : [])
      .map((row) => row.song_id || row.matched_song_id || null)
      .filter(Boolean);

    playlist = upsertSpotifyPlaylist(playlistMeta);
    replacePlaylistSongs(playlist.id, linkedSongIds);

    return {
      meta,
      tracks,
      report,
      saved,
      playlist,
    };
  }

  if (target.type === 'album') {
    tracks = await fetchAllAlbumTracks(target.id, accessToken);
    controls?.setTotal(tracks.length);
    controls?.setPhase('importing_tracks', `Importing ${tracks.length} tracks`);

    const report = importSpotifyTracks(tracks, controls ? {
      onRow(row, liveReport) {
        controls.setCurrent(`${row.artist || ''} - ${row.title || ''}`.trim());
        controls.addEntry(row);
        controls.updateProgress({
          total: tracks.length,
          completed: liveReport.rows.length,
          succeeded: liveReport.imported + liveReport.linked_existing,
          failed: liveReport.errors + liveReport.invalid,
          skipped: 0,
        });
      },
    } : undefined);

    const saved = persistImportReport(meta.subtype, target.id, tracks, report);

    return {
      meta,
      tracks,
      report,
      saved,
      playlist: null,
    };
  }

  tracks = await fetchSpotifyTrack(target.id, accessToken);
  controls?.setTotal(tracks.length);
  controls?.setPhase('importing_tracks', `Importing ${tracks.length} song`);

  const report = importSpotifyTracks(tracks, controls ? {
    onRow(row, liveReport) {
      controls.setCurrent(`${row.artist || ''} - ${row.title || ''}`.trim());
      controls.addEntry(row);
      controls.updateProgress({
        total: tracks.length,
        completed: liveReport.rows.length,
        succeeded: liveReport.imported + liveReport.linked_existing,
        failed: liveReport.errors + liveReport.invalid,
        skipped: 0,
      });
    },
  } : undefined);

  const saved = persistImportReport(meta.subtype, target.id, tracks, report);

  return {
    meta,
    tracks,
    report,
    saved,
    playlist: null,
  };
}

function persistImportReport(subtype, sourceId, tracks, report) {
  return createImportBatchReport({
    subtype,
    sourceId,
    rows: report.rows,
    found: tracks.length,
    summary: {
      found: Number(tracks.length || 0),
      imported: Number(report.imported || 0),
      linked_existing: Number(report.linked_existing || 0),
      passed: Number((report.imported || 0) + (report.linked_existing || 0)),
      blocked: Number(report.blocked || 0),
      skipped: Number(report.skipped || 0),
      invalid: Number(report.invalid || 0),
      errors: Number(report.errors || 0),
      ...(report.summary || {}),
    },
    meta: {
      preview_titles: tracks.slice(0, 10).map((t) => `${t.artist} - ${t.title}`),
    },
    errorsList: report.errors_list,
  });
}

function buildSpotifyImportResponse({
  subtype,
  sourceId,
  tracks,
  report,
  saved,
  playlist = null,
}) {
  return {
    source_type: subtype,
    source_id: sourceId,
    playlist,
    tracks_found: tracks.length,
    preview_titles: tracks.slice(0, 10).map((t) => `${t.artist} - ${t.title}`),
    imported: report.imported,
    linked_existing: report.linked_existing,
    passed: report.imported + report.linked_existing,
    blocked: report.blocked,
    skipped: report.skipped,
    invalid: report.invalid,
    errors: report.errors,
    summary: report.summary,
    rows: report.rows,
    errors_list: report.errors_list,
    report,
    report_id: saved.id,
  };
}

router.post('/import/background', async (req, res) => {
  try {
    const spotifySession = await ensureValidSpotifySession(req);

    if (!spotifySession?.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }

    const target = await detectSpotifyImportTarget(
      req.body?.spotifyInput || req.body?.source || '',
      spotifySession.access_token
    );

    if (!target?.id || !target?.type) {
      return res.status(400).json({
        error: 'Enter a Spotify playlist, album, or song URL, URI, or ID',
      });
    }

    const importMeta = getSpotifyImportMeta(target);
    const existingJob = findActiveJobByMeta(
      importMeta.jobType,
      {
        spotify_id: target.id,
      },
      ['spotify_id']
    );

    if (existingJob) {
      return res.status(200).json({
        ...existingJob,
        reused: true,
      });
    }

    const accessToken = spotifySession.access_token;
    const job = createBackgroundJob({
      type: importMeta.jobType,
      label: importMeta.label,
      meta: {
        spotify_id: target.id,
      },
      run: async (controls) => {
        const { meta, tracks, report, saved, playlist } = await runSpotifyImportTarget(
          target,
          accessToken,
          controls
        );

        controls.complete({
          summary: saved.summary || report.summary || {},
          report_id: saved.id,
          entries: report.rows,
          result: buildSpotifyImportResponse({
            subtype: meta.subtype,
            sourceId: target.id,
            tracks,
            report,
            saved,
            playlist,
          }),
        });
      },
    });

    return res.status(202).json(job);
  } catch (err) {
    return res.status(err?.response?.status || 500).json({
      error: getSpotifyErrorMessage(err, 'Spotify background import failed'),
    });
  }
});

router.get('/status', async (req, res) => {
  const config = getSpotifyStatusPayload();

  if (!config.configured) {
    return res.json({
      ...config,
      authenticated: false,
      account: null,
    });
  }

  try {
    const spotifySession = await ensureValidSpotifySession(req);
    let account = null;

    if (spotifySession?.access_token) {
      try {
        const me = await spotifyGet(`${SPOTIFY_API_BASE}/me`, spotifySession.access_token);
        account = {
          id: me.id,
          display_name: me.display_name || '',
          email: me.email || null,
          product: me.product || null,
        };
      } catch (err) {
        console.error('Spotify status /me failed:', err?.response?.data || err);
      }
    }

    return res.json({
      ...config,
      authenticated: Boolean(spotifySession?.access_token),
      account,
    });
  } catch (err) {
    console.error('Spotify status failed:', err?.response?.data || err);
    return res.status(500).json({
      error: getSpotifyErrorMessage(err, 'Failed to load Spotify status'),
    });
  }
});

router.get('/login', async (req, res, next) => {
  try {
    const { clientId, redirectUri, frontendUrl } = getSpotifyConfig();

    const state = crypto.randomBytes(16).toString('hex');
    req.session.spotify_state = state;
    req.session.spotify_return_to =
      typeof req.query.returnTo === 'string' && req.query.returnTo.startsWith('/')
        ? req.query.returnTo
        : '/import';
    req.session.spotify_frontend_url = getSafeFrontendOrigin(req) || frontendUrl;

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

    const returnTo =
      typeof req.session.spotify_return_to === 'string' &&
      req.session.spotify_return_to.startsWith('/')
        ? req.session.spotify_return_to
        : '/import';
    const returnFrontendUrl =
      typeof req.session.spotify_frontend_url === 'string' &&
      req.session.spotify_frontend_url.trim()
        ? req.session.spotify_frontend_url.trim()
        : frontendUrl;

    if (!code) {
      return res.redirect(
        buildFrontendReturnUrl(returnFrontendUrl, returnTo, {
          spotify: 'error',
          spotify_error: 'missing_code',
        })
      );
    }

    if (!state || state !== req.session?.spotify_state) {
      delete req.session.spotify_state;
      delete req.session.spotify_return_to;
      delete req.session.spotify_frontend_url;
      await saveSession(req);

      return res.redirect(
        buildFrontendReturnUrl(returnFrontendUrl, returnTo, {
          spotify: 'error',
          spotify_error: 'invalid_state',
        })
      );
    }

    delete req.session.spotify_state;
    delete req.session.spotify_return_to;
    delete req.session.spotify_frontend_url;

    const tokenRes = await axios.post(
      `${SPOTIFY_ACCOUNTS_BASE}/api/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
      {
        timeout: SPOTIFY_TIMEOUT_MS,
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
    res.redirect(
      buildFrontendReturnUrl(returnFrontendUrl, returnTo, {
        spotify: 'connected',
      })
    );
  } catch (err) {
    try {
      const { frontendUrl } = getSpotifyConfig();
      const returnTo =
        typeof req.session?.spotify_return_to === 'string' &&
        req.session.spotify_return_to.startsWith('/')
          ? req.session.spotify_return_to
          : '/import';
      const returnFrontendUrl =
        typeof req.session?.spotify_frontend_url === 'string' &&
        req.session.spotify_frontend_url.trim()
          ? req.session.spotify_frontend_url.trim()
          : frontendUrl;

      delete req.session.spotify_state;
      delete req.session.spotify_return_to;
      delete req.session.spotify_frontend_url;
      await saveSession(req);

      return res.redirect(
        buildFrontendReturnUrl(returnFrontendUrl, returnTo, {
          spotify: 'error',
          spotify_error: getSpotifyErrorMessage(err, 'spotify_auth_failed'),
        })
      );
    } catch {
      next(err);
    }
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

    const playlistMeta = await fetchPlaylistDetails(
      playlistId,
      spotifySession.access_token
    );

    const tracks = await fetchAllPlaylistTracks(
      playlistId,
      spotifySession.access_token
    );

    const report = await importSpotifyTracks(tracks);
    const saved = persistImportReport('spotify_playlist', playlistId, tracks, report);
    const linkedSongIds = (Array.isArray(report.rows) ? report.rows : [])
      .map((row) => row.song_id || row.matched_song_id || null)
      .filter(Boolean);

    const playlist = upsertSpotifyPlaylist(playlistMeta);
    replacePlaylistSongs(playlist.id, linkedSongIds);

    return res.json({
      source_type: 'spotify_playlist',
      source_id: playlistId,
      playlist,
      tracks_found: tracks.length,
      preview_titles: tracks.slice(0, 10).map((t) => `${t.artist} — ${t.title}`),
      imported: report.imported,
      linked_existing: report.linked_existing,
      passed: report.imported + report.linked_existing,
      blocked: report.blocked,
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
      linked_existing: report.linked_existing,
      passed: report.imported + report.linked_existing,
      blocked: report.blocked,
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

router.post('/import/playlist/background', async (req, res) => {
  try {
    const playlistId = extractSpotifyId(req.body?.playlistId, 'playlist');

    if (!playlistId) {
      return res.status(400).json({ error: 'Invalid playlist ID or URL' });
    }

    const spotifySession = await ensureValidSpotifySession(req);

    if (!spotifySession?.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }

    const accessToken = spotifySession.access_token;

    const existingJob = findActiveJobByMeta(
      'spotify_playlist_import',
      {
        spotify_id: playlistId,
      },
      ['spotify_id']
    );

    if (existingJob) {
      return res.status(200).json({
        ...existingJob,
        reused: true,
      });
    }

    const job = createBackgroundJob({
      type: 'spotify_playlist_import',
      label: 'Spotify playlist import',
      meta: {
        spotify_id: playlistId,
      },
      run: async (controls) => {
        controls.setPhase('fetching_playlist', 'Fetching Spotify playlist');

        const playlistMeta = await fetchPlaylistDetails(playlistId, accessToken);
        const tracks = await fetchAllPlaylistTracks(playlistId, accessToken);

        controls.setTotal(tracks.length);
        controls.setPhase('importing_tracks', `Importing ${tracks.length} tracks`);

        const report = importSpotifyTracks(tracks, {
          onRow(row, liveReport) {
            controls.setCurrent(`${row.artist || ''} - ${row.title || ''}`.trim());
            controls.addEntry(row);
            controls.updateProgress({
              total: tracks.length,
              completed: liveReport.rows.length,
              succeeded: liveReport.imported + liveReport.linked_existing,
              failed: liveReport.errors + liveReport.invalid,
              skipped: 0,
            });
          },
        });
        const saved = persistImportReport('spotify_playlist', playlistId, tracks, report);
        const linkedSongIds = (Array.isArray(report.rows) ? report.rows : [])
          .map((row) => row.song_id || row.matched_song_id || null)
          .filter(Boolean);

        const playlist = upsertSpotifyPlaylist(playlistMeta);
        replacePlaylistSongs(playlist.id, linkedSongIds);

        controls.complete({
          summary: saved.summary || report.summary || {},
          report_id: saved.id,
          entries: report.rows,
          result: buildSpotifyImportResponse({
            subtype: 'spotify_playlist',
            sourceId: playlistId,
            tracks,
            report,
            saved,
            playlist,
          }),
        });
      },
    });

    return res.status(202).json(job);
  } catch (err) {
    return res.status(err?.response?.status || 500).json({
      error: getSpotifyErrorMessage(err, 'Spotify background playlist import failed'),
    });
  }
});

router.post('/import/album/background', async (req, res) => {
  try {
    const albumId = extractSpotifyId(req.body?.albumId, 'album');

    if (!albumId) {
      return res.status(400).json({ error: 'Invalid album ID or URL' });
    }

    const spotifySession = await ensureValidSpotifySession(req);

    if (!spotifySession?.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }

    const accessToken = spotifySession.access_token;

    const existingJob = findActiveJobByMeta(
      'spotify_album_import',
      {
        spotify_id: albumId,
      },
      ['spotify_id']
    );

    if (existingJob) {
      return res.status(200).json({
        ...existingJob,
        reused: true,
      });
    }

    const job = createBackgroundJob({
      type: 'spotify_album_import',
      label: 'Spotify album import',
      meta: {
        spotify_id: albumId,
      },
      run: async (controls) => {
        controls.setPhase('fetching_album', 'Fetching Spotify album');

        const tracks = await fetchAllAlbumTracks(albumId, accessToken);

        controls.setTotal(tracks.length);
        controls.setPhase('importing_tracks', `Importing ${tracks.length} tracks`);

        const report = importSpotifyTracks(tracks, {
          onRow(row, liveReport) {
            controls.setCurrent(`${row.artist || ''} - ${row.title || ''}`.trim());
            controls.addEntry(row);
            controls.updateProgress({
              total: tracks.length,
              completed: liveReport.rows.length,
              succeeded: liveReport.imported + liveReport.linked_existing,
              failed: liveReport.errors + liveReport.invalid,
              skipped: 0,
            });
          },
        });
        const saved = persistImportReport('spotify_album', albumId, tracks, report);

        controls.complete({
          summary: saved.summary || report.summary || {},
          report_id: saved.id,
          entries: report.rows,
          result: buildSpotifyImportResponse({
            subtype: 'spotify_album',
            sourceId: albumId,
            tracks,
            report,
            saved,
          }),
        });
      },
    });

    return res.status(202).json(job);
  } catch (err) {
    return res.status(err?.response?.status || 500).json({
      error: getSpotifyErrorMessage(err, 'Spotify background album import failed'),
    });
  }
});

export default router;
