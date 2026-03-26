# AGENTS.md

## Purpose

This file tells a coding agent how to work on Shir-On without inventing architecture that the repo does not actually have.

## Documentation trust model

Every area in this project must be treated under one of these labels:

- **Verified**: directly confirmed from repository code or local data in this workspace
- **Inferred**: likely true from strong code evidence, but not directly proven end-to-end
- **Unverified / Needs confirmation**: do not rely on this as fact

Never silently upgrade an inference into a fact.

---

## Project identity

**Verified**
- Shir-On is a personal songbook / lyrics management project
- the repo is split into `backend/` and `frontend/`
- the backend is an Express API
- the frontend is React + Vite + React Router
- the DB is SQLite via `better-sqlite3`
- printing is PDF-based via Puppeteer
- Spotify auth/import exists
- lyrics provider fallback exists
- reports are persisted as JSON files under `backend/data/reports`

**Inferred**
- the app is intended for local personal use rather than multi-user SaaS

---

## Source of truth by area

| Area | Source of truth |
|---|---|
| package scripts | root and subproject `package.json` files |
| backend entry/runtime | `backend/src/index.js` |
| DB bootstrapping | `backend/src/db/index.js`, `backend/src/db/migrate.js`, `backend/src/db/schema.sql` |
| lyrics provider behavior | files under `backend/src/providers/lyrics/` |
| Spotify integration | `backend/src/routes/spotify.js` |
| API contracts | backend route handlers + frontend API client |
| runtime config | `backend/.env` and config reads in code |
| report persistence | `backend/src/services/reportService.js` |
| library UI behavior | `frontend/src/pages/Library.jsx` and related components |

If there is a conflict:
1. code beats docs
2. local runtime data beats assumptions
3. update docs after inspection

Documentation maintenance rule:
- every material code change must update the relevant `.md` files in the same work session
- `AUDIT.md` must be kept in sync with major findings, fixes applied, and remaining priorities
- do not leave code and docs knowingly divergent for the user to reconcile later

---

## How an agent should work in this repo

### 1. Preserve the existing architecture

Do not convert the stack to TypeScript, Prisma, Docker, monorepo tooling, ORMs, or hosted DBs unless the user explicitly asks.

### 2. Respect the backend/frontend split

This is a two-part app with a separate frontend dev server and backend API.

### 3. Treat Spotify and lyrics fetching as unstable integration surfaces

External providers can fail, rate-limit, change markup, or require credentials.

### 4. Prefer local, reversible fixes

Good examples:
- fix a provider parser
- fix playlist normalization
- improve diagnostics
- fix startup scripts or docs

Avoid:
- speculative rewrites
- new architecture layers without need

### 5. Be explicit about editable vs generated files

Editable:
- source code
- docs
- config examples

Generated:
- `node_modules`
- DB files under `backend/data`
- reports under `backend/data/reports`
- lockfiles only via package manager

### 6. Add diagnostics around flaky integrations

Especially for:
- Spotify config/auth/session failures
- lyrics provider fallback order
- provider-specific parser failures
- import results and skipped rows

### 7. Treat documentation updates as part of done

When a change affects behavior, risks, setup, UX, or architecture:
- update the nearest source doc such as `README.md`, `ARCHITECTURE.md`, `BOOTSTRAP.md`, or `KNOWN_ISSUES.md`
- update `AUDIT.md` when the change closes, reduces, or re-prioritizes an audit finding
- note whether the documented statement is **Verified** or **Inferred** when that distinction matters

---

## Verified implementation facts

- root scripts orchestrate backend and frontend commands
- backend dev script is `node --watch src/index.js`
- frontend dev script is `vite`
- backend binds to `127.0.0.1` and defaults to port `3001`
- routes include songs, spotify, import, reports, collections, and print
- schema includes songs, lyrics, tags, collections, and print sets
- provider inventory includes `zemereshet`, `shironet`, `nli`, `tab4u`, `google-sites`, `lrclib.net`, and `lyrics.ovh`
- report files exist in volume in the local workspace
- the UI now includes a persistent top navigation entry for `Library` instead of repeating back-to-library buttons across pages
- the digital songbook can be scoped to one playlist
- reports can be cleared from the UI without deleting the SQLite library
- the lyrics and Spotify import flows reconnect to the last tracked background job from the browser, but the backend job registry is still memory-backed
- the Song and Collections screens now share the newer card-based UI language used across the rest of the app
- duplicate background jobs for the same lyrics scope or Spotify source are now intentionally reused instead of duplicated
- duplicate song merges now preserve playlist, collection, print-set, and tag membership before removing merged-away rows
- PDF generation now honors single-song pages and two-column lyrics for the supported print layouts, instead of always forcing two songs per page

---

## Guardrails for edits

### Do
- keep fixes local and reversible
- preserve API shapes unless changing both backend and frontend together
- document env expectations in examples or docs
- keep lyrics fallback tolerant of misses
- keep report persistence intact when adjusting import/fetch flows

### Do not
- hardcode secrets
- commit `.env`
- remove fallback behavior without replacement
- treat old planning text files as equal to the actual repository code
- delete local data files unless the user explicitly asks

---

## Priority order for practical repair

1. environment and startup stability
2. backend API health
3. Spotify auth/import correctness
4. lyrics provider resilience and diagnostics
5. UX polish
