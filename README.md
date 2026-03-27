# Shir-On

Shir-On is a local-first personal song library and printable songbook.

The app lets you:
- import songs from Spotify playlists, albums, and individual songs
- import songs from CSV or JSON
- manage songs, lyrics, tags, playlists, and print flows
- group songs into collections
- run live lyrics fetch jobs with per-song status
- reconnect to active lyrics and Spotify import jobs after page navigation
- review unified batch reports with drill-down diagnostics
- keep one lyrics row per song through startup repair + unique-index enforcement on local databases
- decode legacy HTML entities such as `&#039;` back into plain apostrophes during startup repair and future saves
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

- the top navigation now includes a dedicated `Library` entry, so pages no longer need separate back-to-library buttons
- the top navigation stays visible while moving between pages
- `Songbook` now appears first in the top navigation and uses a larger, book-like accent style so the reading flow feels primary
- major page headers now use one clear primary title instead of eyebrow text plus a second large heading
- reading mode can be scoped to `All songs` or one imported playlist
- the main navigation label is now `Import`
- the Spotify connection action now sits in the same header row as the `Spotify Connection` title
- the import screen now places the Spotify connect/disconnect action directly in the main page header instead of a separate connection card
- the Spotify connect/disconnect action is now pinned to the far right edge of the import page header
- the import screen now uses one Spotify input for playlist, album, or song URLs/URIs/IDs, and the backend detects which Spotify object to import
- Spotify single-song import is now supported from that same unified Spotify import field
- the Library screen now embeds a compact Spotify import row inside the same top header block as the page title and the `Print` / `Fetch` actions; the `IMPORT` action sits in that Spotify row header and the flow still only forwards into the Import screen so the actual job and progress stay there instead of duplicating import state inside Library
- the Library header now stacks its right-side actions as `FETCH LYRICS` above `PRINT`, while the centered Spotify import row stays shorter and visually aligned on one level
- the Library playlist selector now lives inside the main filter row immediately after the lyrics-status filter, and the visible/artist/lyrics chips now sit on the `selected` action bar instead of in a separate scope strip
- the Library header now keeps the title block, centered Spotify import row, and right-side `FETCH LYRICS` / `PRINT` stack aligned from the same top edge, with `PRINT` centered directly under `FETCH LYRICS`
- the Library header now uses a true three-part grid so the Spotify `IMPORT` block stays centered independently of the right-side action stack
- the Library filter row now starts with `Playlist`, then lyrics status, then one combined title-or-artist search field, followed by `Year`, `Sort`, and `Clear`; the separate Artist field was removed as duplicate filtering
- the Library `selected` action bar now offers `Add to Collection` before `Delete Selected`, and that action hands the current selection off to the Collections screen so adding to an existing collection or creating a new one is managed there
- JSON import remains available as an advanced path for pasted export data or script-generated record arrays
- the `Fetch Lyrics` page can also be scoped to one playlist and reconnect to the tracked lyrics job after navigation without jumping to an unrelated run
- the `Fetch Lyrics` screen now loads explicitly requested songs through one bulk API request instead of one request per song
- the Song page year field now supports both typing and picking from a year list
- the Song page header now stays compact and no longer repeats a status/tag summary row under the title
- the Song page actions now include a direct `Delete Song` button in place of the older generic reports shortcut
- the Song page no longer includes an inline `Fetch Lyrics` action; lyrics fetching now stays in the dedicated `Fetch Lyrics` flow instead of splitting that behavior across two screens
- printing now opens a styled preview tab immediately and then loads the finished PDF into it once the backend response is ready
- the Reports screen includes a destructive `Reset Reports` action that clears both active and legacy JSON report files
- the song editor and collections pages now use the same card, spacing, and action hierarchy patterns as the main library UI
- the song editor now exposes comma-separated tag editing on top of the existing backend tag support
- background lyrics and Spotify import jobs now refuse duplicate runs for the same scope and reconnect to the existing job instead
- library filtering now uses only `All Songs`, `Has Lyrics`, and `No Lyrics`
- print entry points are now exposed directly in the Library and Songbook screens
- user-facing lyrics terminology now consistently says `Fetch` instead of `Run`
- the Songbook screen now excludes songs without lyrics
- printed songbooks now use a two-column book layout, including a two-column table of contents
- print pages now keep Hebrew songs in RTL alignment and allow longer single-song prints to flow from the first column into the second
- each printed song is now constrained to a single page; longer songs shrink font as needed instead of spilling past that page
- printed pages now include page numbers, and the table of contents includes matching page numbers for each song
- Hebrew single-song print pages now begin from the right column first
- non-Hebrew single-song print pages now begin from the left column first
- the print engine now uses tighter header/footer spacing and denser TOC spacing to reduce empty columns and empty pages
- the print engine now measures page geometry plus TOC row and lyric token heights in Puppeteer, then assigns pages and columns deterministically in Node instead of probing live page overflow
- the table of contents now uses an explicit two-column page layout instead of browser auto-balancing, and it always pours content into the right column first and then the left
- TOC content now pours sequentially through the right column first and then the left, so artist groups no longer reserve dead space at column boundaries
- TOC columns are now positioned explicitly in right/left slots instead of relying on grid direction heuristics
- printed song pages now also use explicit right/left column markup, with long-song token splits computed before the final PDF render
- print preview now uses a pre-opened tab plus `fetch`/blob handoff, so backend print errors surface visibly instead of leaving a stuck `POST` preview tab
- explicit print columns now pin to the first grid row as well as the intended side, preventing a broken four-quadrant layout in Chrome PDF output
- the working print format is now kept as a fixed two-column book layout: Hebrew songs start on the right, non-Hebrew songs start on the left, and Hebrew song metadata stays right-aligned even when artist names are written in English
- print margins, footer space, and in-song line spacing are now slightly tighter to fit more lyrics on each page without changing the fixed two-column book structure
- TOC artist headings now apply explicit RTL/LTR alignment plus edge anchoring too, so Hebrew artist names stay right-aligned in the printed contents pages while English names stay left-aligned
- the printed TOC title now renders as `Shir On - Table of Contents` in a more book-like serif heading with extra breathing room before the artist/title rows begin
- the printed TOC heading is now a centered two-line title: `Shir - On` plus `<printed list name> - Table of Contents`, with extra space before the contents begin
- printed Hebrew artist headings in the TOC now force `dir="rtl"` in the markup itself, not just CSS alignment, so Chromium PDF keeps them anchored to the right edge of their column
- printed TOC artist headings now infer RTL from the grouped songs as well, so artists stored with Latin-script names still right-align when their songbook section is Hebrew
- printed TOC artist headings now use a plain block-level alignment pattern instead of the older grid/max-content wrapper, because Chromium PDF was not reliably honoring that layout for Hebrew headings
- TOC filling now starts from the left column for non-Hebrew printed books and from the right column for Hebrew ones
- long printed songs now re-measure their start and continuation columns before final render, so a last line near the footer is pushed into the next column instead of being clipped
- printed song pages now place `Back to Contents` directly under the page number, centered, slightly larger, and in the same accent color family as the TOC title
- printed page numbers are now slightly larger and sit with a bit more breathing room above the `Back to Contents` link
- every printed songbook page now carries a centered running header in the format `Shir On - [playlist/collection/all songs]`
- the printed TOC title now emphasizes the printed list name more strongly with a larger accent serif line and extra gap before the contents begin
- the print route now honors playlist-aware print requests even when the frontend sends both `songIds` and `playlistId`, instead of accidentally dropping the selected songs and failing with an empty print scope
- printed song cards now keep title, artist, album, and year together on one metadata line instead of stacking them across multiple lines
- printed running headers and footer regions now center their content more cleanly inside the reserved header/footer space, and the page number keeps a clearer gap above `Back to Contents`
- the print engine now avoids an extra stabilized TOC measurement pass, uses a conservative fast-path for obviously long songs, and reduces flow re-measure loops without changing the final layout rules
- the printed one-line song metadata now uses slightly softer typography so the compact header reads more naturally without giving up the single-line format
- print-time lyrics cleanup now removes structural marker lines such as `מעבר` and `פזמון`, strips a leading `פתיחה` marker, strips a trailing `סיום` marker, and drops leading chord-definition lines like `Cm6: x3x243`
- printed running headers and footers now reserve even more breathing room, and `Back to Contents` remains visible with a larger gap below the page number
- the same structural lyrics cleanup now applies to stored lyrics too, so future saves and startup repair remove those markers from the songs themselves instead of only hiding them in print
- the running header is now omitted from the first TOC page because that page already has its own main title block
- compact print fitting now uses a larger safety margin near the bottom of the page so last lyric lines are less likely to clip against the footer region
- single-song print fitting now uses an extra bottom margin on top of that compact safety, so one-song pages promote to safer layouts before the last line can hit the footer
- compact songs now also need a real comfort margin below the bottom limit; borderline songs are promoted into safer flow layouts instead of staying in one-column spread pages and clipping on the final line
- when a compact song is left alone on its own spread page, the print engine now prefers a measured two-column flow fallback for borderline cases instead of leaving the second column empty and risking a clipped last line
- single-song spread pages now go through an extra real spread-layout overflow check, and clipped pages are promoted to two-column flow before the final PDF render
- empty lyric lines in print now use an even taller spacer, so blank-line breaks stand out more clearly without changing the line height of normal lyric rows
- printed lyrics blocks now use a real bottom guard (`flow-root` plus bottom padding), and overflow validation checks the bottom of the last rendered lyric line instead of only the outer container
- the print engine now caches repeated song+font measurements inside one PDF build, reuses computed flow fallbacks, and renders the final HTML with a lighter readiness wait so large prints finish faster without changing layout rules
- the Library screen now remembers the last chosen playlist and filter state when you leave the page and return
- the Songbook screen now remembers the last chosen playlist scope when you leave the page and return
- the digital songbook now includes a search field above the TOC that filters visible songs and artist groups by song title, artist name, or album
- the print preparation screen now shows one concise loading message instead of repeating the same status twice
- the print error screen now stays concise too, without the extra explanatory footer sentence
- startup repair now also cleans stored HTML entities like `&#039;` out of artist names, song titles, lyrics, and tags, and new saves decode those entities before storage
- digital songbook TOC jumps now leave the song title visible instead of hiding it under the sticky app chrome
- printed song pages now include a fixed `Back to Contents` link to the start of the PDF table of contents
- digital songbook TOC artist headings now align by language too, so Hebrew artist names stay right-aligned in the left-hand contents rail
- opening a song from the digital songbook now preserves both the current song position and the left-hand TOC scroll position, so returning from the song editor lands back on the same song in both places instead of resetting the songbook rail
- clicking `Songbook` from the top navigation now opens the songbook fresh from the beginning, instead of restoring the prior reading position
- the Songbook playlist selector now appears without an extra `Playlist` label above it

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
