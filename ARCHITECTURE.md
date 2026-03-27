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
- collections
- duplicates review
- live lyrics run
- reports list
- single report view
- digital songbook

Verified shared navigation:
- the top navigation bar is rendered once in `frontend/src/main.jsx`
- the top navigation now includes an explicit `Library` entry for quick return to the root library view
- the primary nav includes a generic `Import` entry because the page handles Spotify playlists, Spotify albums, CSV, and JSON
- the song editor and collections pages now follow the same modern card-based UI language as library, reports, and songbook
- the song editor now exposes the existing backend tag model through a simple comma-separated tags input
- the Library and Songbook screens now expose direct print actions instead of hiding printing behind a separate print-ready workflow

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
- `playlists`
- `playlist_songs`
- `print_sets`
- `print_set_songs`

Disk location:
- `backend/data/songbook.db`

## Song flow

1. Songs enter through Spotify, CSV, JSON, or manual add.
2. Import code normalizes track payloads.
3. `songService` upserts artists/albums and creates songs.
4. Library queries read songs with joined artist/album data.
5. Playlist membership is persisted separately and can scope the library view.
6. The chosen playlist model is intentional: playlists point to unique library songs rather than repeated playlist-item occurrences.
7. Lyrics can be entered manually or fetched later.
8. The digital songbook now reads only songs that already have lyrics, either from the whole library or from one playlist-scoped slice of the library.
9. The lyrics fetch monitor can scope missing-song runs to one playlist and reconnect to the last tracked background job from the browser.
10. Duplicate merges now reassign playlist, collection, print-set, and tag relationships before removing merged-away song rows.
11. Library-level lyrics filtering now collapses status detail into a simpler `all / has lyrics / no lyrics` model in the UI.

Core files:
- [backend/src/services/importService.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/services/importService.js)
- [backend/src/services/songService.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/services/songService.js)
- `GET /api/songs` can also accept a comma-separated `ids` query for bulk scope loading

## Lyrics architecture

Lyrics orchestration:
- [backend/src/providers/lyrics/index.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/providers/lyrics/index.js)

Verified provider order:
1. Non-Hebrew queries:
   - `lrclib.net`
   - `musixmatch`
   - `letras.com`
   - `lyrics.ovh`
2. Hebrew queries:
   - `tab4u`
   - `zemereshet`
   - `google-sites`
   - `lrclib.net`
   - `musixmatch`
   - `letras.com`
   - `lyrics.ovh`

Verified inactive Hebrew providers:
- `shironet`
  - currently excluded from the active chain because upstream requests return HTTP 403
- `nli`
  - currently excluded from the active chain because upstream requests return HTTP 403

Verified restored Hebrew provider:
- `zemereshet`
  - historically successful in legacy runs
  - previously broken because `search.asp` now serves a Google CSE shell
  - restored by switching the provider back to the working server-side `songs.asp` search flow

Verified behavior:
- sequential attempts
- provider order depends on whether the query contains Hebrew text
- per-provider logging
- per-attempt duration, provider order, and query context are persisted into reports
- operational provider failures such as upstream 403s are recorded as errors instead of silent no-result rows
- keep the first result above confidence threshold
- otherwise retain the best lower-confidence result
- save one batch fetch report per run instead of one physical JSON file per song
- startup repair now dedupes older `lyrics` rows by `song_id`, drops the legacy non-unique index, and recreates a unique `lyrics(song_id)` index so song queries can join lyrics directly
- startup repair now also decodes stored HTML entities such as `&#039;` in artist names, album titles, song titles, lyrics, and tags before normalized fields are recalculated

## Spotify architecture

Active integration:
- [backend/src/routes/spotify.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/spotify.js)

Verified behavior:
- session-based Spotify auth
- refresh token handling
- playlist and album import
- return-to flow back into the import page after auth
- frontend return-origin capture now accepts both `127.0.0.1` and `localhost` loopback hosts for the local Vite app
- normalization of inconsistent Spotify response shapes
- import report persistence
- playlist membership persistence for imported Spotify playlists

## Reports

Report persistence:
- [backend/src/services/reportService.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/services/reportService.js)

Reports are stored as JSON files under:
- `backend/data/reports`

Historical reports migrated out of the active directory are stored under:
- `backend/data/reports/legacy`

Verified maintenance action:
- `POST /api/reports/reset` deletes active report JSON files and, by default, legacy report JSON files as well
- the Reports page uses this route for a user-triggered full report reset
- background lyrics and Spotify import routes now check for an already-running job with the same scope before creating a new one
- new import reports keep normalized `entries` and summary data without embedding the full raw report a second time under `meta.legacy_report`
- Spotify, CSV, and JSON import routes now build those reports through one shared backend helper instead of duplicating the entry-shaping logic in each route
- import summaries now keep `linked_existing` separate from true `skipped` rows, and background import jobs count existing-link matches as successful work

Verified report types in workspace data:
- `lyrics_fetch / batch_run`
- `lyrics_fetch / single_song_run`
- `import / spotify_playlist`
- `import / spotify_album`
- `import / csv`
- `import / json`

## Printing

Print route:
- [backend/src/routes/print.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/print.js)

PDF engine:
- [backend/src/print/engine.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/print/engine.js)

Verified capabilities:
- print selected songs, a collection, or the whole library when no explicit print scope is passed
- PDF generation through Puppeteer
- RTL-aware layout for Hebrew content
- artist-sorted output with a clickable digital TOC
- configurable page size, margins, TOC, line spacing, and supported single-song / two-song page layouts
- printed songbooks now render in a two-column page structure
- short pages can hold two songs side by side, while longer single-song pages can flow from the first column into the second
- the printed table of contents also uses a two-column layout
- each printed song is constrained to one physical page, with smaller font presets used when a long song needs to stay within that page
- the PDF renderer now assigns page numbers to song pages and includes those numbers in the printed table of contents
- Hebrew single-song pages now flow from the right column first
- non-Hebrew single-song pages now flow from the left column first
- the print layout uses reduced header/footer spacing and denser TOC spacing to fit more content into the same page footprint
- TOC pages are now split into explicit right/left columns in code instead of relying on browser multi-column balancing
- TOC rows now flow sequentially through the right column and then the left, even across artist boundaries, to reduce dead space
- the TOC start column now follows the language direction of the printed book title: Hebrew books start from the right column, non-Hebrew books from the left
- the print engine now measures page geometry, TOC rows, and lyric token heights in a hidden Puppeteer harness, then performs page and column assignment deterministically in Node
- the printed TOC heading is now a centered two-line heading that includes the printed scope name, not just a generic table-of-contents label
- the printed TOC now emphasizes the printed scope name more strongly, and song pages place a centered `Back to Contents` link directly under the page number
- printed TOC artist headings now derive Hebrew/LTR alignment from the songs grouped under that artist, not only from the stored artist name string
- the current TOC heading renderer now uses a simple block + `text-align` pattern instead of a grid/max-content wrapper because Chromium PDF proved unreliable with the older structure
- every printed songbook page now includes a centered running header that reflects the active printed scope as `Shir On - [playlist/collection/all songs]`
- long printed songs now render through explicit right/left page columns in the final HTML markup, with their token split decided before the final PDF render
- print-column language selection now follows song title/lyrics content instead of artist or album metadata, so non-Hebrew songs keep their left-column start rule
- Hebrew song headers now keep one right-aligned metadata block even when artist names or album metadata use Latin characters
- print margins, footer space, and lyric line spacing were tightened again after the first working two-column format to fit more content into each physical page
- the current frontend now triggers print from the visible library scope, the current songbook scope, or a single song page
- the digital songbook now includes a TOC-side search field that filters the currently visible songbook by song title, artist, or album without changing playlist scope
