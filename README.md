# Shir-On

Shir-On is a local-first personal song library and printable songbook.

The app lets you:
- import songs from Spotify playlists and albums
- import songs from CSV or JSON
- manage songs, lyrics, tags, playlists, and print flows
- group songs into collections
- run live lyrics fetch jobs with per-song status
- reconnect to active lyrics and Spotify import jobs after page navigation
- review unified batch reports with drill-down diagnostics
- keep one lyrics row per song through startup repair + unique-index enforcement on local databases
- reset stored reports from the Reports screen when you want a clean history
- read the library as a digital songbook with TOC links and playlist selection
- generate printable PDF songbooks with artist-sorted output, optional single-song pages, and supported two-column lyrics layouts

## Stack

- Frontend: React + Vite + React Router
- Backend: Express
- Database: SQLite via `better-sqlite3`
- Printing: Puppeteer PDF generation
- Integrations: Spotify OAuth + multiple lyrics providers

## Repository layout

```text
Shir-On/
  backend/
    data/
    src/
      db/
      print/
      providers/
      routes/
      services/
      utils/
  frontend/
    src/
      api/
      components/
      pages/
  scripts/
```

## Main flows

1. Import songs from Spotify, CSV, or JSON.
2. Normalize and store artists, albums, songs, and lyrics in SQLite.
3. Preserve playlist identity and browse either all songs or one imported playlist.
4. Reuse the same library song across multiple playlists; existing songs are linked into the new playlist instead of being blocked.
5. Playlists intentionally point to unique library songs, not repeated playlist-item occurrences.
6. Fetch lyrics with provider fallbacks and save one batch report per fetch.
7. Use report filters to inspect all entries, passed entries, blocked entries, or specific block reasons.
8. Clear active and legacy report JSON files from the Reports screen if you want to restart reporting from zero.
9. Read the collection as a digital songbook or generate PDF output, either for all songs or one playlist.

## API surface

The backend listens on `127.0.0.1:${PORT}` and mounts:
- `/api/songs`
- `/api/spotify`
- `/api/import`
- `/api/reports`
- `/api/collections`
- `/api/playlists`
- `/api/print`
- `/health`

## Environment

Backend env vars are documented in [backend/.env.example](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/.env.example).
Frontend API override is documented in [frontend/.env.example](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/.env.example).

Important values:
- `PORT`
- `FRONTEND_URL`
- `SESSION_SECRET`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`

Local Spotify note:
- keep `FRONTEND_URL` and `SPOTIFY_REDIRECT_URI` aligned with the actual local URL you use
- the backend currently accepts `127.0.0.1` and `localhost` frontend origins on ports `5173` and `5174`

## Local development

```bash
npm run setup
npm run migrate
npm run dev
```

Useful commands:
- `npm run backend`
- `npm run frontend`
- `npm run build`
- `npm run migrate:reports`

## UI notes

- every major page now exposes the same `Back to Library` button style
- the top navigation stays visible while moving between pages
- reading mode can be scoped to `All songs` or one imported playlist
- the main navigation label is `Import Playlist`
- the `Fetch Lyrics` page can also be scoped to one playlist and reconnect to the tracked lyrics job after navigation without jumping to an unrelated run
- the `Fetch Lyrics` screen now loads explicitly requested songs through one bulk API request instead of one request per song
- the Song page year field now supports both typing and picking from a year list
- the Reports screen includes a destructive `Reset Reports` action that clears both active and legacy JSON report files
- the song editor and collections pages now use the same card, spacing, and action hierarchy patterns as the main library UI
- the song editor now exposes comma-separated tag editing on top of the existing backend tag support
- background lyrics and Spotify import jobs now refuse duplicate runs for the same scope and reconnect to the existing job instead
- library filtering now uses only `All Songs`, `Has Lyrics`, and `No Lyrics`
- print entry points are now exposed directly in the Library and Songbook screens
- user-facing lyrics terminology now consistently says `Fetch` instead of `Run`
- the Songbook screen now excludes songs without lyrics

## Data written locally

- SQLite DB: `backend/data/songbook.db`
- Reports: `backend/data/reports/*.json`
- Legacy reports after migration: `backend/data/reports/legacy/*.json`

## Current status

Verified from the checked-in code and local workspace data:
- the project already has a populated SQLite database
- reports are persisted to disk
- Spotify playlist import has been used successfully
- lyrics fetch reports are being generated in volume
- new import reports no longer embed a duplicated full `legacy_report` payload inside `meta`
- import report creation now goes through one shared backend helper for Spotify, CSV, and JSON sources
- import summaries and background job counters now treat `linked_existing` as a successful outcome instead of a skipped one

## Documentation map

- Setup: [BOOTSTRAP.md](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/BOOTSTRAP.md)
- Architecture: [ARCHITECTURE.md](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/ARCHITECTURE.md)
- Audit tracker: [AUDIT.md](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/AUDIT.md)
- Known issues: [KNOWN_ISSUES.md](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/KNOWN_ISSUES.md)
- Agent guidance: [AGENTS.md](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/AGENTS.md)
