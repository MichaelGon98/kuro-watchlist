# Kuro Watchlist — Development Log

> Living record of the project. **Every change made to the project must be recorded in the Change Log at the bottom of this file** (newest entry last), and the "Current status" / "Known issues" / "Next ideas" sections kept accurate. See `CLAUDE.md` for the standing rule.

## 1. What this is

**Kuro** is a mobile- and desktop-friendly web app (PWA) for tracking a personal list of anime to watch, adding to it on the go, filtering/browsing anime info, and finding where to watch each show legally.

- Owner's original request: track the list of anime they want to watch and add to it on the go; "cool" filters to see more info; modern look and feel; recommend where to get anime info; and (originally) act as a portal to watch episodes via Anikoto. **The embedded-player / scraping part was declined — see section 5.**
- The owner already uses MyAnimeList and AniList.

## 2. Files

All in the project root (originally `C:\Projects\Anime Watchlist Tracker App` on the owner's Windows laptop):

| File | Purpose |
|---|---|
| `index.html` | The entire app: HTML + CSS + JS in one file. No build step, no dependencies. |
| `manifest.json` | PWA manifest (name "Kuro Watchlist", standalone, dark theme colour). |
| `sw.js` | Service worker, cache name `kuro-v1`. Network-first for same-origin GETs, falls back to cache offline. Does not touch cross-origin requests (AniList). |
| `icon.svg` | App icon (purple/pink gradient play button). Used for favicon, apple-touch-icon and manifest. |
| `.claude/launch.json` | Dev-server config for Claude Code's preview (`python -m http.server 5188`). Not copied automatically between machines — recreate if missing. |
| `DEVELOPMENT_LOG.md` | This file. |
| `CLAUDE.md` | Standing instructions for Claude Code in this project. |
| `HANDOVER_PROMPT.md` | Prompt to paste into Claude Code on a new machine. |

## 3. Architecture

- **Stack:** vanilla HTML/CSS/JS, single page, no framework, no bundler.
- **Data source:** AniList GraphQL API (`https://graphql.anilist.co`), free, no API key, CORS-enabled, rate limit ~90 requests/min. Chosen over MAL (needs registered client), Jikan (unofficial MAL REST), Kitsu (weaker filters).
- **Storage:** `localStorage`
  - **Profiles = AniList accounts.** `kuro.profiles` — `{[userId]: {id, name, avatar, token, lastSync, pendingDel[]}}`; `kuro.active` — active user id, or `null` for the guest (no account).
  - `kuro.list.<userId>` — that profile's list, cached in this browser and synced with AniList. `kuro.list` (no suffix) — the guest list. Each list is an object keyed by AniList media id; each value is a slim copy of the media plus `status`, `progress`, `myScore` (own rating 0-100, AniList scoreRaw), `notes`, `added`, `updated` (ms), `synced` (ms), `entryId` (AniList list-entry id). `myScore`/`notes` undefined = unknown (never pushed, so AniList's values are not wiped).
  - `kuro.settings` — device settings `{provider, clientId, rate}` (shared by all profiles in that browser; `rate:false` hides ratings/notes).
  - `kuro.prefs` — per-profile look, this browser only: `{[userId|'guest']: {nick, pic (192px JPEG data URL), picMode: 'anilist'|'photo'|'initial', color, theme (reserved for future themes)}}`. Removed when that account signs out. Profiles also store AniList `avatarL`, `banner`, `infoAt` (refreshed daily during sync).
  - Old single-account data (`settings.token/user/lastSync` + `kuro.list`) is migrated to a profile automatically on first load.
- **List statuses (local ↔ AniList, one-to-one via `SMAP`/`RMAP`):** `planning↔PLANNING`, `watching↔CURRENT`, `repeating↔REPEATING` (shown as Rewatching), `paused↔PAUSED`, `completed↔COMPLETED`, `dropped↔DROPPED`. `ACTIVE` = watching + repeating (episode progress, Next up).
- **List item fields:** `status` is the *list* status; the show's airing status is `mstatus`. Use `freshMedia()` (not `slim()`) to copy fresh media data onto a list item, because `slim()` also returns `status`.
- **Views:** Discover (Next-up strip, filters, results grid, "Load more"), This week (airing schedule) and My List (status tabs, local filters). Detail sheet (modal / bottom sheet on mobile). Settings sheet. Bottom nav on phones (<=760px), top nav on desktop.
- **Detail sheet extras** are fetched lazily when opened (`DETAIL_Q`: `externalLinks`, `streamingEpisodes`, episode counts) and cached in memory only (`details`), never stored in localStorage (One Piece alone has ~1,180 episode entries).

### Key code landmarks in `index.html`
- `QUERY` / `anilist()` / `slim()` — search and discover query, response slimming.
- `F` (filter state), `vars()`, `run()`, `load()` — Discover filtering and paging.
- `norm()`, `searchVariants()` — punctuation-tolerant search (see Change Log).
- `cardHTML()`, `renderList()`, `renderNext()`, `refreshCards()`.
- `openModal()`, `loadDetails()`, `wtwHTML()`, `epsHTML()`, `fillDetails()`, `epTap()` — detail sheet, Where to watch, episode list.
- `openSettings()` — settings, profiles (switch / sign out / add account), export/import.
- Storage & profiles block near the top: `store`, `profiles`, `me()`, `listKey()`, `saveList()`, `saveProfiles()`, `switchProfile()` (switching reloads the page).
- AniList sync block (`SMAP`, `RMAP`, `COLL`, `SAVE`, `DEL`, `gql()`, `sync()`, `scheduleSync()`, `unsynced()`, `handleAuth` / `authing`, `renderProfileBtn()`) near the bottom of the script.

## 4. Features (current)

- **Discover:** search plus filters — sort (trending / popular / top rated / newest / most favourited), format, status, season, year, minimum score, multi-select genre chips. Adult content excluded (`isAdult:false`).
- **Add on the go:** `+` on any card adds to Plan to watch; the sheet sets Plan to watch / Watching / Completed / Dropped; episode stepper; progress bars on list cards.
- **My List:** status tabs with counts, text filter, genre filter, sort.
- **Detail sheet:** score, format, episodes, status, season, studio, next episode air time, popularity, synopsis, in-app YouTube trailer (youtube-nocookie iframe), **Where to watch** (official services from AniList `externalLinks` of type STREAMING), **Episodes** list (titles/thumbnails/official links where AniList has `streamingEpisodes`, otherwise a numbered grid; tap an episode to set progress, tap the current one again to undo; long shows show a 60-episode window with "Show all"), AniList and MAL links, Remove.
- **Next up:** strip at the top of Discover for Watching and Rewatching. Episodes that are out come first, with "N new" for airing shows you are behind on; episodes not out yet show "Ep N airs in 3h / Tue 17:00" (dimmed), sorted by air time. Airing info is refreshed by `refreshAiring()` (public AniList API, max every 30 min or when a stored air time has passed; works without an account) and on every sync.
- **This week:** airing schedule from yesterday to 7 days ahead, grouped by day, with local air times. "My shows" = list entries not completed/dropped; "All popular" = everything airing with popularity >= 10k (non-adult). Rows show Watched ✓ / Out now (+ "N to catch up") / Airs in 3h / Upcoming, a +1 button for the next unwatched aired episode, and + to add shows not in the list. Uses AniList `airingSchedules` (public), cached 10 min (`loadWeek()` fetches, `drawWeek()` renders).
- **Rating and notes (optional):** in the detail sheet of list entries: 1-10 buttons (tap again to clear) and a notes box (autosaves). Synced to AniList (`scoreRaw`, `notes`). My List cards show ♥ your rating instead of the average; sort "My rating". Can be hidden in Settings → Lists.
- **Profile look:** Settings opens with a profile card (AniList banner if any, picture, name, Edit profile). Editor: picture = AniList picture / uploaded photo (cropped to a square, shrunk to ~5 KB JPEG, stays in this browser) / coloured initial; 8 colours (ring and initial); display name. Works for the guest too. `look()` gives name and avatar HTML; `applyPrefs()` sets `--me` and `data-theme` on `<html>` — the hook for future app themes.
- **+1 episode:** one-tap button on Next up cards, on Watching/Rewatching cards in My List (replaces the ✓ when the next episode is out) and in This week; toast with Undo (5 s). Shared `bump()` logic: reaching the last episode completes the show, a planned/paused/dropped show becomes Watching (the detail-sheet stepper uses it too).
- **Watch link:** optional, user-configurable URL template (`{query}` is replaced by the title), must start with http(s). **No default** since 2026-11-25 (the app is public now); the Watch button is hidden until a link is set. A link already saved in a browser is kept. See section 5.
- **AniList sync:** two-way sync via AniList OAuth (implicit grant). Pulls the user's existing AniList anime list, pushes local changes, newest change wins per entry, removals propagate both ways (removals are queued in `pendingDel` so they survive being offline; entries deleted on another device are dropped locally), auto-sync ~2.5 s after a change, on open, and on tab refocus (>60 s since last). Manual "Sync now". Token stored in localStorage only and excluded from Export.
- **User profiles:** sign in with AniList and the list follows you to any browser or device you sign in on. Several accounts can be signed in on one browser (switch in Settings); the header settings button shows the active account's avatar (dimmed with a red ring if its sign-in expired). Without an account, a guest list stays in that browser; on first sign-in Kuro offers to move the guest list into the account. Sign out removes the account and its cached list from that browser only (warns if changes have not reached AniList).
- **Backup:** Export/Import list as JSON (token excluded).
- **PWA:** installable, offline shell, dark theme, modern thin rounded scrollbars (`color-scheme: dark`).
- **Search tolerance:** curly apostrophes normalised; if a search returns nothing it retries with punctuation relaxed; My List filter ignores punctuation, spaces and accents.

## 5. Decisions and boundaries (important)

- **No scraping, embedding or re-serving of video from unlicensed streaming sites, and no torrent streaming.** The owner asked for an in-app portal/player pulling from Anikoto, to know which servers those sites use, and for torrent streaming. All were declined (copyright infringement). Do not build these. The owner's own configurable Watch link (a plain link to a search page on a site they choose) was kept; it only opens a search page.
- Anikoto has many look-alike domains, some flagged by security scanners; no official domain could be verified. `anikoto.to` (the first guessed default) does not resolve. The owner supplied `https://anikototv.bz/`; both `/search?keyword=` and `/filter?keyword=` returned results when tested. The provider address is a setting, not hard-coded, because such domains change often.
- **Legal alternatives built or offered:** official "Where to watch" buttons (built), episode tracking (built), trailers (built). Offered but **not built**: "Play from my library" via Jellyfin/Plex (or local files) for anime the owner owns.
- Sync uses AniList itself as the backend (no server to run). A custom backend (Supabase/Firebase) was not chosen. 2026-11-25: the owner asked for user profiles across browsers and chose "profile = AniList account" over own accounts (Supabase) or local-only profiles.

## 6. Running and testing

- Serve the project folder (any static server). Quickest:
  ```
  python -m http.server 5188
  ```
  then open `http://localhost:5188`.
- **Gotcha — stale page:** the service worker and browser cache can serve an old `index.html`. Hard refresh (Ctrl+Shift+R) or unregister the service worker and clear caches (DevTools → Application) after changes.
- **Gotcha — wrong folder / busy port:** a server left running from an old folder keeps port 5188 and serves old files. Check what holds the port and stop it. The owner uses Windows (PowerShell and cmd) and the Brave browser; remember `cd /d` is cmd-only and `Set-Location`/`cd` quoted paths work in PowerShell.
- **Phone access:** same Wi-Fi via `http://<laptop-ip>:5188` (works, but not installable/offline because it is HTTP), or an HTTPS tunnel (`cloudflared tunnel --url http://localhost:5188`). Better: host the static files permanently (Netlify drop / GitHub Pages) — **not done yet**.
- **AniList sign-in on the hosted app needs no setup:** it has a built-in Client ID (`BUILTIN_CLIENT_ID` = 58014, owner's AniList client, Redirect URL `https://michaelgon98.github.io/kuro-watchlist/`). The built-in ID is only used at that exact address (`IS_HOSTED`), since AniList always redirects to the registered URL. A Client ID is public (implicit grant, no secret), so it is safe in the repo.
- **AniList sync setup for any other address (localhost, LAN, a fork):** create a client at anilist.co/settings/developer, set its Redirect URL to the exact hosted address of the app (not `localhost` for phone use), paste the Client ID into Kuro → Settings → Profile → AniList app setup, then Sign in with AniList. Use the same address and Client ID on every browser. To add a second account in one browser, log out on anilist.co first (AniList otherwise signs straight back in as the current account). Local storage is per origin, so each address keeps its own list until synced.

## 7. Current status

- App is functional locally. Verified in a browser pane against live AniList data: Discover, filters, add to list, detail sheet, Where to watch, episode list/tap, Next up, scrollbars, punctuation-tolerant search.
- Profiles (2026-11-25) verified in the browser pane: migration from the old layout, profile switching, guest list, settings UI on desktop and phone width, sync logic against a mocked AniList (queued delete, remote-removed entry dropped, local add pushed, remote add pulled), expired-token handling against the real AniList (it answers a bad token with HTTP 400 "Invalid token").
- **Not verified:** a real AniList login/sync round trip, incl. the guest-list merge prompt on first sign-in (needs the owner's Client ID and a hosted Redirect URL); the in-app trailer player; the phone layout after the later features; Firefox scrollbar look.
- **Hosted** on GitHub Pages: https://michaelgon98.github.io/kuro-watchlist/ (public repo https://github.com/MichaelGon98/kuro-watchlist, branch `main`, root folder). Verified loading there with no console errors and the service worker registered.
- The project folder is a git repo; commits use the GitHub noreply address (set in the repo's local git config). **To deploy: commit and `git push`**; Pages rebuilds in about a minute.

## 8. Known issues / caveats

- A minimum-score filter hides brand-new shows that have no score yet.
- AniList search is strict on spelling: e.g. "Worlds" (no apostrophe, no "s" strip match) may fail; the variant retry handles the common cases (`World's`, `Worlds`).
- Where-to-watch links come from AniList and are not region-specific; some titles have none.
- Two harmless console messages ("fetching the script") appeared once after clearing the service worker — likely service-worker update noise, unconfirmed.
- Icon is SVG only; some Android installs prefer PNG icons.
- Removal propagates to AniList only if the entry has a known `entryId` (an entry not yet synced has none, but then it is not on AniList either).
- Settings (Watch link, Client ID) and the profile look (photo, display name, colour) are per browser and do not sync: AniList has no place to store them. The owner has to re-enter their Watch link on the hosted site (it no longer comes as a default).
- Kuro-only data beyond status and episode progress (e.g. the `added` date) is not stored on AniList, so a new browser shows AniList's update time as the added date.
- Profiles only reach other browsers once the app is hosted at one fixed address (localStorage and the AniList Redirect URL are per address).

## 9. Next ideas (not started)

- **Next step for profiles:** verify sign-in and sync end to end in two browsers on the hosted app (built-in Client ID 58014, Redirect URL set to the hosted address by the owner).
- Jellyfin/Plex "Play from my library" button for anime the owner owns.
- **Themes for the whole app** (owner wants this next-ish): add `[data-theme=…]` blocks overriding the `:root` CSS variables, a picker in the profile editor, stored in `prefs.theme` (already applied by `applyPrefs()`).
- Stats page; quick +1 from the lock screen / notifications for new episodes.
- PNG icons (192/512) and maskable icon for installability.

## 10. Change Log

Newest entries go at the bottom. Format: `### YYYY-MM-DD — short title` then bullets of what changed, in which file, and why. Early entries share dates because the first build happened in one long session.

### 2026-11-19 — Initial build
- Created `index.html`, `manifest.json`, `sw.js`, `icon.svg`: Discover with AniList filters, add-to-list, detail sheet, My List, settings, export/import, responsive layout (bottom nav on phones), PWA basics.
- Fixed a bug where `items.map(cardHTML)` passed the array index as the `showProg` argument (cards crashed). Now `items.map(m=>cardHTML(m))`.

### 2026-11-19 — AniList two-way sync
- Added OAuth (implicit grant) connect flow in Settings, `sync()` pull/push with per-entry `updated`/`synced` timestamps, auto-sync, delete propagation, token excluded from export.

### 2026-11-19 — Watch link made configurable
- First default `https://anikoto.to/filter?keyword={query}` was a guess and did not resolve. Removed hard-coded guess; added settings field and "Set up Watch link" fallback; then set default to `https://anikototv.bz/search?keyword={query}` after confirming it returns results. Old broken saved value is migrated automatically.

### 2026-11-19 — Moved project to its permanent folder
- Project moved from a temporary scratch folder to `C:\Projects\Anime Watchlist Tracker App`. Removed a stray empty temp file; recreated `.claude/launch.json`.

### 2026-11-19 — Official streaming, episodes, trailer, Next up
- Detail sheet: "Where to watch" buttons (AniList `externalLinks` STREAMING), Episodes list with tap-to-track (`streamingEpisodes` metadata when present, numbered grid otherwise, 60-episode window + "Show all"), in-app YouTube trailer, "More" section.
- Discover: "Next up" strip for Watching items.
- Declined: embedded player / scraping unlicensed sites, torrent streaming (see section 5).

### 2026-11-19 — Modern scrollbars
- Thin rounded dark scrollbars, accent on hover, no arrow buttons; `color-scheme: dark`.

### 2026-11-19 — Search tolerant of punctuation
- Normalise curly apostrophes; `searchVariants()` retries with relaxed punctuation and trailing-"s" removal when nothing is found; `norm()` makes the My List filter ignore punctuation, spaces and accents; empty-result message suggests fewer filters.

### 2026-11-25 — Handover documentation
- Added `DEVELOPMENT_LOG.md`, `CLAUDE.md` (standing instruction to record every change here) and `HANDOVER_PROMPT.md` so work can continue on another machine. No app code changed.

### 2026-11-25 — User profiles (AniList accounts) across browsers
- `index.html` storage: lists are now stored per AniList account (`kuro.list.<userId>`), with `kuro.profiles` and `kuro.active`; `kuro.list` is the guest list. Automatic migration from the old single-account layout. Why: the owner wants saves available from different browsers; owner chose "profile = AniList account" (no server, stays dependency-free).
- `index.html` sign-in: `handleAuth` now looks up the AniList Viewer (id, name, avatar) for the returned token, creates/updates the profile, offers to move the guest list into a new account, then switches to it. Several accounts per browser.
- `index.html` settings: new Profile section (accounts with Switch / Sync now / Sign out, "No account" guest entry, Sign in / Add account / Sign in again), Client ID moved into a collapsible "AniList app setup". Header settings button shows the active account's avatar.
- `index.html` sync: removals are queued (`pendingDel`) and sent first, so offline removals are not lost; entries removed on another device are dropped locally; changes made during a sync trigger another sync; bad tokens are detected from AniList's HTTP 400 "Invalid token" (it does not send 401), marking the profile signed out instead of repeatedly failing; list views refresh after a pull. Import now strips `synced`/`entryId` so entries from another account are pushed rather than treated as removed.
- `sw.js`: cache name bumped to `kuro-v2` so the new page replaces the cached one.

### 2026-11-25 — Git repo for GitHub Pages hosting
- Ran `git init` (branch `main`) and added `.gitignore` excluding `.claude/` (machine-local launch config). Why: the owner chose GitHub Pages hosting and installed the GitHub CLI. Free Pages needs a public repo; the owner agreed to publish all project files.

### 2026-11-25 — Hosted on GitHub Pages
- Owner signed in with `gh auth login`. Set repo-local git identity to the GitHub noreply address (keeps the owner's email out of public history), committed everything, created public repo `MichaelGon98/kuro-watchlist`, pushed `main`, enabled Pages (branch `main`, `/`).
- Live at https://michaelgon98.github.io/kuro-watchlist/; checked: Discover loads, no console errors, service worker registers, Settings shows that address as the Redirect URL. Why: a fixed HTTPS address is needed for profiles/AniList sign-in to work across browsers and on the phone.

### 2026-11-25 — Built-in AniList Client ID for the hosted app
- `index.html`: added `HOSTED_URL`, `BUILTIN_CLIENT_ID` ('58014', supplied by the owner), `APP_URL`, `IS_HOSTED` and `clientId()`. On the hosted address, "Sign in with AniList" works with no setup; Settings shows "Sign-in help" with an optional field to use your own Client ID (empty = built-in). Elsewhere (localhost/LAN) Settings still asks for a Client ID and points to the hosted app. Why: so other users don't have to register their own AniList client.
- Verified on localhost that the setup prompt still appears there.

### 2026-11-25 — Watch link default removed, Paused/Rewatching statuses, airing-aware Next up
- `index.html` Watch link: `DEFAULT_PROVIDER` is now empty and no longer forced; the Watch button is hidden until a link is set (the "Set up Watch link" button is gone); Settings field renamed "Your Watch link (optional)" with a placeholder and rejects non-http(s) values. Why: the app is public now, so other users should not get an unofficial streaming site by default (legal/reputation risk for the owner, and the domain is one of the look-alikes scanners flag). Links already saved in a browser are kept.
- `index.html` statuses: added `repeating` (Rewatching) and `paused` (Paused), mapped one-to-one with AniList. Why: AniList PAUSED/REPEATING used to become `watching`, and editing such an entry pushed CURRENT back, losing the real status. Sync now also takes AniList's status when timestamps are equal, so entries stored wrongly by older versions are corrected on the next sync. Episode stepper shows for Watching/Rewatching/Paused; tapping an episode on a paused show sets it to Watching.
- `index.html` airing info: `slim()` now also stores `mstatus`; new `freshMedia()`; sync refreshes media data (next episode, episode count) for every pulled entry without marking it as a local change; new `refreshAiring()` updates unfinished shows via the public API on load and on tab refocus. Fixed the detail sheet "Status" stat showing the list status for list-only items.
- `index.html` Next up: new `nextInfo()` / `whenText()`; shows "airs in 3h / Tue 17:00" for episodes not out yet and "N new" when behind on an airing show; ordered out-now first, then by air time.
- `sw.js`: cache bumped to `kuro-v3`.
- Tested on localhost: airing refresh fixes stale data on load ("3 new" matched AniList), sync against a mocked AniList (old wrong `watching` → `paused`, newer REPEATING pulled, local paused pushed as PAUSED, media refresh keeps list status), Watch link hidden when empty / shown when set / `javascript:` rejected, phone layout.

### 2026-11-25 — This week airing schedule and +1 episode button
- `index.html`: new **This week** view (header tab + bottom-nav button with calendar icon; `#v-week`, `WK_Q()`, `loadWeek()`, `drawWeek()`, `wkMode`), "My shows" / "All popular" chips. Covers yesterday through 7 days ahead so missed episodes can be caught up. Fetched shows go into `cache` (detail sheet opens) and refresh airing data of list entries. Typing in the search box while on This week switches to Discover.
- AniList gotcha found: `airingSchedules(mediaId_in: null)` returns HTTP 500, so the query is built without that argument for "All popular".
- `index.html`: **+1** button (`[data-plus]`, `plusOne()`) on Next up, My List Watching/Rewatching cards and This week rows; `toast()` now supports an Undo button and truncates long titles on one line. New shared `bump()`; `step()` (detail-sheet stepper) now uses it, so it also completes a show at the last episode (it did not before).
- `sw.js`: cache bumped to `kuro-v4`.
- Tested on localhost against live AniList: empty state, All popular (61 episodes over the week), My shows with "Out now · 3 to catch up", +1 from This week / Next up / My List, Undo, completion at last episode, paused → watching, phone and desktop layouts.

### 2026-11-25 — Optional rating & notes, customisable profile look
- `index.html` rating/notes: detail sheet (list entries) gets "Your rating" 1-10 and a notes box; stored as `myScore` (0-100) and `notes`; `COLL` now reads `score(format:POINT_100) notes`, `SAVE` sends `scoreRaw`/`notes` only when Kuro knows them (protects scores set on AniList before this version); entries pulled earlier get their AniList score/notes filled in on the next sync. List cards show ♥ rating, new sort "My rating", Settings → Lists checkbox to hide the feature. Hint warns that AniList entries may be visible to others. Why: owner asked for optional scoring and notes.
- `index.html` profile look: `kuro.prefs`, `look()`, `applyPrefs()`, `openProfileEditor()`, `squareJpeg()`; profile card at the top of Settings; header button and account rows use the custom picture/name; AniList banner and large avatar fetched (`VIEWER_Q`, `viewerInfo()`, refreshed daily in sync); sign-out also deletes that account's custom look. Why: owner wants profiles to feel more personal, with whole-app themes later (prefs has a reserved `theme` and `applyPrefs()` already sets `data-theme`).
- Fixed on the way: rating buttons wrapped to two rows on phones (now share one row).
- `sw.js`: cache bumped to `kuro-v5`.
- Tested on localhost: rate/clear/notes autosave, ♥ badge, hide toggle; sync against a mocked AniList (old entry keeps AniList score 90 + notes while pushing local progress; new rating pushed as scoreRaw 70); photo upload (400×300 → 192px, 3 KB), colour, nickname, initial mode, guest customisation, sign-out removes the look; phone layout.
