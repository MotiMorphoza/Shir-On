# AUDIT.md

## Purpose

This file tracks the practical system audit for Shir-On, the fixes already applied from that audit, and the next priorities that remain.

Status labels:
- `Open`: verified issue still present
- `Reduced`: issue still exists in narrower form after a partial fix
- `Fixed`: verified issue addressed in current code
- `Inferred`: likely issue from code evidence, not fully reproduced end to end

---

## Key findings

Verified before fixes:
- duplicate merges could silently drop playlist, collection, print-set, and tag membership
- import and lyrics jobs behaved inconsistently after navigation
- print configuration promised more than the PDF engine actually honored
- import reports duplicated large raw payloads into `meta.legacy_report`
- route-level JSON/CSV normalization dropped metadata that the import service already supported

Current status:
- the highest-risk data-loss bug is now `Fixed`
- the most misleading print behavior is `Reduced`
- job reconnection is more consistent and active jobs are no longer trimmed out of memory due to history pressure
- report bloat from duplicated raw payload storage is `Fixed` for newly created import reports
- import metadata loss from CSV/JSON routes is `Fixed`

---

## Fixes applied

### 1. Duplicate merge relationship loss

Status: `Fixed`

What changed:
- `mergeSongs()` now reassigns `playlist_songs`, `collection_songs`, `print_set_songs`, and `song_tags` to the kept song before deleting merged-away rows

Why it mattered:
- duplicate cleanup could previously remove songs from curated playlists, collections, print sets, and tags without warning

Code:
- [backend/src/services/songService.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/services/songService.js)

### 2. Active jobs disappearing from the in-memory registry

Status: `Fixed`

What changed:
- job trimming now preserves `queued` and `running` jobs
- trimming runs again when jobs complete or fail, instead of only on creation

Why it mattered:
- an older active job could disappear from `/api/jobs` after enough newer jobs were created

Code:
- [backend/src/services/jobService.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/services/jobService.js)

### 3. Lyrics preview endpoint was not a preview

Status: `Fixed`

What changed:
- `/api/songs/:id/fetch-lyrics-preview` now runs with `persist: false`

Why it mattered:
- the route name implied inspection, but it actually wrote lyrics into the database

Code:
- [backend/src/routes/songs.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/songs.js)

### 4. Print engine ignored supported UI intent and could truncate content

Status: `Reduced`

What changed:
- the PDF engine now honors supported `songsPerPage`
- single-song printing can render lyrics in two columns for the supported layout
- hidden overflow was removed from song cards and lyrics blocks
- frontend print actions now send a smaller set of supported options

Why it mattered:
- the engine previously forced two songs per page and could visually clip long songs

Code:
- [backend/src/print/engine.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/print/engine.js)
- [frontend/src/pages/SongPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/SongPage.jsx)
- [frontend/src/pages/CollectionsPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/CollectionsPage.jsx)

Remaining note:
- advanced print options are still intentionally narrower than some old UI assumptions

### 5. Import jobs did not reconnect after navigation

Status: `Fixed`

What changed:
- the import page now stores the last import job id in local storage
- it reconnects to that job on revisit
- it clears stale job ids when the backend no longer has that job

Why it mattered:
- Spotify imports felt less reliable than lyrics runs, even when the backend work was still running

Code:
- [frontend/src/pages/ImportPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/ImportPage.jsx)

### 6. Lyrics page could attach to the wrong job

Status: `Fixed`

What changed:
- the lyrics run page no longer auto-binds to the latest job from the jobs list when no tracked job id is present
- it reconnects only to the explicitly tracked local job id

Why it mattered:
- opening a scoped lyrics screen could show progress from an unrelated run

Code:
- [frontend/src/pages/LyricsRunPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/LyricsRunPage.jsx)

### 7. Import reports stored duplicated raw payloads

Status: `Fixed`

What changed:
- newly created CSV, JSON, Spotify playlist, and Spotify album reports no longer embed the full raw `report` object under `meta.legacy_report`

Why it mattered:
- report files were larger than necessary and duplicated information already normalized into `summary` and `entries`

Code:
- [backend/src/routes/import.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/import.js)
- [backend/src/routes/spotify.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/spotify.js)

Remaining note:
- existing report JSON files on disk still contain the historical duplication until explicitly migrated or regenerated

### 8. CSV/JSON import route dropped supported metadata

Status: `Fixed`

What changed:
- route normalization now preserves extra fields from the input record while still cleaning the core required fields

Why it mattered:
- fields such as `spotify_id`, `spotify_url`, `album_spotify_id`, `track_number`, and `cover_url` could be lost before the import service saw them

Code:
- [backend/src/routes/import.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/import.js)

### 9. Small UX clarity fixes

Status: `Fixed`

What changed:
- main nav label changed from `Import Playlists` to `Import`
- the Songbook page now defaults to all songs instead of silently filtering to print-ready only
- the library filter now exposes `Reviewed Lyrics`
- the duplicates page labels its merge action more honestly

Code:
- [frontend/src/main.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/main.jsx)
- [frontend/src/pages/SongbookPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/SongbookPage.jsx)
- [frontend/src/components/FilterBar.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/components/FilterBar.jsx)
- [frontend/src/pages/DuplicatesPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/DuplicatesPage.jsx)

### 10. Unused legacy single-song lyrics export

Status: `Fixed`

What changed:
- removed the unused `autoFetchLyrics()` export from `songService`

Why it mattered:
- the live app already uses `lyricsRunService` for single-song fetch routes, so keeping the older exported path increased drift risk without adding behavior

Code:
- [backend/src/services/songService.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/services/songService.js)

### 11. Lyrics row uniqueness was only implied, not enforced

Status: `Fixed`

What changed:
- startup repair now dedupes older `lyrics` rows per `song_id`
- the repair drops the legacy non-unique lyrics index and creates a unique `lyrics(song_id)` index
- song list and song detail queries now join lyrics directly instead of selecting a "latest" row through a subquery

Why it mattered:
- duplicate lyrics rows could create hidden data inconsistencies and unnecessary query complexity

Code:
- [backend/src/db/repair.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/db/repair.js)
- [backend/src/index.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/index.js)
- [backend/src/db/schema.sql](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/db/schema.sql)
- [backend/src/services/songService.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/services/songService.js)

### 12. Import report shaping was duplicated between routes

Status: `Fixed`

What changed:
- Spotify, CSV, and JSON import routes now use one shared `createImportBatchReport()` helper

Why it mattered:
- duplicated report-shaping logic made drift more likely whenever report fields changed

Code:
- [backend/src/services/reportService.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/services/reportService.js)
- [backend/src/routes/import.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/import.js)
- [backend/src/routes/spotify.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/spotify.js)

### 13. Lyrics run scope loading over-fetched one song at a time

Status: `Fixed`

What changed:
- `GET /api/songs` now supports an `ids` query for bulk scope loading
- the Lyrics Run page now uses one request for explicit song scopes and restores requested order client-side

Why it mattered:
- opening a scoped lyrics run with many selected songs performed N separate song requests instead of one

Code:
- [backend/src/routes/songs.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/songs.js)
- [backend/src/services/songService.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/services/songService.js)
- [frontend/src/api/client.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/api/client.js)
- [frontend/src/pages/LyricsRunPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/LyricsRunPage.jsx)

### 14. Import report semantics treated linked songs like skipped songs

Status: `Fixed`

What changed:
- import summaries now keep true `skipped` rows separate from `linked_existing`
- background Spotify import jobs count linked-existing matches as successful progress instead of skipped progress

Why it mattered:
- the old counters made successful de-duplication look like a partial failure or skip

Code:
- [backend/src/services/importService.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/services/importService.js)
- [backend/src/services/reportService.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/services/reportService.js)
- [backend/src/routes/spotify.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/spotify.js)
- [frontend/src/pages/ImportPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/ImportPage.jsx)
- [frontend/src/pages/ReportsPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/ReportsPage.jsx)

### 15. Unused client/provider surface stayed around after the live flow changed

Status: `Fixed`

What changed:
- removed the unused legacy backend Spotify provider module
- removed unused frontend API client methods that were no longer called by the current UI

Why it mattered:
- dead integration surface makes the codebase look broader than the live product behavior and raises drift risk

Code:
- [backend/src/providers/spotify.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/providers/spotify.js)
- [frontend/src/api/client.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/api/client.js)

### 16. Backend tag support had no practical editor in the current UI

Status: `Fixed`

What changed:
- the Song page now exposes comma-separated tag editing and saves through the existing `/songs/:id/tags` API

Why it mattered:
- tags existed in the data model and backend routes, but remained effectively hidden from normal library editing

Code:
- [frontend/src/pages/SongPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/SongPage.jsx)

### 22. Navigation relied on repeated back buttons instead of the main app chrome

Status: `Fixed`

What changed:
- added an explicit `Library` entry to the main top navigation
- removed repeated back-to-library buttons from the individual page headers
- aligned the Spotify connection action into the `Spotify Connection` section header row

Why it mattered:
- repeated back buttons created visual clutter and made the main navigation feel incomplete

Code:
- [frontend/src/main.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/main.jsx)
- [frontend/src/pages/ImportPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/ImportPage.jsx)
- [frontend/src/pages/CollectionsPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/CollectionsPage.jsx)
- [frontend/src/pages/DuplicatesPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/DuplicatesPage.jsx)
- [frontend/src/pages/JobsPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/JobsPage.jsx)
- [frontend/src/pages/LyricsRunPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/LyricsRunPage.jsx)
- [frontend/src/pages/ReportsPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/ReportsPage.jsx)
- [frontend/src/pages/SongPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/SongPage.jsx)
- [frontend/src/pages/SongbookPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/SongbookPage.jsx)
- [frontend/src/api/client.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/api/client.js)

### 17. Print-ready state created extra friction in the live UI

Status: `Fixed`

What changed:
- removed print-ready filtering and print-ready controls from the main frontend flows
- library and songbook printing now work directly from the current visible scope
- the backend print route defaults to the whole library when no explicit selection is passed

Why it mattered:
- the project already had direct print generation, so asking the user to maintain a separate print-ready state made printing harder to discover and harder to trust

Code:
- [frontend/src/components/FilterBar.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/components/FilterBar.jsx)
- [frontend/src/pages/Library.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/Library.jsx)
- [frontend/src/pages/SongbookPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/SongbookPage.jsx)
- [frontend/src/pages/SongPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/SongPage.jsx)
- [backend/src/routes/print.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/print.js)

### 18. Lyrics status detail was noisier than the user needed

Status: `Fixed`

What changed:
- library filtering now exposes only `All Songs`, `Has Lyrics`, and `No Lyrics`
- song rows and song detail status labels now collapse `auto/manual/reviewed` into a simple has-lyrics signal
- user-facing wording now consistently prefers `Fetch` over `Run`

Why it mattered:
- the deeper status split was useful internally, but it added interface noise without helping the main personal songbook workflow

Code:
- [frontend/src/components/FilterBar.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/components/FilterBar.jsx)
- [frontend/src/components/SongTable.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/components/SongTable.jsx)
- [frontend/src/pages/SongPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/SongPage.jsx)
- [frontend/src/pages/Library.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/Library.jsx)
- [frontend/src/pages/ReportPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/ReportPage.jsx)
- [frontend/src/pages/ReportsPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/ReportsPage.jsx)

### 19. Printing and year selection were harder to use than they needed to be

Status: `Fixed`

What changed:
- `Import` nav label was changed to `Import Playlist`
- year fields now support typed input plus a scrollable year suggestion list
- print opening now submits directly into a dedicated preview tab instead of relying on a delayed fetch/blob handoff
- the library selection bar no longer includes the extra collection chooser block

Why it mattered:
- these issues created avoidable friction in the main personal workflows of importing, editing, and printing

Code:
- [frontend/src/main.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/main.jsx)
- [frontend/src/components/FilterBar.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/components/FilterBar.jsx)
- [frontend/src/pages/SongPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/SongPage.jsx)
- [frontend/src/pages/Library.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/Library.jsx)
- [frontend/src/api/client.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/api/client.js)

### 20. Songbook scope included songs without lyrics

Status: `Fixed`

What changed:
- the Songbook screen now requests only songs with lyrics

Why it mattered:
- a reading/printing songbook is more useful when songs with no lyrics are kept out of the main reading scope

Code:
- [frontend/src/pages/SongbookPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/SongbookPage.jsx)

### 21. Song page header repeated low-value metadata

Status: `Fixed`

What changed:
- removed the summary row under the song title that repeated lyrics presence, link state, Spotify source, and tags
- the header now stays focused on title plus the artist / album / year subtitle

Why it mattered:
- the extra row made the song page feel busier without helping the main editing flow

Code:
- [frontend/src/pages/SongPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/SongPage.jsx)

---

## Remaining priorities

### Critical

- `Reduced`: keep narrowing print configuration so unsupported options cannot drift back into the frontend

### High

- `Reduced`: finish removing the leftover dead lyrics-query helper code still present inside `songService` so lyrics orchestration lives in one place only

### Medium

- `Reduced`: keep historical report views and any remaining labels aligned with the newer `linked_existing` versus `skipped` semantics
- `Fixed`: playlist storage is now an explicit product decision: playlists represent unique library songs
- `Reduced`: expand tag browsing and filtering beyond the new song-level editor
- `Open`: validate the digital songbook reading layout with real long multilingual data and decide whether the current TOC-first layout needs a more performance-oriented reading mode

### Optional

- `Open`: provider scoring and targeted lyrics retry
- `Open`: playlist diff since last import
- `Open`: richer artistic reading modes for the digital songbook

---

## Documentation policy

Verified project rule:
- material code changes should ship with matching documentation updates in the same work session
- this file should be updated when a major audit finding is fixed, reduced, re-scoped, or newly discovered
