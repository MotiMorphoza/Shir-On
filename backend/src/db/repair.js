import db from './index.js';
import { normalize } from '../utils/normalize.js';
import { decodeHtmlEntities } from '../utils/sanitize.js';

function nextNormalized(value) {
  return normalize(String(value || ''));
}

function nextDecoded(value) {
  return decodeHtmlEntities(String(value || ''));
}

export function repairHtmlEntities() {
  const result = {
    artists: 0,
    albums: 0,
    songs: 0,
    lyrics: 0,
    tags: 0,
  };

  const repair = db.transaction(() => {
    const artists = db.prepare('SELECT id, name FROM artists').all();
    for (const artist of artists) {
      const next = nextDecoded(artist.name);
      if (next !== artist.name) {
        db.prepare('UPDATE artists SET name = ? WHERE id = ?').run(next, artist.id);
        result.artists += 1;
      }
    }

    const albums = db.prepare('SELECT id, title FROM albums').all();
    for (const album of albums) {
      const next = nextDecoded(album.title);
      if (next !== album.title) {
        db.prepare('UPDATE albums SET title = ? WHERE id = ?').run(next, album.id);
        result.albums += 1;
      }
    }

    const songs = db.prepare('SELECT id, title FROM songs').all();
    for (const song of songs) {
      const next = nextDecoded(song.title);
      if (next !== song.title) {
        db.prepare(
          "UPDATE songs SET title = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(next, song.id);
        result.songs += 1;
      }
    }

    const lyricsRows = db.prepare('SELECT id, text FROM lyrics').all();
    for (const lyrics of lyricsRows) {
      const next = nextDecoded(lyrics.text);
      if (next !== lyrics.text) {
        db.prepare(
          "UPDATE lyrics SET text = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(next, lyrics.id);
        result.lyrics += 1;
      }
    }

    const tags = db.prepare('SELECT id, name FROM tags').all();
    for (const tag of tags) {
      const next = nextDecoded(tag.name);
      if (next !== tag.name) {
        db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(next, tag.id);
        result.tags += 1;
      }
    }
  });

  repair();
  return result;
}

export function repairNormalizedFields() {
  const result = {
    artists: 0,
    albums: 0,
    songs: 0,
  };

  const repair = db.transaction(() => {
    const artists = db.prepare('SELECT id, name, normalized FROM artists').all();
    for (const artist of artists) {
      const next = nextNormalized(artist.name);
      if (next && next !== artist.normalized) {
        db.prepare('UPDATE artists SET normalized = ? WHERE id = ?').run(next, artist.id);
        result.artists += 1;
      }
    }

    const albums = db.prepare('SELECT id, title, normalized FROM albums').all();
    for (const album of albums) {
      const next = nextNormalized(album.title);
      if (next && next !== album.normalized) {
        db.prepare('UPDATE albums SET normalized = ? WHERE id = ?').run(next, album.id);
        result.albums += 1;
      }
    }

    const songs = db.prepare('SELECT id, title, normalized_title FROM songs').all();
    for (const song of songs) {
      const next = nextNormalized(song.title);
      if (next && next !== song.normalized_title) {
        db.prepare(
          "UPDATE songs SET normalized_title = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(next, song.id);
        result.songs += 1;
      }
    }
  });

  repair();
  return result;
}

export function repairLyricsUniqueness() {
  const result = {
    removed_duplicates: 0,
    dropped_legacy_index: 0,
    created_unique_index: 0,
  };

  const repair = db.transaction(() => {
    const duplicateSongs = db
      .prepare(
        `SELECT song_id
         FROM lyrics
         GROUP BY song_id
         HAVING COUNT(*) > 1`
      )
      .all();

    const listLyricsForSong = db.prepare(
      `SELECT id
       FROM lyrics
       WHERE song_id = ?
       ORDER BY updated_at DESC, created_at DESC, id DESC`
    );
    const deleteLyricsRow = db.prepare('DELETE FROM lyrics WHERE id = ?');

    for (const row of duplicateSongs) {
      const lyricsRows = listLyricsForSong.all(row.song_id);

      for (const duplicate of lyricsRows.slice(1)) {
        deleteLyricsRow.run(duplicate.id);
        result.removed_duplicates += 1;
      }
    }

    const existingLegacyIndex = db
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'index' AND name = 'idx_lyrics_song'
         LIMIT 1`
      )
      .get();

    db.prepare('DROP INDEX IF EXISTS idx_lyrics_song').run();

    if (existingLegacyIndex) {
      result.dropped_legacy_index = 1;
    }

    const existingUniqueIndex = db
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'index' AND name = 'idx_lyrics_song_unique'
         LIMIT 1`
      )
      .get();

    db.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_lyrics_song_unique ON lyrics(song_id)'
    ).run();

    if (!existingUniqueIndex) {
      result.created_unique_index = 1;
    }
  });

  repair();
  return result;
}
