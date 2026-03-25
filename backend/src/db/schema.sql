PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS artists (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  normalized TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS albums (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  normalized    TEXT NOT NULL,
  artist_id     TEXT REFERENCES artists(id),
  year          INTEGER,
  cover_url     TEXT,
  spotify_id    TEXT UNIQUE,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS songs (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  artist_id        TEXT REFERENCES artists(id),
  album_id         TEXT REFERENCES albums(id),
  track_number     INTEGER,
  year             INTEGER,
  language         TEXT DEFAULT 'unknown',
  version_type     TEXT,
  spotify_id       TEXT UNIQUE,
  spotify_url      TEXT,
  cover_url        TEXT,
  lyrics_status    TEXT DEFAULT 'missing'
                   CHECK(lyrics_status IN
                     ('missing','auto','manual','reviewed')),
  is_print_ready   INTEGER DEFAULT 0,
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lyrics (
  id               TEXT PRIMARY KEY,
  song_id          TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  text             TEXT NOT NULL,
  source           TEXT,
  confidence_score REAL DEFAULT 0,
  is_verified      INTEGER DEFAULT 0,
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS song_tags (
  song_id TEXT REFERENCES songs(id) ON DELETE CASCADE,
  tag_id  TEXT REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (song_id, tag_id)
);

CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection_songs (
  collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
  song_id       TEXT REFERENCES songs(id)        ON DELETE CASCADE,
  position      INTEGER DEFAULT 0,
  PRIMARY KEY (collection_id, song_id)
);

CREATE TABLE IF NOT EXISTS print_sets (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  config     TEXT NOT NULL,   -- JSON blob: format, layout, mode, etc.
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS print_set_songs (
  print_set_id TEXT REFERENCES print_sets(id) ON DELETE CASCADE,
  song_id      TEXT REFERENCES songs(id)       ON DELETE CASCADE,
  position     INTEGER DEFAULT 0,
  PRIMARY KEY (print_set_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_songs_artist    ON songs(artist_id);
CREATE INDEX IF NOT EXISTS idx_songs_album     ON songs(album_id);
CREATE INDEX IF NOT EXISTS idx_songs_status    ON songs(lyrics_status);
CREATE INDEX IF NOT EXISTS idx_songs_normalized ON songs(normalized_title);
CREATE INDEX IF NOT EXISTS idx_lyrics_song     ON lyrics(song_id);
