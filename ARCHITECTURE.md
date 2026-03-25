# ARCHITECTURE.md

## Overview

Shir-On is a split frontend/backend app for maintaining a personal songbook.

```text
React UI
  -> fetch / JSON
Express API
  -> services
  -> lyrics providers
  -> Spotify integration
  -> SQLite
  -> PDF generation
```

## Frontend

Source: [frontend/src](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src)

Verified stack:
- React 18
- Vite
- React Router

Verified pages:
- library
- song editor / song detail
- import
- reports list
- single report view

Frontend API client:
- [frontend/src/api/client.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/api/client.js)

## Backend

Source: [backend/src](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src)

Verified responsibilities:
- load env and configure Express
- apply schema at startup
- manage songs, lyrics, tags, collections
- handle Spotify OAuth and imports
- accept CSV/JSON imports
- persist reports to disk
- generate printable PDFs

Backend entry:
- [backend/src/index.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/index.js)

## Database

DB bootstrap:
- [backend/src/db/index.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/db/index.js)
- [backend/src/db/migrate.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/db/migrate.js)
- [backend/src/db/schema.sql](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/db/schema.sql)

SQLite data model includes:
- `artists`
- `albums`
- `songs`
- `lyrics`
- `tags`
- `song_tags`
- `collections`
- `collection_songs`
- `print_sets`
- `print_set_songs`

Disk location:
- `backend/data/songbook.db`

## Song flow

1. Songs enter through Spotify, CSV, JSON, or manual add.
2. Import code normalizes track payloads.
3. `songService` upserts artists/albums and creates songs.
4. Library queries read songs with joined artist/album data.
5. Lyrics can be entered manually or fetched later.

Core files:
- [backend/src/services/importService.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/services/importService.js)
- [backend/src/services/songService.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/services/songService.js)

## Lyrics architecture

Lyrics orchestration:
- [backend/src/providers/lyrics/index.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/providers/lyrics/index.js)

Verified provider order:
1. `zemereshet`
2. `shironet`
3. `nli`
4. `tab4u`
5. `google-sites`
6. `lrclib.net`
7. `lyrics.ovh`

Verified behavior:
- sequential attempts
- per-provider logging
- keep the first result above confidence threshold
- otherwise retain the best lower-confidence result
- save a fetch report from the route layer

## Spotify architecture

Active integration:
- [backend/src/routes/spotify.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/spotify.js)

Verified behavior:
- session-based Spotify auth
- refresh token handling
- playlist and album import
- normalization of inconsistent Spotify response shapes
- import report persistence

## Reports

Report persistence:
- [backend/src/services/reportService.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/services/reportService.js)

Reports are stored as JSON files under:
- `backend/data/reports`

Verified report types in workspace data:
- `lyrics_fetch / single_song`
- `import / spotify_playlist`

## Printing

Print route:
- [backend/src/routes/print.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/print.js)

PDF engine:
- [backend/src/print/engine.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/print/engine.js)

Verified capabilities:
- print selected songs, a collection, or all print-ready songs
- PDF generation through Puppeteer
- RTL-aware layout for Hebrew content
- configurable page size, margins, columns, TOC, index, and line spacing
