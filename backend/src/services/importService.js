import db from '../db/index.js';
import { createSong } from './songService.js';
import { normalize } from '../utils/normalize.js';

function normalizeImportTrack(track) {
  if (!track || typeof track !== 'object') {
    return null;
  }

  const title = typeof track.title === 'string' ? track.title.trim() : '';
  const artist = typeof track.artist === 'string' ? track.artist.trim() : '';
  const album = typeof track.album === 'string' ? track.album.trim() : '';
  const language =
    typeof track.language === 'string' && track.language.trim()
      ? track.language.trim()
      : 'unknown';

  const spotify_id =
    typeof track.spotify_id === 'string' && track.spotify_id.trim()
      ? track.spotify_id.trim()
      : null;

  const spotify_url =
    typeof track.spotify_url === 'string' && track.spotify_url.trim()
      ? track.spotify_url.trim()
      : null;

  const album_spotify_id =
    typeof track.album_spotify_id === 'string' && track.album_spotify_id.trim()
      ? track.album_spotify_id.trim()
      : null;

  const cover_url =
    typeof track.cover_url === 'string' && track.cover_url.trim()
      ? track.cover_url.trim()
      : null;

  let track_number = null;
  if (
    track.track_number !== undefined &&
    track.track_number !== null &&
    track.track_number !== ''
  ) {
    const parsed = Number(track.track_number);
    if (Number.isFinite(parsed) && parsed > 0) {
      track_number = parsed;
    }
  }

  let year = null;
  if (track.year !== undefined && track.year !== null && track.year !== '') {
    const parsed = Number(track.year);
    if (Number.isFinite(parsed)) {
      year = parsed;
    }
  }

  if (!title || !artist) {
    return null;
  }

  const normalized_title = normalize(title);
  const normalized_artist = normalize(artist);

  return {
    title,
    artist,
    album,
    year,
    language,
    spotify_id,
    spotify_url,
    album_spotify_id,
    track_number,
    cover_url,
    normalized_title,
    normalized_artist,
  };
}

function findExistingBySpotifyId(spotifyId) {
  if (!spotifyId) {
    return null;
  }

  return db
    .prepare(
      `SELECT s.id,
              s.title,
              s.normalized_title,
              s.spotify_id,
              ar.name AS artist,
              ar.normalized AS normalized_artist,
              al.title AS album
       FROM songs s
       LEFT JOIN artists ar ON s.artist_id = ar.id
       LEFT JOIN albums al ON s.album_id = al.id
       WHERE s.spotify_id = ?
       LIMIT 1`
    )
    .get(spotifyId);
}

function findExistingByTitleArtist(track) {
  if (!track?.normalized_title || !track?.normalized_artist) {
    return null;
  }

  return db
    .prepare(
      `SELECT s.id,
              s.title,
              s.normalized_title,
              s.spotify_id,
              ar.name AS artist,
              ar.normalized AS normalized_artist,
              al.title AS album
       FROM songs s
       JOIN artists ar ON s.artist_id = ar.id
       LEFT JOIN albums al ON s.album_id = al.id
       WHERE s.normalized_title = ?
         AND ar.normalized = ?
       LIMIT 1`
    )
    .get(track.normalized_title, track.normalized_artist);
}

function createEmptyReport() {
  return {
    found: 0,
    imported: 0,
    skipped: 0,
    invalid: 0,
    errors: 0,
    summary: {
      imported: 0,
      skipped_existing_spotify_id: 0,
      skipped_existing_title_artist: 0,
      invalid_track_payload: 0,
      failed_insert: 0,
      other: 0,
    },
    rows: [],
    errors_list: [],
  };
}

function pushRow(report, row) {
  report.rows.push({
    title: row.title || '',
    artist: row.artist || '',
    album: row.album || '',
    year: row.year ?? null,
    track_number: row.track_number ?? null,
    language: row.language || '',
    action: row.action,
    reason: row.reason || '',
    error: row.error || '',
    spotify_id: row.spotify_id || null,
    spotify_url: row.spotify_url || null,
    album_spotify_id: row.album_spotify_id || null,
    normalized_title: row.normalized_title || '',
    normalized_artist: row.normalized_artist || '',
    matched_song_id: row.matched_song_id || null,
    matched_title: row.matched_title || '',
    matched_artist: row.matched_artist || '',
    matched_album: row.matched_album || '',
    matched_spotify_id: row.matched_spotify_id || null,
  });
}

function finalizeReport(report) {
  return {
    ...report,
    skipped:
      report.summary.skipped_existing_spotify_id +
      report.summary.skipped_existing_title_artist +
      report.summary.other,
  };
}

function buildMatchFields(existing) {
  if (!existing) {
    return {
      matched_song_id: null,
      matched_title: '',
      matched_artist: '',
      matched_album: '',
      matched_spotify_id: null,
    };
  }

  return {
    matched_song_id: existing.id || null,
    matched_title: existing.title || '',
    matched_artist: existing.artist || '',
    matched_album: existing.album || '',
    matched_spotify_id: existing.spotify_id || null,
  };
}

export function importSpotifyTracks(tracks) {
  const safeTracks = Array.isArray(tracks) ? tracks : [];
  const report = createEmptyReport();
  report.found = safeTracks.length;

  const importAll = db.transaction(() => {
    for (const rawTrack of safeTracks) {
      try {
        const track = normalizeImportTrack(rawTrack);

        if (!track) {
          report.invalid += 1;
          report.summary.invalid_track_payload += 1;

          const normalized_title = normalize(
            typeof rawTrack?.title === 'string' ? rawTrack.title : ''
          );
          const normalized_artist = normalize(
            typeof rawTrack?.artist === 'string' ? rawTrack.artist : ''
          );

          pushRow(report, {
            title: rawTrack?.title || '',
            artist: rawTrack?.artist || '',
            album: rawTrack?.album || '',
            spotify_id: rawTrack?.spotify_id || null,
            spotify_url: rawTrack?.spotify_url || null,
            album_spotify_id: rawTrack?.album_spotify_id || null,
            normalized_title,
            normalized_artist,
            action: 'invalid',
            reason: 'invalid_track_payload',
          });

          continue;
        }

        const existingBySpotifyId = findExistingBySpotifyId(track.spotify_id);
        if (existingBySpotifyId) {
          report.summary.skipped_existing_spotify_id += 1;

          pushRow(report, {
            ...track,
            ...buildMatchFields(existingBySpotifyId),
            action: 'skipped',
            reason: 'existing_spotify_id',
          });

          continue;
        }

        const existingByTitleArtist = findExistingByTitleArtist(track);
        if (existingByTitleArtist) {
          report.summary.skipped_existing_title_artist += 1;

          pushRow(report, {
            ...track,
            ...buildMatchFields(existingByTitleArtist),
            action: 'skipped',
            reason: 'existing_title_artist',
          });

          continue;
        }

        createSong(track);
        report.imported += 1;
        report.summary.imported += 1;

        pushRow(report, {
          ...track,
          action: 'imported',
          reason: 'created',
        });
      } catch (err) {
        report.errors += 1;
        report.summary.failed_insert += 1;

        const message = err?.message || 'Unknown import error';

        report.errors_list.push({
          track: rawTrack?.title || '[unknown]',
          error: message,
        });

        const normalized_title = normalize(
          typeof rawTrack?.title === 'string' ? rawTrack.title : ''
        );
        const normalized_artist = normalize(
          typeof rawTrack?.artist === 'string' ? rawTrack.artist : ''
        );

        pushRow(report, {
          title: rawTrack?.title || '',
          artist: rawTrack?.artist || '',
          album: rawTrack?.album || '',
          spotify_id: rawTrack?.spotify_id || null,
          spotify_url: rawTrack?.spotify_url || null,
          album_spotify_id: rawTrack?.album_spotify_id || null,
          normalized_title,
          normalized_artist,
          action: 'error',
          reason: 'failed_insert',
          error: message,
        });
      }
    }
  });

  importAll();

  return finalizeReport(report);
}

export function importFromJSON(records) {
  const safeRecords = Array.isArray(records) ? records : [];
  const report = createEmptyReport();
  report.found = safeRecords.length;

  const importAll = db.transaction(() => {
    for (const rawRecord of safeRecords) {
      try {
        const record = normalizeImportTrack(rawRecord);

        if (!record) {
          report.invalid += 1;
          report.summary.invalid_track_payload += 1;

          const normalized_title = normalize(
            typeof rawRecord?.title === 'string' ? rawRecord.title : ''
          );
          const normalized_artist = normalize(
            typeof rawRecord?.artist === 'string' ? rawRecord.artist : ''
          );

          pushRow(report, {
            title: rawRecord?.title || '',
            artist: rawRecord?.artist || '',
            album: rawRecord?.album || '',
            spotify_id: rawRecord?.spotify_id || null,
            spotify_url: rawRecord?.spotify_url || null,
            album_spotify_id: rawRecord?.album_spotify_id || null,
            normalized_title,
            normalized_artist,
            action: 'invalid',
            reason: 'invalid_track_payload',
          });

          continue;
        }

        const existingBySpotifyId = findExistingBySpotifyId(record.spotify_id);
        if (existingBySpotifyId) {
          report.summary.skipped_existing_spotify_id += 1;

          pushRow(report, {
            ...record,
            ...buildMatchFields(existingBySpotifyId),
            action: 'skipped',
            reason: 'existing_spotify_id',
          });

          continue;
        }

        const existingByTitleArtist = findExistingByTitleArtist(record);
        if (existingByTitleArtist) {
          report.summary.skipped_existing_title_artist += 1;

          pushRow(report, {
            ...record,
            ...buildMatchFields(existingByTitleArtist),
            action: 'skipped',
            reason: 'existing_title_artist',
          });

          continue;
        }

        createSong(record);
        report.imported += 1;
        report.summary.imported += 1;

        pushRow(report, {
          ...record,
          action: 'imported',
          reason: 'created',
        });
      } catch (err) {
        report.errors += 1;
        report.summary.failed_insert += 1;

        const message = err?.message || 'Unknown import error';

        report.errors_list.push({
          record: rawRecord?.title || '[unknown]',
          error: message,
        });

        const normalized_title = normalize(
          typeof rawRecord?.title === 'string' ? rawRecord.title : ''
        );
        const normalized_artist = normalize(
          typeof rawRecord?.artist === 'string' ? rawRecord.artist : ''
        );

        pushRow(report, {
          title: rawRecord?.title || '',
          artist: rawRecord?.artist || '',
          album: rawRecord?.album || '',
          spotify_id: rawRecord?.spotify_id || null,
          spotify_url: rawRecord?.spotify_url || null,
          album_spotify_id: rawRecord?.album_spotify_id || null,
          normalized_title,
          normalized_artist,
          action: 'error',
          reason: 'failed_insert',
          error: message,
        });
      }
    }
  });

  importAll();

  return finalizeReport(report);
}