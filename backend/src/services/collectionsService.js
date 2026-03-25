import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { sanitizeText } from '../utils/sanitize.js';

export function getCollections() {
  return db.prepare('SELECT * FROM collections ORDER BY name').all();
}

export function getCollection(id) {
  const col = db.prepare('SELECT * FROM collections WHERE id = ?').get(id);
  if (!col) return null;
  col.songs = db.prepare(
    `SELECT s.*, ar.name AS artist_name
     FROM songs s
     JOIN collection_songs cs ON s.id = cs.song_id
     JOIN artists ar ON s.artist_id = ar.id
     WHERE cs.collection_id = ?
     ORDER BY cs.position`
  ).all(id);
  return col;
}

export function createCollection(name, description = '') {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO collections (id, name, description) VALUES (?, ?, ?)'
  ).run(id, sanitizeText(name), sanitizeText(description));
  return getCollection(id);
}

export function addSongToCollection(collectionId, songId) {
  const maxPos = db.prepare(
    'SELECT MAX(position) AS m FROM collection_songs WHERE collection_id = ?'
  ).get(collectionId)?.m ?? -1;
  db.prepare(
    'INSERT OR IGNORE INTO collection_songs (collection_id, song_id, position) VALUES (?, ?, ?)'
  ).run(collectionId, songId, maxPos + 1);
}

export function removeSongFromCollection(collectionId, songId) {
  db.prepare(
    'DELETE FROM collection_songs WHERE collection_id = ? AND song_id = ?'
  ).run(collectionId, songId);
}
