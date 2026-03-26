# BOOTSTRAP.md

## Prerequisites

- Node.js installed
- npm available
- Spotify app credentials if you want Spotify import

Recommended:
- Node 20 LTS on Windows

Historical note:
- Node 24 previously failed in this project on Windows while building `better-sqlite3`

## First-time setup

1. Install dependencies:

```bash
npm run setup
```

2. Create backend env file from the example:

```bash
copy backend\.env.example backend\.env
```

3. Optional: create a frontend env override if you want to point the UI to a different API URL:

```bash
copy frontend\.env.example frontend\.env
```

4. Fill in the Spotify values in `backend/.env` if needed.

5. Run migrations:

```bash
npm run migrate
```

6. Start both apps:

```bash
npm run dev
```

## What each command does

- `npm run setup`
  - installs `backend` dependencies
  - installs `frontend` dependencies

- `npm run migrate`
  - runs `backend/src/db/migrate.js`
  - creates or updates `backend/data/songbook.db`

- `npm run dev`
  - starts backend and frontend together from a root Node runner
  - stops the sibling process if one side exits or crashes

- `npm run backend`
  - starts the Express API in watch mode

- `npm run frontend`
  - starts the Vite dev server

- `npm run build`
  - builds the frontend production bundle

Operational note:
- the Reports page includes a `Reset Reports` action that clears active and legacy report JSON files without touching the SQLite library data
- backend startup also runs lightweight repair passes for normalized fields and older duplicate `lyrics` rows in the local SQLite database

## Runtime URLs

- Backend API: `http://127.0.0.1:3001`
- Health check: `http://127.0.0.1:3001/health`
- Frontend dev server: typically `http://127.0.0.1:5173` or `http://127.0.0.1:5174`

## Required backend env vars

See [backend/.env.example](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/.env.example).

Required for normal backend startup:
- `PORT`
- `FRONTEND_URL`
- `SESSION_SECRET`

Required for Spotify auth/import:
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`

## Local outputs

- Database: `backend/data/songbook.db`
- Reports: `backend/data/reports/*.json`

## Quick health checks

After startup, verify:
- `/health` returns JSON
- the library page loads songs or an empty state
- `/api/reports` returns JSON
- Spotify session check responds on `/api/spotify/session`
- the Songbook page can switch between `All songs` and an imported playlist
- the `Fetch Lyrics` page can reconnect to a running or recent lyrics job after navigation
- the `Import` page can reconnect to a running or recent Spotify import job after navigation
- the Song and Collections pages render with the updated card-based layout
- starting the same background fetch or Spotify import twice reconnects to the existing job instead of spawning a duplicate

## Common blockers

1. `better-sqlite3` build failures on unsupported Node/Windows setups
2. missing or incorrect Spotify env vars
3. mismatch between `FRONTEND_URL` and the actual Vite dev URL
4. Spotify local OAuth and `FRONTEND_URL` must match the actual loopback host you use consistently
5. external lyrics providers returning misses or HTTP errors
