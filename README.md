# Shir-On

Shir-On is a local-first personal song library and printable songbook.

The app lets you:
- import songs from Spotify playlists and albums
- import songs from CSV or JSON
- manage songs, lyrics, tags, and print-ready state
- fetch lyrics from multiple fallback providers
- review import and lyrics-fetch reports
- generate printable PDF songbooks

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
3. Browse and filter the library.
4. Fetch lyrics with provider fallbacks and save a report for each attempt.
5. Mark songs as print-ready and generate PDF output.

## API surface

The backend listens on `127.0.0.1:${PORT}` and mounts:
- `/api/songs`
- `/api/spotify`
- `/api/import`
- `/api/reports`
- `/api/collections`
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

## Data written locally

- SQLite DB: `backend/data/songbook.db`
- Reports: `backend/data/reports/*.json`

## Current status

Verified from the checked-in code and local workspace data:
- the project already has a populated SQLite database
- reports are persisted to disk
- Spotify playlist import has been used successfully
- lyrics fetch reports are being generated in volume

## Documentation map

- Setup: [BOOTSTRAP.md](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/BOOTSTRAP.md)
- Architecture: [ARCHITECTURE.md](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/ARCHITECTURE.md)
- Known issues: [KNOWN_ISSUES.md](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/KNOWN_ISSUES.md)
- Agent guidance: [AGENTS.md](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/AGENTS.md)
