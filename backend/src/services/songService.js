import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { normalize } from '../utils/normalize.js';
import { sanitizeText } from '../utils/sanitize.js';
import { cleanLyricsText } from '../utils/lyricsCleanup.js';

function cleanString(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function cleanNullableString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function cleanYear(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanTrackNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cleanArtistForLyrics(artist = '') {
  let value = cleanWhitespace(artist);

  if (!value) return '';

  value = value
    .split(/\s*(?:,|&| x | X |\/| with | ו | and )\s*/i)[0]
    .trim();

  value = value
    .replace(/\s*\((feat|ft|featuring)\.?\s+[^)]*\)\s*$/i, '')
    .replace(/\s*\[(feat|ft|featuring)\.?\s+[^\]]*\]\s*$/i, '')
    .replace(/\s*-\s*(official|live|acoustic|remastered)\b.*$/i, '');

  return cleanWhitespace(value);
}

function upsertArtist(name) {
  const cleanName = cleanString(name, 'Unknown');
  const norm = normalize(cleanName);

  const existing = db
    .prepare('SELECT * FROM artists WHERE normalized = ? LIMIT 1')
    .get(norm);

  if (existing) {
    return existing;
  }

  const id = uuidv4();

  db.prepare(
    'INSERT INTO artists (id, name, normalized) VALUES (?, ?, ?)'
  ).run(id, sanitizeText(cleanName), norm);

  return db.prepare('SELECT * FROM artists WHERE id = ?').get(id);
}

function findAlbumBySpotifyId(spotifyId) {
  const cleanSpotifyId = cleanNullableString(spotifyId);
  if (!cleanSpotifyId) {
    return null;
  }

  return db
    .prepare('SELECT * FROM albums WHERE spotify_id = ? LIMIT 1')
    .get(cleanSpotifyId);
}

function findAlbumByTitleAndArtist(title, artistId) {
  const cleanTitle = cleanString(title);
  if (!cleanTitle || !artistId) {
    return null;
  }

  const norm = normalize(cleanTitle);

  return db
    .prepare(
      'SELECT * FROM albums WHERE normalized = ? AND artist_id = ? LIMIT 1'
    )
    .get(norm, artistId);
}

function updateAlbumMetadata(albumId, { title, year, coverUrl, spotifyId, artistId }) {
  const cleanTitle = cleanString(title);
  const normalized = cleanTitle ? normalize(cleanTitle) : null;
  const nextYear = cleanYear(year);
  const nextCoverUrl = cleanNullableString(coverUrl);
  const nextSpotifyId = cleanNullableString(spotifyId);

  db.prepare(
    `UPDATE albums
     SET title = COALESCE(?, title),
         normalized = COALESCE(?, normalized),
         artist_id = COALESCE(?, artist_id),
         year = COALESCE(?, year),
         cover_url = COALESCE(?, cover_url),
         spotify_id = COALESCE(?, spotify_id)
     WHERE id = ?`
  ).run(
    cleanTitle || null,
    normalized,
    artistId || null,
    nextYear,
    nextCoverUrl,
    nextSpotifyId,
    albumId
  );

  return db.prepare('SELECT * FROM albums WHERE id = ?').get(albumId);
}

function upsertAlbum({ title, artistId, year, coverUrl, spotifyId }) {
  const cleanTitle = cleanString(title);
  if (!cleanTitle) {
    return null;
  }

  const cleanSpotifyId = cleanNullableString(spotifyId);

  const existingBySpotifyId = findAlbumBySpotifyId(cleanSpotifyId);
  if (existingBySpotifyId) {
    return updateAlbumMetadata(existingBySpotifyId.id, {
      title: cleanTitle,
      year,
      coverUrl,
      spotifyId: cleanSpotifyId,
      artistId,
    });
  }

  const existingByTitleArtist = findAlbumByTitleAndArtist(cleanTitle, artistId);
  if (existingByTitleArtist) {
    return updateAlbumMetadata(existingByTitleArtist.id, {
      title: cleanTitle,
      year,
      coverUrl,
      spotifyId: cleanSpotifyId,
      artistId,
    });
  }

  const id = uuidv4();

  db.prepare(
    `INSERT INTO albums (id, title, normalized, artist_id, year, cover_url, spotify_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    sanitizeText(cleanTitle),
    normalize(cleanTitle),
    artistId,
    cleanYear(year),
    cleanNullableString(coverUrl),
    cleanSpotifyId
  );

  return db.prepare('SELECT * FROM albums WHERE id = ?').get(id);
}

export function getSongs({
  ids,
  search,
  artist,
  album,
  year,
  status,
  tags,
  playlistId,
  sort = 'title',
  page = 1,
  limit = 50,
} = {}) {
  const effectiveLyricsStatusSql = `
    CASE
      WHEN lx.text IS NOT NULL AND TRIM(lx.text) <> ''
        AND (s.lyrics_status IS NULL OR s.lyrics_status = 'missing')
      THEN CASE
        WHEN lx.is_verified = 1 THEN 'reviewed'
        WHEN lx.source = 'manual' THEN 'manual'
        ELSE 'auto'
      END
      ELSE COALESCE(s.lyrics_status, 'missing')
    END
  `;

  let sql = `
    SELECT s.*,
           ar.name AS artist_name,
           al.title AS album_title,
           lx.text AS lyrics_text,
           lx.source AS lyrics_source,
           lx.confidence_score AS lyrics_confidence_score,
           lx.is_verified AS lyrics_is_verified,
           ${effectiveLyricsStatusSql} AS effective_lyrics_status
    FROM songs s
    LEFT JOIN artists ar ON s.artist_id = ar.id
    LEFT JOIN albums al ON s.album_id = al.id
    LEFT JOIN lyrics lx ON lx.song_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (Array.isArray(ids) && ids.length > 0) {
    sql += ` AND s.id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }

  if (search) {
    sql += ' AND (s.normalized_title LIKE ? OR ar.normalized LIKE ?)';
    const q = `%${normalize(search)}%`;
    params.push(q, q);
  }

  if (artist) {
    sql += ' AND ar.name = ?';
    params.push(artist);
  }

  if (album) {
    sql += ' AND al.title = ?';
    params.push(album);
  }

  if (year) {
    sql += ' AND s.year = ?';
    params.push(year);
  }

  if (status) {
    if (status === 'has_lyrics') {
      sql += ` AND ${effectiveLyricsStatusSql} <> ?`;
      params.push('missing');
    } else {
      sql += ` AND ${effectiveLyricsStatusSql} = ?`;
      params.push(status);
    }
  }

  if (playlistId) {
    sql += `
      AND s.id IN (
        SELECT song_id
        FROM playlist_songs
        WHERE playlist_id = ?
      )
    `;
    params.push(playlistId);
  }

  if (Array.isArray(tags) && tags.length > 0) {
    sql += `
      AND s.id IN (
        SELECT song_id
        FROM song_tags st
        JOIN tags t ON st.tag_id = t.id
        WHERE t.name IN (${tags.map(() => '?').join(',')})
        GROUP BY song_id
        HAVING COUNT(*) = ${tags.length}
      )
    `;
    params.push(...tags);
  }

  const allowedSort = {
    title: 's.normalized_title',
    artist: 'ar.normalized',
    year: 's.year',
  };

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(2000, Number(limit) || 50));

  sql += ` ORDER BY ${allowedSort[sort] || 's.normalized_title'}`;
  sql += ' LIMIT ? OFFSET ?';
  params.push(safeLimit, (safePage - 1) * safeLimit);

  return db
    .prepare(sql)
    .all(...params)
    .map((row) => ({
      ...row,
      lyrics_status: row.effective_lyrics_status || row.lyrics_status || 'missing',
      lyrics: row.lyrics_text
        ? {
            text: row.lyrics_text,
            source: row.lyrics_source || null,
            confidence_score: row.lyrics_confidence_score ?? null,
            is_verified: row.lyrics_is_verified ? 1 : 0,
          }
        : null,
    }));
}

export function getSongById(id) {
  const song = db
    .prepare(
      `SELECT s.*, ar.name AS artist_name, al.title AS album_title
       FROM songs s
       LEFT JOIN artists ar ON s.artist_id = ar.id
       LEFT JOIN albums al ON s.album_id = al.id
       WHERE s.id = ?`
    )
    .get(id);

  if (!song) {
    return null;
  }

  song.lyrics =
    db
      .prepare(
        'SELECT * FROM lyrics WHERE song_id = ? LIMIT 1'
      )
      .get(id) || null;

  song.tags = db
    .prepare(
      `SELECT t.name
       FROM tags t
       JOIN song_tags st ON t.id = st.tag_id
       WHERE st.song_id = ?`
    )
    .all(id)
    .map((row) => row.name);

  return song;
}

export function createSong(data) {
  const artist = upsertArtist(data.artist || 'Unknown');

  const album = data.album
    ? upsertAlbum({
        title: data.album,
        artistId: artist.id,
        year: data.year,
        coverUrl: data.cover_url,
        spotifyId: data.album_spotify_id,
      })
    : null;

  const id = uuidv4();

  db.prepare(
    `INSERT INTO songs
      (id, title, normalized_title, artist_id, album_id, track_number,
       year, language, version_type, spotify_id, spotify_url, cover_url, lyrics_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'missing')`
  ).run(
    id,
    sanitizeText(cleanString(data.title, 'Untitled')),
    normalize(cleanString(data.title, 'Untitled')),
    artist.id,
    album?.id || null,
    cleanTrackNumber(data.track_number),
    cleanYear(data.year),
    cleanString(data.language, 'unknown'),
    cleanNullableString(data.version_type),
    cleanNullableString(data.spotify_id),
    cleanNullableString(data.spotify_url),
    cleanNullableString(data.cover_url)
  );

  return getSongById(id);
}

export function updateSong(id, data) {
  const current = getSongById(id);
  if (!current) {
    throw new Error('Song not found');
  }

  const fields = [];
  const values = [];

  let nextArtistId = current.artist_id;

  if (data.artist !== undefined) {
    const artist = upsertArtist(data.artist || 'Unknown');
    nextArtistId = artist.id;
    fields.push('artist_id = ?');
    values.push(nextArtistId);
  }

  if (data.title !== undefined) {
    const title = cleanString(data.title, current.title || 'Untitled');
    fields.push('title = ?', 'normalized_title = ?');
    values.push(sanitizeText(title), normalize(title));
  }

  if (data.year !== undefined) {
    fields.push('year = ?');
    values.push(cleanYear(data.year));
  }

  if (data.language !== undefined) {
    fields.push('language = ?');
    values.push(cleanString(data.language, 'unknown'));
  }

  if (data.version_type !== undefined) {
    fields.push('version_type = ?');
    values.push(cleanNullableString(data.version_type));
  }

  if (data.lyrics_status !== undefined) {
    fields.push('lyrics_status = ?');
    values.push(data.lyrics_status);
  }

  if (data.track_number !== undefined) {
    fields.push('track_number = ?');
    values.push(cleanTrackNumber(data.track_number));
  }

  if (data.spotify_id !== undefined) {
    fields.push('spotify_id = ?');
    values.push(cleanNullableString(data.spotify_id));
  }

  if (data.spotify_url !== undefined) {
    fields.push('spotify_url = ?');
    values.push(cleanNullableString(data.spotify_url));
  }

  if (data.cover_url !== undefined) {
    fields.push('cover_url = ?');
    values.push(cleanNullableString(data.cover_url));
  }

  if (data.album !== undefined) {
    const album = data.album
      ? upsertAlbum({
          title: data.album,
          artistId: nextArtistId,
          year: data.year !== undefined ? data.year : current.year,
          coverUrl:
            data.cover_url !== undefined ? data.cover_url : current.cover_url,
          spotifyId: data.album_spotify_id,
        })
      : null;

    fields.push('album_id = ?');
    values.push(album?.id || null);
  }

  if (fields.length === 0) {
    return current;
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE songs SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getSongById(id);
}

export function deleteSong(id) {
  db.prepare('DELETE FROM songs WHERE id = ?').run(id);
}

export function saveLyrics(
  songId,
  { text, source = 'manual', confidenceScore = 1, isVerified = 0 }
) {
  const existing = db
    .prepare('SELECT id FROM lyrics WHERE song_id = ? LIMIT 1')
    .get(songId);

  const cleanText = sanitizeText(cleanLyricsText(text));

  const hasLyrics = Boolean(cleanText && cleanText.trim());
  const status = !hasLyrics
    ? 'missing'
    : isVerified
      ? 'reviewed'
      : source === 'manual'
        ? 'manual'
        : 'auto';

  if (existing) {
    db.prepare(
      `UPDATE lyrics
       SET text = ?, source = ?, confidence_score = ?,
           is_verified = ?, updated_at = datetime('now')
       WHERE song_id = ?`
    ).run(cleanText, source, confidenceScore, isVerified ? 1 : 0, songId);
  } else {
    db.prepare(
      `INSERT INTO lyrics (id, song_id, text, source, confidence_score, is_verified)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      uuidv4(),
      songId,
      cleanText,
      source,
      confidenceScore,
      isVerified ? 1 : 0
    );
  }

  db.prepare(
    `UPDATE songs
     SET lyrics_status = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(status, songId);

  return getSongById(songId);
}

export function setTags(songId, tagNames) {
  const names = Array.isArray(tagNames) ? tagNames : [];
  const clean = names
    .map((tag) => sanitizeText(String(tag || '').trim().toLowerCase()))
    .filter(Boolean);

  db.prepare('DELETE FROM song_tags WHERE song_id = ?').run(songId);

  for (const name of clean) {
    let tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(name);

    if (!tag) {
      const id = uuidv4();
      db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(id, name);
      tag = { id };
    }

    db.prepare(
      'INSERT OR IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)'
    ).run(songId, tag.id);
  }
}

export function bulkUpdate(ids, data) {
  const safeIds = Array.isArray(ids) ? ids : [];

  const updateMany = db.transaction(() => {
    for (const id of safeIds) {
      updateSong(id, data);
    }
  });

  updateMany();
}

export function findDuplicates() {
  const songs = db
    .prepare(
      `SELECT s.id, s.normalized_title, ar.normalized AS artist_norm
       FROM songs s
       LEFT JOIN artists ar ON s.artist_id = ar.id`
    )
    .all();

  const groups = [];
  const used = new Set();

  for (let i = 0; i < songs.length; i++) {
    if (used.has(songs[i].id)) {
      continue;
    }

    const group = [songs[i]];

    for (let j = i + 1; j < songs.length; j++) {
      if (
        songs[i].normalized_title === songs[j].normalized_title &&
        songs[i].artist_norm === songs[j].artist_norm
      ) {
        group.push(songs[j]);
        used.add(songs[j].id);
      }
    }

    if (group.length > 1) {
      used.add(songs[i].id);
      groups.push(group.map((song) => getSongById(song.id)));
    }
  }

  return groups;
}

export function mergeSongs(keepId, mergeIds, { useMetadataFrom, useLyricsFrom }) {
  const merge = db.transaction(() => {
    const meta = getSongById(useMetadataFrom);
    const lyrics = getSongById(useLyricsFrom);

    if (!meta) {
      throw new Error('Metadata source song not found');
    }

    if (!lyrics) {
      throw new Error('Lyrics source song not found');
    }

    updateSong(keepId, {
      title: meta.title,
      year: meta.year,
      language: meta.language,
      version_type: meta.version_type,
      track_number: meta.track_number,
      spotify_id: meta.spotify_id,
      spotify_url: meta.spotify_url,
      cover_url: meta.cover_url,
    });

    if (lyrics.lyrics) {
      saveLyrics(keepId, {
        text: lyrics.lyrics.text,
        source: lyrics.lyrics.source,
        confidenceScore: lyrics.lyrics.confidence_score,
        isVerified: lyrics.lyrics.is_verified,
      });
    }

    for (const id of mergeIds) {
      if (id !== keepId) {
        db.prepare(
          'UPDATE OR IGNORE playlist_songs SET song_id = ? WHERE song_id = ?'
        ).run(keepId, id);
        db.prepare(
          'UPDATE OR IGNORE collection_songs SET song_id = ? WHERE song_id = ?'
        ).run(keepId, id);
        db.prepare(
          'UPDATE OR IGNORE print_set_songs SET song_id = ? WHERE song_id = ?'
        ).run(keepId, id);
        db.prepare(
          'UPDATE OR IGNORE song_tags SET song_id = ? WHERE song_id = ?'
        ).run(keepId, id);
        deleteSong(id);
      }
    }
  });

  merge();
  return getSongById(keepId);
}
