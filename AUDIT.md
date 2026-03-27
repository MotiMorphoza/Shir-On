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
- printed song headers now keep title, artist, album, and year on one line
- printed running headers, page numbers, and `Back to Contents` links now sit more centrally within the reserved header/footer bands
- the print engine now skips the old extra stabilized TOC pass, uses a conservative fast-path for obviously long songs, and performs fewer DOM re-measurements during flow refinement
- the one-line printed song metadata received a lighter typographic pass so the compact line remains readable
- print-time lyrics cleanup now strips structure-only labels such as `מעבר`, `פזמון`, leading `פתיחה`, trailing `סיום`, and leading chord-definition lines before pagination
- header/footer breathing room was increased again so running headers, page numbers, and `Back to Contents` sit farther from the lyric content
- the same lyrics-marker cleanup now runs on stored lyrics during saves and startup repair, so the song texts themselves are normalized instead of only the printed output
- the running header no longer appears on the first TOC page because that page already carries the full title block
- compact-song fit now uses a larger bottom safety margin so songs near the page limit are pushed earlier into smaller fonts or flow layout instead of clipping on the last line
- one-song pages now apply an additional compact-fit buffer beyond that general margin, because clipped last lines are most noticeable when a single song owns the page
- spread-page compact songs now also require a comfort margin beyond the raw fit threshold, so borderline songs move to safer flow layouts instead of staying in a single column and clipping at the bottom
- leftover compact songs that end up alone on a spread page now promote into a measured flow fallback when available, so an empty second column can be used instead of clipping the last line in the only occupied column
- single-song spread pages now go through an extra real spread-layout overflow check, and clipped pages are promoted to two-column flow before the final PDF render
- printed blank-line separators now use an even taller dedicated spacer so stanza breaks read more clearly without loosening the regular lyric line spacing
- printed lyrics blocks now keep a dedicated bottom guard, and spread/flow overflow validation now checks the last rendered lyric line instead of only the card/pane container bottom
- repeated song+font measurements are now cached within a single PDF build, computed flow fallbacks are reused instead of being remeasured, and the final HTML render now waits only for DOM readiness because the print document has no external assets

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
- the top navigation now places `Songbook` first and gives it a stronger visual accent than the other nav links
- the import screen now uses the shorter `Import` title plus one Spotify input that auto-detects playlist, album, or song imports, including Spotify single-song import
- the same Spotify import shortcut now sits inside the Library header block itself, centered under the title/action row rather than as a separate card below it; its `IMPORT` button lives in the Spotify row header, the subtitle line is removed there, and the actual Spotify job still runs and reconnects only in the Import screen instead of duplicating job UI in Library
- the Library header now presents its main actions as a vertical `FETCH LYRICS` then `PRINT` stack on the right, while the compact Spotify import row stays shorter and centered within the same header block
- the Library playlist selector now sits inside the filter row directly after the lyrics-status filter, and the visible/artist/lyrics summary chips now live on the `selected` action bar instead of a separate playlist strip
- the Library header now top-aligns its title block, centered Spotify import row, and right-side action stack together, and `PRINT` is centered directly beneath `FETCH LYRICS`
- the Library header now uses a true three-zone grid so the centered Spotify import area no longer drifts toward the right-side action stack
- the Library filter row now starts with `Playlist`, then lyrics status, then one combined title-or-artist search field; the separate Artist input was removed because it duplicated the search behavior
- the Library `selected` bar now exposes `Add to Collection` before `Delete Selected`, but the actual choice between adding to an existing collection or creating a new one is handled on the Collections screen instead of through an inline chooser inside Library

Code:
- [frontend/src/main.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/main.jsx)
- [frontend/src/pages/ImportPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/ImportPage.jsx)
- [backend/src/routes/spotify.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/spotify.js)
- [frontend/src/pages/SongbookPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/SongbookPage.jsx)
- [frontend/src/components/FilterBar.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/components/FilterBar.jsx)
- [frontend/src/pages/DuplicatesPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/DuplicatesPage.jsx)

### 9b. Playlist-aware print requests could drop their songs

Status: `Fixed`

What changed:
- the print route now resolves playlist metadata separately from song selection
- requests that include both `songIds` and `playlistId` once again print the explicit song selection instead of falling into an empty playlist-only branch
- playlist-only print requests now also load songs from that playlist when no explicit `songIds` were sent

Why it mattered:
- the Library and Songbook screens send `playlistId` together with the visible song selection so the printed title and TOC direction can reflect the chosen playlist
- the old branch order treated `playlistId` as mutually exclusive with `songIds`, which could leave the print route with zero songs and make printing fail even though the frontend had sent a valid scope

Code:
- [backend/src/routes/print.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/print.js)

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
- removed redundant stacked page-header labels so major screens now use one stronger primary title

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

### 23. Printed songbook pages did not behave like a two-column book

Status: `Fixed`

What changed:
- printed TOC pages now render in two columns
- two-song print pages now place songs side by side as two columns on the page
- single-song print pages now use a two-column page flow, so longer songs can continue from the first column into the second
- long songs now step down through smaller print font presets so one song still stays within one physical page
- printed pages now render page numbers, and TOC entries include those song page numbers
- Hebrew titles, artists, metadata, TOC entries, and lyrics keep RTL alignment inside the PDF
- Hebrew single-song pages now start from the right column first
- non-Hebrew single-song pages now start from the left column first
- the print engine now measures page geometry plus TOC row and lyric token heights in Puppeteer, then assigns pages and columns deterministically in Node before the final render
- print heuristics are now stricter about pairing two songs on one page, and TOC spacing is tighter to reduce half-empty columns and empty pages
- TOC pages now use explicit right/left column assignment instead of automatic browser column balancing, to reduce dead space and extra TOC pages
- TOC rows now flow continuously through right then left columns without forcing a new artist section to start at a fresh column
- print preview now opens a tab immediately but fetches the PDF from the app first, so backend print failures can render as readable errors instead of a stuck form-post preview tab
- explicit right/left print columns now pin themselves to the first grid row, preventing Chrome from laying the left column into a second row and making the page look split into four quadrants
- the working print format is now fixed in docs and code as a two-column book spread, with Hebrew songs starting from the right column, non-Hebrew songs from the left, and Hebrew metadata blocks staying right-aligned even when artist names are written in English
- print page margins, footer space, and in-song line spacing were tightened slightly again after the first working layout to reduce unused top/bottom space and fit more lyric lines per page
- printed TOC artist headings now apply explicit RTL/LTR alignment and edge anchoring as headings, so Hebrew artist names stay right-aligned in the contents pages while English names remain left-aligned
- printed TOC headings now use a block-level edge anchor instead of flex-based alignment, and the TOC title now renders as `Shir On - Table of Contents` with more space before the contents begin
- printed Hebrew TOC artist headings now also force `dir="rtl"` directly in the heading markup, because CSS alignment alone was still not enough in Chromium PDF output
- printed TOC artist headings now infer their RTL/LTR class from the grouped songs as well, so artists stored in Latin letters still align as Hebrew headings when their section songs are Hebrew
- printed TOC artist headings now use a plain block + `text-align` structure instead of the older grid/max-content wrapper, because Chromium PDF was not reliably honoring that wrapper for Hebrew alignment
- printed TOC heading is now a centered two-line title that includes the printed list name, and TOC filling now starts from the left for non-Hebrew books or from the right for Hebrew books
- printed song pages now center `Back to Contents` directly beneath the page number, using a larger accent link instead of a small side footer link
- printed page numbers were also nudged larger and slightly higher so there is clearer breathing room between the page number and the `Back to Contents` link below it
- printed songbook pages now also carry a centered running header in the form `Shir On - [playlist/collection/all songs]`, so the printed scope stays visible throughout the book and not only on the TOC title page
- the printed TOC title now gives the printed list name a larger accent serif line and a little more breathing room before the first artist headings
- the print preparation screen now shows one concise loading message instead of two near-duplicate status lines
- the print error screen now also keeps only the core error message instead of adding an extra explanatory footer line
- digital songbook TOC jumps now respect the sticky header height, so song titles and `Open` links stay visible after navigation
- printed song pages now include a fixed link back to the start of the PDF table of contents
- the styled print-preview waiting screen is back, so the pre-opened tab now looks intentional instead of like a blank fallback page
- the Library and Songbook pages now remember their last chosen playlist/filter scope after navigation by persisting view state in local storage
- long printed songs now re-measure both columns after the initial split and move trailing lines into the next column when needed, so footer-adjacent lines do not get clipped at the bottom of the page
- digital songbook TOC artist headings now align by language, and opening a song from the songbook now preserves both the current song position and the TOC rail position for the return trip from the editor
- the digital songbook TOC now includes a search field that filters visible songs and artist groups by song title, artist, or album without changing the underlying playlist scope
- the top-nav `Songbook` entry now resets the digital songbook to its beginning, so a deliberate menu-open does not restore an older reading position

Why it mattered:
- the old print layout behaved more like stacked cards than a real book spread, and live overflow probing was still letting Chrome create zig-zag TOC flow and dead space even after the first print rewrite

Code:
- [backend/src/print/engine.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/print/engine.js)
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
- `Import` nav label was shortened to `Import`
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
- the Song page no longer offers a separate inline `Fetch Lyrics` button, so lyrics fetching now stays in the dedicated fetch workflow instead of splitting between the song editor and the fetch screen

Why it mattered:
- the extra row made the song page feel busier without helping the main editing flow

Code:
- [frontend/src/pages/SongPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/SongPage.jsx)

### 25. Song editor action stack still kept a low-value generic reports shortcut

Status: `Fixed`

What changed:
- replaced the generic `Open Reports` action in the song editor with a direct `Delete Song` button
- deletion now asks for confirmation and returns to the previous screen when possible, or the library as a fallback

Why it mattered:
- the edit screen is a per-song workflow, so a direct destructive action is more useful there than a generic jump to the full reports area

Code:
- [frontend/src/pages/SongPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/SongPage.jsx)

### 26. Stored HTML entities leaked into visible song text

Status: `Fixed`

What changed:
- startup repair now decodes stored HTML entities such as `&#039;` back into plain text across artists, albums, songs, lyrics, and tags
- the sanitize layer now decodes those entities before saving future text, so the apostrophe form does not come back on new imports or edits

Why it mattered:
- visible song text could show raw entity strings like `&#039;` instead of real punctuation, especially in Hebrew song titles and lyrics

Code:
- [backend/src/utils/sanitize.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/utils/sanitize.js)
- [backend/src/db/repair.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/db/repair.js)
- [backend/src/index.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/index.js)

### 22. Import flow front-loaded too much Spotify connection chrome

Status: `Fixed`

What changed:
- removed the separate `Spotify Connection` heading block and explanatory connect text from the top of the import screen
- moved the Spotify connect/disconnect action into the main import page header on the right
- pinned the Spotify action group to the far right edge of the header instead of letting it sit centered when extra width was available

Why it mattered:
- the extra connection block pushed the actual import controls down and repeated information that the primary action button already communicated

Code:
- [frontend/src/pages/ImportPage.jsx](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/frontend/src/pages/ImportPage.jsx)

### 24. Printed TOC and page wrappers still had layout ambiguity

Status: `Reduced`

What changed:
- TOC columns now sit in explicit right/left grid slots instead of depending on container direction heuristics
- printed page wrappers now use a smaller fixed content height to reduce phantom blank pages after full content pages
- long song pages now render through explicit right/left column containers instead of relying on CSS multi-column flow

Why it mattered:
- the right column must fill before the left in a predictable way, and over-tall page wrappers were a likely source of extra blank pages in the PDF

Code:
- [backend/src/print/engine.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/print/engine.js)

---

## Remaining priorities

### Critical

- `Reduced`: keep narrowing print configuration so unsupported options cannot drift back into the frontend
- `Open`: simplify the overlap between `Fetch Lyrics` and `Jobs` so users see `Fetch` as the action screen and `Jobs` as history/monitoring, not two competing places to manage the same work

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
