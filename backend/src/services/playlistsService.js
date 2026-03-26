import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { normalize } from '../utils/normalize.js';
import { sanitizeText } from '../utils/sanitize.js';

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

export function getPlaylists() {
  return db
    .prepare(
      `SELECT p.*,
              COUNT(ps.song_id) AS songs_count
       FROM playlists p
       LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id
       GROUP BY p.id
       ORDER BY p.normalized`
    )
    .all()
    .map((row) => ({
      ...row,
      songs_count: Number(row.songs_count || 0),
    }));
}

export function getPlaylist(id) {
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(id);

  if (!playlist) {
    return null;
  }

  const songs = db
    .prepare(
      `SELECT s.*, ar.name AS artist_name, al.title AS album_title, ps.position
       FROM playlist_songs ps
       JOIN songs s ON s.id = ps.song_id
       LEFT JOIN artists ar ON ar.id = s.artist_id
       LEFT JOIN albums al ON al.id = s.album_id
       WHERE ps.playlist_id = ?
       ORDER BY ps.position, ar.normalized, s.normalized_title`
    )
    .all(id);

  return {
    ...playlist,
    songs,
  };
}

export function upsertSpotifyPlaylist({
  spotifyId,
  name,
  description,
  sourceUrl,
  imageUrl,
}) {
  const cleanName = cleanString(name, 'Spotify Playlist');
  const cleanSpotifyId = cleanString(spotifyId);

  const existing = db
    .prepare('SELECT * FROM playlists WHERE spotify_id = ? LIMIT 1')
    .get(cleanSpotifyId);

  if (existing) {
    db.prepare(
      `UPDATE playlists
       SET name = ?,
           normalized = ?,
           description = ?,
           source_url = ?,
           image_url = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      sanitizeText(cleanName),
      normalize(cleanName),
      cleanNullableString(description),
      cleanNullableString(sourceUrl),
      cleanNullableString(imageUrl),
      existing.id
    );

    return db.prepare('SELECT * FROM playlists WHERE id = ?').get(existing.id);
  }

  const id = uuidv4();

  db.prepare(
    `INSERT INTO playlists
      (id, spotify_id, name, normalized, description, source_url, image_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    cleanSpotifyId,
    sanitizeText(cleanName),
    normalize(cleanName),
    cleanNullableString(description),
    cleanNullableString(sourceUrl),
    cleanNullableString(imageUrl)
  );

  return db.prepare('SELECT * FROM playlists WHERE id = ?').get(id);
}

export function replacePlaylistSongs(playlistId, songIds = []) {
  const ids = Array.isArray(songIds)
    ? songIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];

  const replace = db.transaction(() => {
    db.prepare('DELETE FROM playlist_songs WHERE playlist_id = ?').run(playlistId);

    ids.forEach((songId, index) => {
      db.prepare(
        `INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position)
         VALUES (?, ?, ?)`
      ).run(playlistId, songId, index + 1);
    });
  });

  replace();
  return getPlaylist(playlistId);
}
