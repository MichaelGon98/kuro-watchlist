# Kuro Watchlist — instructions for Claude Code

This is a no-build, single-file PWA (`index.html`) for tracking anime, using the AniList GraphQL API. Full context is in `DEVELOPMENT_LOG.md`.

## Standing rules

1. **At the start of every session, read `DEVELOPMENT_LOG.md`** (architecture, decisions, status, change log) before touching code.
2. **Record every change in `DEVELOPMENT_LOG.md`.** After each change (code, config, docs), append an entry to the Change Log at the bottom: `### YYYY-MM-DD — short title` plus bullets of what changed, in which file, and why. Also keep "Current status", "Known issues" and "Next ideas" accurate. Do this in the same turn as the change, not later.
3. Keep the app dependency-free and single-file unless the owner agrees otherwise. Test in a browser after UI changes (hard refresh / clear the service worker, it caches the page).
4. **Boundaries:** do not build scraping, embedding or re-serving of video from unlicensed streaming sites, or torrent streaming. The owner's configurable Watch link (a plain link) stays. Legal options (official "Where to watch" links, tracking, trailers, playing the owner's own files via Jellyfin/Plex) are fine.
5. Never put the owner's personal details (name, email) in requests to outside services. Treat AniList tokens as secrets: localStorage only, never logged, never exported.
6. Serve locally with `python -m http.server 5188` from the project folder. The owner is on Windows (PowerShell and cmd) and uses Brave.
