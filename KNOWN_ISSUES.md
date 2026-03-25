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

Relevant files:
- [backend/src/routes/spotify.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/spotify.js)
- [backend/.env.example](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/.env.example)

### 3. There is no automated test suite in the repository

Verified:
- root, backend, and frontend `package.json` files do not define test scripts

Impact:
- regression detection depends on manual runtime checks
- documentation and report inspection matter more than usual

### 4. Some backend capabilities still have limited or no frontend workflow

Verified:
- `collections` routes exist
- `print_sets` exist in the DB schema
- current frontend focuses mainly on library, song, import, and reports pages

Impact:
- parts of the backend model are ahead of the UI
- some features are effectively internal-only for now

Relevant files:
- [backend/src/routes/collections.js](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/routes/collections.js)
- [backend/src/db/schema.sql](/C:/Users/Dell%207490/Documents/GitHub/Shir-On/backend/src/db/schema.sql)

## Historical issue

### Windows + Node 24 + `better-sqlite3`

Previously observed:
- `better-sqlite3` failed to install on Windows under Node 24 in this project

Current recommendation:
- use Node 20 LTS on Windows unless you have already validated a newer version locally
