# KNOWN_ISSUES.md

## Active issues

### 1. External lyrics providers are inherently unstable

Verified from the implementation:
- multiple providers are scraped or queried remotely
- provider order is sequential
- providers can return no result, low-confidence matches, or hard HTTP failures

Impact:
- lyrics lookup is useful but not deterministic
- some songs will still need manual lyrics entry or review
- newer reports now include provider order, duration, and query details to make failures easier to diagnose
- some providers are intentionally inactive because upstream blocking made them counterproductive in the main fallback chain

Currently inactive in the default Hebrew chain:
- `shironet` because live upstream requests return `403`
- `nli` because live upstream requests return `403`

Historically successful and now restored in the active Hebrew chain:
- `zemereshet`
  - it was a major source in older runs
  - the previous break came from `search.asp` switching to a Google CSE shell
  - the provider now uses the working server-side `songs.asp` POST flow again

Current active Hebrew order:
- `tab4u`
- `zemereshet`
- `google-sites`
- `lrclib.net`
- `musixmatch`
- `letras.com`
- `lyrics.ovh`

Relevant files:
- [backend/src/providers/lyrics/index.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/providers/lyrics/index.js)
- [backend/src/routes/songs.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/songs.js)

### 2. Spotify import depends on correct local auth config

Verified:
- backend startup does not require Spotify values
- Spotify login/import does require `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_REDIRECT_URI`

Impact:
- library browsing can work while Spotify import fails
- auth mismatch shows up as runtime import/login errors, not as compile-time errors
- local loopback host mismatches are less fragile now because frontend return-origin capture accepts both `127.0.0.1` and `localhost`, but the configured URLs still need to agree with each other

Relevant files:
- [backend/src/routes/spotify.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/spotify.js)
- [backend/.env.example](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/.env.example)

### 3. There is no automated test suite in the repository

Verified:
- root, backend, and frontend `package.json` files do not define test scripts

Impact:
- regression detection depends on manual runtime checks
- documentation and report inspection matter more than usual

### 4. Background jobs survive page navigation, but not backend restarts

Verified:
- background import and lyrics jobs are tracked by the backend job service
- the frontend now reconnects to the last tracked lyrics or Spotify import job after navigation when possible
- jobs are still kept in backend memory rather than in SQLite
- the refreshed Song and Collections pages are visual/UI changes only and do not change backend data rules
- duplicate runs for the same lyrics scope or Spotify source are now blocked and reuse the active job instead
- active jobs are no longer trimmed out of the in-memory registry just because the history list exceeded its cap

Impact:
- changing pages in the UI should not stop an already-started lyrics fetch or Spotify import
- restarting the backend still drops the in-memory job registry
- completed reports remain persisted even if the job registry is lost later

Related stability improvement:
- startup repair now dedupes legacy `lyrics` rows and enforces a unique `song_id` index so song reads do not depend on "latest row wins" behavior across duplicates

### 5. Advanced print settings are still intentionally narrower than the UI once implied

Verified:
- the print engine now honors supported `songsPerPage`, TOC, margins, line spacing, and a single-song two-column lyrics layout
- the engine does not implement every historical print option that older UI payloads hinted at

Impact:
- the current printing flow is more honest and less truncation-prone than before
- future print controls should be added only when the backend actually supports them end to end

### 6. Some older report files still contain historical duplication

Verified:
- new import reports no longer embed the full raw import payload twice
- existing JSON report files already written to disk keep their old structure until reset or migration

Impact:
- report listing and stats are lighter for new runs, but old disk usage does not shrink retroactively
- historical reports may still reflect the older `skipped` semantics until they are regenerated

### 7. Some backend capabilities still have limited or no frontend workflow

Verified:
- `collections` routes exist
- `print_sets` exist in the DB schema
- current frontend focuses mainly on library, song, import, and reports pages

Impact:
- parts of the backend model are ahead of the UI
- `print_sets` are still effectively internal-only for now and are not exposed as a first-class workflow

Relevant files:
- [backend/src/routes/collections.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/collections.js)
- [backend/src/db/schema.sql](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/db/schema.sql)

### 8. Google Sites can return useful lyrics, but the extracted text is sometimes flattened

Verified:
- the provider can now reach the correct song pages and return lyrics again
- Google Sites often collapses long lines and metadata into a single paragraph in the page source

Impact:
- results are useful as a fallback, but formatting quality can still be worse than `tab4u`

Relevant files:
- [backend/src/providers/lyrics/googleSitesLyrics.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/providers/lyrics/googleSitesLyrics.js)

### 9. The digital songbook layout still needs more real-data validation

Verified:
- the Songbook screen now prints and reads directly from the current scope without a print-ready gate
- the Songbook screen now excludes songs without lyrics from its reading scope
- the current layout is still a TOC-first, artist-grouped reading view

Impact:
- the main flow is simpler now, but long multilingual sets still need runtime validation to decide whether an alternate performance-oriented reading mode should become the default

## Historical issue

### Windows + Node 24 + `better-sqlite3`

Previously observed:
- `better-sqlite3` failed to install on Windows under Node 24 in this project

Current recommendation:
- use Node 20 LTS on Windows unless you have already validated a newer version locally
