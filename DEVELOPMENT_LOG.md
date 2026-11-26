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
| `sw.js` | Service worker, cache name `kuro-vN` (bump on each release). Network-first for same-origin GETs, falls back to cache offline. Does not touch cross-origin requests (AniList). |
| `logo-source.webp` | The owner's panda logo (1254x1254, dark round emblem). Source for all icons; not loaded by the app. |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon-32.png` | Icons made from `logo-source.webp` with Pillow, on the logo's own background colour `#000107`. The maskable one shrinks the emblem to 80% so Android's shape crop keeps the whole ring. `icon-192.png` is also the header logo. Remake all of them if the logo changes. |
| `.claude/launch.json` | Dev-server config for Claude Code's preview (`kuro` = `python -m http.server 5188`; `kuro-alt` = port 5189 for when 5188 is busy). Not copied automatically between machines — recreate if missing. |
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
- `drawSettings()` / `drawProfile()` — the Settings page (`#v-settings`: Watch link, lists, effects, alerts, offline, backup) and the Profile page (`#v-profile`: look and AniList accounts); `openSettings()` / `openProfile()` just call `setView()`. `keepPlace()` redraws a page without losing scroll or focus.
- Storage & profiles block near the top: `store`, `profiles`, `me()`, `listKey()`, `saveList()`, `saveProfiles()`, `switchProfile()` (switching reloads the page).
- AniList sync block (`SMAP`, `RMAP`, `COLL`, `SAVE`, `DEL`, `gql()`, `sync()`, `scheduleSync()`, `unsynced()`, `handleAuth` / `authing`, `renderProfileBtn()`) near the bottom of the script.

## 4. Features (current)

- **Discover:** search plus filters — sort (trending / popular / top rated / newest / most favourited), format, status, season, year, minimum score, multi-select genre chips. Adult content excluded (`isAdult:false`).
- **Add on the go:** `+` on any card adds to Plan to watch; the sheet sets Plan to watch / Watching / Completed / Dropped; episode stepper; progress bars on list cards.
- **My List:** a sync line at the top ("Synced with AniList 3 min ago · Sync now", "N changes waiting", syncing pulse, expired sign-in, or "saved in this browser only · Sign in to sync" for guests). **Select** button: tap shows to select (check circles), then a floating bar: Select all/none, Move to… (any status, with Undo; Completed also sets progress to the episode count), Remove (confirm; queued AniList deletes like the single Remove), Done or Escape. Status tabs with counts, plus an **All** tab (shows a status chip per row). Filters: text (the header search box on phones), genre, format, airing state (New episodes to watch / Airing now / Finished airing / Not yet aired). Sorts: recently added, recently updated, title, AniList score, my rating, popularity, year (with season), progress %, episodes left, next episode airs, length (episodes × length); a reverse button flips any of them, and shows with no value for the sort always go last. "N of M shown · Clear filters" line when a filter is on. **Grid / Compact** switch: compact rows show cover, title, status, meta, "N new" or next air time, progress "ep x / y" with a bar, score (♥ my rating, or ★ AniList score when sorting by it) and +1. Tab, filters, sort, direction and layout are remembered per browser in `kuro.listUi`.
- **Detail sheet:** takes a glow and tinted top from the show's cover colour (`--mtint`, CSS `.modal:has(>.banner)`, so other dialogs stay plain); score, format, episodes, status, season, studio, next episode air time, popularity, synopsis, in-app YouTube trailer (youtube-nocookie iframe), **Where to watch** (official services from AniList `externalLinks` of type STREAMING), **Episodes** list (every episode is a row with a thumbnail: the streaming still where AniList has `streamingEpisodes`, otherwise a darkened slice of the show's banner with the episode number, which also shows while a still loads or if it fails; watched rows get a green border and ✓, never dimmed; official links where available; tap an episode to set progress, tap the current one again to undo; long shows show a 60-episode window with "Show all"), AniList and MAL links, Remove.
- **Hero spotlight** (top of Discover): up to 6 of the top-10 trending shows that have banner art, crossfading every 7 s with a slow zoom (paused on hover/focus, while a sheet is open, in the background; no auto-advance with reduced motion); dots and swipe; #rank, title, meta, synopsis (desktop), Details and + My List. The page behind Discover takes the current show's colour (`--htint`, animated via `@property`). Shares the Top 10 trending fetch (`fetchTop()`).
- **Watched in <year>** (for shows watched before tracking): the sheet's Your dates has a "Watched in" year picker (1960 to now, plus Clear dates); bulk: Select → "Year watched…" in the select bar (Plan to watch skipped, Undo). Saved as a year-only date (`'2014'`, AniList FuzzyDate with only the year): completed shows get finished = that year (and started, if empty or later); others get started = that year. Synced to AniList like other dates.
- **Your years** (Stats → Overview): completed shows per year (from finished/started year), tap a year to open that year's Wrapped; "N completed shows have no year yet · Set years" jumps to My List → Completed in Select mode.
- **Today tile** (top of Stats → Overview): today's date, your shows with an episode airing today (time and a live countdown, or "out now ✓"; tap to open) and how many episodes you watched today.
- **Your taste** (Stats → Overview): an SVG radar of your top 3–8 genres, a one-line summary ("Mostly Action and Fantasy, with a soft spot for Drama") and bars for your top 5 studios (tap → studio page).
- **Watch party:** "🎉 Watch party" in a show's sheet → pick the episode and time (defaults to the next airing, else 20:00) → Share link (share sheet, or copied). The link (`<hosted address>#party=<id>.<ep>.<unix time>`, nothing personal) opens a countdown page with the cover, a live timer, Details, + My List and Add to calendar (.ics); at zero it says "It's time! 🎉" with confetti. Preview button in the maker.
- **Episode reactions:** after +1 (cards, Currently watching, the sheet's + stepper) a small bar asks "Ep N?" with 🔥😭😂🤯😍😴 (hides after 8 s, ✕ to skip). The emoji is saved as the 5th item of that watch-history entry (`[time, id, firstEp, lastEp, emoji]`), shown on the diary row, and Wrapped gets a "Your reactions" slide (go-to reaction, the others, the most mind-blowing 🤯 episode). Off switch in Settings → Effects (`settings.react`).
- **Franchise timeline** (detail sheet, above More): when a show has prequels/sequels/side stories, Kuro walks those relations (up to 40 entries) and lists them by release date with format, year, episodes and your status; ✓ for completed, "You are here" on the open show, "N of M seen"; tap one to open it. Cached in memory (`frCache`).
- **What to watch tonight** (🌙 chip on Discover next to the season charts): choose 30 min / 1 h / 2 h / 3 h+; suggests up to 3 shows to continue (aired episodes you haven't seen that fit, recently watched first, "finishes it 🏁") and up to 3 to start from Plan to watch (or a movie that fits), with episode range and total time; Shuffle adds randomness; tap to open.
- **Random pick button:** a round spinner-wheel button in the top bar (next to Settings / your profile, on phones and desktop) replaces the Discover banner; the wheel spins on hover and tap, and wobbles with a ring once a day (`kuro.spinHint`, this browser) so it gets noticed.
- **Navigation polish:** a highlight pill slides to the current tab (top tabs on desktop, bottom bar on phones, `navPill()`), and bottom-bar icons bounce when tapped.
- **Pull to refresh** (touch screens): pull down at the top of a page; the panda logo turns with the pull and spins while Kuro reloads that view (Discover: grid, Top 10, hero, recommendations, a new Character of the day; This week: schedule; My List: AniList sync; Stats: redraw), then "Updated". The browser's own pull-to-refresh is turned off with `overscroll-behavior-y: contain`. Starting a pull on a sideways row or the hero is ignored.
- **Skeletons:** shimmering placeholders instead of "Loading…" in the hero, Top 10, Picked for you, This week and the detail sheet's Where to watch / Episodes (the grid already had them).
- **My List tint:** the page glows in the cover colour of the show you last marked an episode of (`listTint()`).
- **Celebrations** (Settings → Effects, `settings.party`, on by default): finishing a show (+1, the stepper, an episode tap, the Completed button, or bulk Move to Completed) shows a card with the cover, a "Completed!" stamp and confetti rain ("Tap to rate it" opens the sheet when it has no rating); a new badge shows a flipping foil badge card instead of the toast (tap → Stats → Badges); +1 buttons give a floating "+1" and a ring. Cards queue one at a time (`fxShow()`), auto-hide, never block the page. Vibration only after a real tap. With celebrations off, the old toasts show.
- **Seasonal effects** (Settings → Effects, `settings.season`: auto / snow / sakura / fireflies / leaves / off): a canvas of a few dozen particles above the page (`pointer-events:none`, `applySeason()`). Auto matches the theme (Sakura → petals, Forest → fireflies, Sunset → leaves, Ocean → snow, `THEME_FX`); other themes follow Japan's seasons (snow Dec–Feb, sakura Mar–May, fireflies Jun–Aug, leaves Sep–Nov). Re-checked whenever the theme changes, including the Settings preview. Colours adjust on the Light theme. Off with reduced motion.
- **Badges:** unlocked badges have a slow foil sheen (faster on hover) and a glowing icon; badges unlocked since you last opened Badges flip in with a "New" chip (`kuro.badgeSeen.<id|guest>`).
- **Airing countdown:** cards of shows you're Watching/Rewatching with a next episode show a live pill ("Ep 8 in 2d 4h 12m", under a day with seconds); it glows in the accent colour in the last hour and turns green "out now" (hidden an hour after airing). Next up rows that aren't out yet count down too. One 1 s ticker updates every `[data-cd]` element (`cdLeft()`, `cdPill()`), paused while the page is hidden.
- **Character of the day** (Discover, above Picked for you): a main character (top 3 by AniList favourites) from one of your 25 best-rated / most recent started shows, new each local day; picture, names, show (tap → sheet), role, ♥ favourites, a spoiler-free description (AniList `~!…!~` spoilers and "__Age:__" lines stripped), AniList link, "↻ Another". Card tinted with the show's colour. Stored per profile in `kuro.cotd.<id|guest>`.
- **Card motion:** a card fades up the first time its show scrolls into view (MutationObserver + IntersectionObserver, once per show per page load, skipped with reduced motion or a hidden page); with a mouse, cards tilt in 3D toward the pointer with a light shine (`.cover::before`).
- **Discover extras** (above the browse grid, in this order under Random pick): season chart links ("📅 Fall 2026 chart", "🔮 Winter 2027 preview"); Next up; **Pick up again** (paused > 14 days, dropped > 14 days with at least half watched, Watching untouched > 30 days with an episode out; Resume or +1, ✕ hides it for 30 days with Undo; `kuro.nudge.<id|guest>`); **Sequels and prequels** (shown at the start of Picked for you since 2026-11-26; sequels and prequels not on your list of your 150 most recent completed/watching/rewatching/paused shows, from AniList `relations`; ordered airing now → starts <date> → announced → out now, not seen → prequel not seen; cached 12 h in `kuro.rel.<id|guest>`; a sequel that is new since the last check and airing or upcoming gets a "New" badge for 14 days, a toast and, with alerts on, a notification; the first check only learns what exists, `kuro.relSeen.*`); **Picked for you** (one row: up to 8 sequels/prequels from the former "From your shows" logic first, captioned e.g. "Out now, not seen yet · Sequel to X" with the "New" badge, then up to 16 AniList recommendations for your 8 favourite started shows, taking turns between them and starting with a different show each day; skips shows already on your list; each card says "Because you liked X"; cached 30 min in memory); **Top 10** (big outlined rank numbers, #1 in gold; tabs This season / All-time best / Most popular (This season = current anime season by `SCORE_DESC` with `popularity_greater:3000`, `T10_SEASON_Q`; the others AniList `SCORE_DESC` / `POPULARITY_DESC`; trending lives in the hero only), no adult titles; the chosen tab is remembered in this browser, `kuro.t10Tab`; each tab cached 1 h in memory).
- **Season chart** (`#v-season`, opened from Discover; the nav keeps Discover highlighted): up to 200 most popular anime of a season, grouped TV / TV short / ONA / Movies / OVA / Specials / Other; ‹ › to change season; sort by popularity, score or title; "Hide shows on my list". Cached 30 min per season.
- **Studio pages:** the Studio box in the detail sheet is a button; the page lists the studio's main-studio anime by popularity (100 at a time, Load more), "you've seen N", filter All / Not on my list / Seen, back link to the show.
- **Next up:** strip at the top of Discover for Watching and Rewatching. Episodes that are out come first, with "N new" for airing shows you are behind on; episodes not out yet show "Ep N airs in 3h / Tue 17:00" (dimmed), sorted by air time. Airing info is refreshed by `refreshAiring()` (public AniList API, max every 30 min or when a stored air time has passed; works without an account) and on every sync.
- **Add to calendar** (This week): downloads `kuro-airing.ics` with every episode from My shows airing in the next 4 weeks (AniList `airingSchedules`, UTC times, event length = episode length, AniList link). A snapshot: download again to pick up changes.
- **This week:** airing schedule from yesterday to 7 days ahead, grouped by day, with local air times. "My shows" = list entries not completed/dropped; "All popular" = everything airing with popularity >= 10k (non-adult). Rows show Watched ✓ / Out now (+ "N to catch up") / Airs in 3h / Upcoming, a +1 button for the next unwatched aired episode, and + to add shows not in the list. Uses AniList `airingSchedules` (public), cached 10 min (`loadWeek()` fetches, `drawWeek()` renders).
- **Stats:** 4th tab (header and phone nav). Tiles: anime on list, episodes watched, time watched (episodes × AniList episode length), completed, your average rating. Bars: by status (tap opens that status in My List), top 8 genres, formats; "Most time spent" top 5 (tap opens the show); your ratings histogram 1–10. Computed from the active profile's list in `drawStats()`, nothing fetched. Completed shows count all episodes; genres/formats/time skip Plan to watch; shows without an episode length are left out of time (with a note). Rating parts hide when ratings are turned off in Settings. **Share as image** (top of Stats) draws a 1080×1350 PNG on a canvas in the current theme: logo, name and date, six tiles, top 5 genres, top 5 covers with time spent; preview with Share… (Web Share with files, where supported) and Save image. Nothing is uploaded. Numbers come from `statsData()`, shared with `drawStats()`.
- **Stats sections:** Overview / Diary / Badges chips at the top of Stats (remembered in `kuro.statsTab`).
  - **Diary:** tiles (this week from Monday, this month, current streak, longest streak), an 18-week calendar heatmap (accent shades), and a day-by-day timeline (one row per show per day, "Eps 3–5, 7", time, count; 30 days at a time with "Show older days"). Built from the Phase 1 watch history.
  - **Badges:** 19 badges (episodes 100/500/1000/5000, 24 h and 168 h watched, completed 10/50/100, a 100+ episode show, 3/7/30-day streaks, 10 episodes in a day, night owl, 10 genres, 25 ratings, 5 airing shows at once). Progress bars on locked ones, unlock date on unlocked ones (`kuro.badges.<id|guest>`). Checked 1.2 s after each list save; a new unlock shows a toast. The first check only records what is already unlocked.
  - **Wrapped:** banner on Overview opens a 9-part story in the dialog (tap right/left or ‹ ›, arrow keys): intro with year chips (every year with activity, plus All time), episodes and hours (count-up), shows and finished covers, top genres, most watched, highest rated, habits (biggest binge, longest streak, active days, favourite weekday; only with diary data), an "anime personality" from the top genre, and a share slide that draws a 1080×1920 PNG (Share… / Save image). When the day-by-day history does not cover the whole year, the numbers come from the shows updated that year, and the slide says so.
- **Dates and rewatches:** the detail sheet (any status except Plan to watch) has Started and Finished date fields and a Rewatched −/+ counter. Filled in automatically like AniList: Started on the first episode marked watched, Finished on completing; completing a Rewatching show adds a rewatch and moves Finished to today. Synced both ways with AniList (`repeat`, `startedAt`, `completedAt`; partial AniList dates such as "2019-04" are kept and shown as a note). My List can sort by date started, date finished and times rewatched; Wrapped also counts a show in the year it was started or finished.
- **+1 from the alert:** episode alerts have a "+1 Mark Ep N watched" action (Chrome/Edge/Android; Safari/iPhone show no action buttons). The service worker queues it in Cache Storage `kuro-data` → `./__kuro-queue` (it cannot reach localStorage); the page applies the queue when open (message) or next opened/focused (`drainQueue()`), writes it to the diary at the time it was pressed, and syncs. With Kuro closed, a quiet "Marked watched" notification confirms it.
- **Offline:** the service worker keeps covers (`kuro-img`, cache first, up to 600, fetched with CORS) and public AniList answers (`kuro-api`, network first, keyed by a SHA-256 of the query; up to 250; also used when AniList answers 429/5xx). Requests with a sign-in token are never stored. An offline banner shows while offline; the sync line says "Offline · N changes waiting"; sync waits and runs on reconnect; Discover shows a clear message for pages not saved yet. Settings → Offline shows what is saved and has "Save all my covers for offline".
- **Random pick:** glowing button at the top of Discover. Opens a dialog that does not spin by itself: covers from the pick pool sit under a glowing pointer, a "?" placeholder card holds the result space, and a big **Spin** button waits. Spin (about 7.6 s): a pull-back wind-up, a long run whose blur follows the speed, the pointer ticks for every cover that passes (short vibration on phones near the end), it creeps past the winner and settles back; on landing the other covers dim, the winner pops out with a shine, the frame flashes and confetti bursts. The result card (reason, title, meta, genres, + Plan to watch, Details) then fills the same fixed-height space, so nothing shifts. "Spin again" starts from the landed view. Switch "Surprise me: go outside my usual picks" (saved as `settings.rpExplore`) reloads the pool without spinning. Taste mode: AniList recommendations of your 10 best-rated started shows (not dropped), weighted by recommendation rating × your score; with an empty list it falls back to popular highly rated shows. Explore mode: score > 72, popularity > 15k, TV/Movie/ONA, none of your 3 most-watched genres, random page 1-4. Pools cached 15 min; shows already picked this session are skipped. Reduced motion: no spin, lands straight away.
- **New-episode alerts:** Settings → Alerts switch (asks the browser for permission; `settings.notify`, per browser) and a test button. For Watching/Rewatching shows with a known next air time: a timer per show while Kuro is open (also in a background tab) fires a notification "New episode: <title>" via the service worker (`scheduleAlerts()` runs from `renderNext()`). The schedule (id, title, episode, air time; nothing else) is mirrored into Cache Storage `kuro-data` → `./__kuro-alerts` with a `notified` map so no episode alerts twice. Where Periodic Background Sync exists (Chrome/Edge, installed app, browser decides when) the worker checks that schedule while Kuro is closed and asks AniList's public API for the next episode. Tapping an alert focuses Kuro and opens the show (`postMessage {open:id}` or `#open=<id>`).
- **Rating and notes (optional):** in the detail sheet of list entries: 1-10 buttons (tap again to clear) and a notes box (autosaves). Synced to AniList (`scoreRaw`, `notes`). My List cards show ♥ your rating instead of the average; sort "My rating". Can be hidden in Settings → Lists.
- **Profile page** (its own page since v39; the avatar button in the top bar opens it): profile card (AniList banner if any, picture, name), then Look and AniList accounts (switch / sync now / sign out / add account, Client ID help). Look changes save and apply at once (Reset look asks first). Look: picture = AniList picture / uploaded photo (cropped to a square, shrunk to ~5 KB JPEG, stays in this browser) / coloured initial; 8 colours (ring and initial); display name. Works for the guest too. `look()` gives name and avatar HTML; `applyPrefs()` sets `--me`, `data-theme` and the `theme-color` meta.
- **App themes (per profile):** Midnight (default), Sakura, Ocean, Forest, Sunset, AMOLED black, Light, and Auto (Light when the device is in light mode, Midnight in dark mode; follows changes live and re-checks when the app returns to the foreground). Picked in Edit profile with live preview (Cancel/close reverts). Each theme is a `[data-theme=…]` block overriding the `:root` variables (`--bg … --accent2`, plus `--glass`, `--glass2`, `--glow1/2`, `--thumb`, `--hover`, `--desc`, `--on-accent` = text colour on accent fills). `THEMES` in the script lists id, name and swatch colours. A tiny inline script in `<head>` applies the saved theme before first paint. Rule for new CSS: no hard-coded colours except on top of cover art/banners (which stay dark with white text in every theme); use `var(--on-accent)` for text on accent backgrounds.
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
- **Phone access:** same Wi-Fi via `http://<laptop-ip>:5188` (works, but not installable/offline because it is HTTP), or an HTTPS tunnel (`cloudflared tunnel --url http://localhost:5188`). Better: use the hosted copy on GitHub Pages (done, see Current status).
- **AniList sign-in on the hosted app needs no setup:** it has a built-in Client ID (`BUILTIN_CLIENT_ID` = 58014, owner's AniList client, Redirect URL `https://michaelgon98.github.io/kuro-watchlist/`). The built-in ID is only used at that exact address (`IS_HOSTED`), since AniList always redirects to the registered URL. A Client ID is public (implicit grant, no secret), so it is safe in the repo.
- **AniList sync setup for any other address (localhost, LAN, a fork):** create a client at anilist.co/settings/developer, set its Redirect URL to the exact hosted address of the app (not `localhost` for phone use), paste the Client ID into Kuro → Settings → Profile → AniList app setup, then Sign in with AniList. Use the same address and Client ID on every browser. To add a second account in one browser, log out on anilist.co first (AniList otherwise signs straight back in as the current account). Local storage is per origin, so each address keeps its own list until synced.

## 7. Current status

- App is functional locally. Verified in a browser pane against live AniList data: Discover, filters, add to list, detail sheet, Where to watch, episode list/tap, Next up, scrollbars, punctuation-tolerant search.
- Profiles (2026-11-25) verified in the browser pane: migration from the old layout, profile switching, guest list, settings UI on desktop and phone width, sync logic against a mocked AniList (queued delete, remote-removed entry dropped, local add pushed, remote add pulled), expired-token handling against the real AniList (it answers a bad token with HTTP 400 "Invalid token").
- Real AniList sign-in and sync on the hosted app in two browsers: confirmed working by the owner (2026-11-25).
- **Not verified:** the guest-list merge prompt on first sign-in (not specifically reported on); the in-app trailer player; the phone layout after the later features; Firefox scrollbar look; the stats image Share… button on a real phone (the test pane only offers Save image).
- **Hosted** on GitHub Pages: https://michaelgon98.github.io/kuro-watchlist/ (public repo https://github.com/MichaelGon98/kuro-watchlist, branch `main`, root folder). Verified loading there with no console errors and the service worker registered.
- The project folder is a git repo; commits use the GitHub noreply address (set in the repo's local git config). **To deploy: commit and `git push`**; Pages rebuilds in about a minute.

## 8. Known issues / caveats

- A minimum-score filter hides brand-new shows that have no score yet.
- AniList search is strict on spelling: e.g. "Worlds" (no apostrophe, no "s" strip match) may fail; the variant retry handles the common cases (`World's`, `Worlds`).
- Where-to-watch links come from AniList and are not region-specific; some titles have none.
- Two harmless console messages ("fetching the script") appeared once after clearing the service worker — likely service-worker update noise, unconfirmed.
- Removal propagates to AniList only if the entry has a known `entryId` (an entry not yet synced has none, but then it is not on AniList either).
- Offline mode was tested for caching (covers and AniList answers stored, list covers all saved) and the offline UI (simulated offline event), but not with a real disconnected device: the test browser cannot cut its network.
- The alert "+1" action could not be pressed in the test browser (notifications are blocked there); the queue it writes was tested directly.
- Settings (Watch link, Client ID) and the profile look (photo, display name, colour) are per browser and do not sync: AniList has no place to store them. The owner has to re-enter their Watch link on the hosted site (it no longer comes as a default).
- Kuro-only data beyond status and episode progress (e.g. the `added` date) is not stored on AniList, so a new browser shows AniList's update time as the added date.
- Profiles only reach other browsers once the app is hosted at one fixed address (localStorage and the AniList Redirect URL are per address).
- Accessibility was checked with the keyboard and the accessibility tree only, not with a real screen reader (NVDA/Narrator/TalkBack/VoiceOver). Covers are decorative (`alt=""`) on purpose: the title is always next to them.
- Episode alerts while Kuro is fully closed depend on Periodic Background Sync: only Chrome/Edge with the app installed, at the browser's discretion (often a few times a day, so an alert can come hours late). Brave, Firefox and Safari/iPhone only alert while Kuro is open or in a background tab.

## 9. Roadmap and next ideas

The owner approved all of these on 2026-11-25, to be built in phases (each phase: build, test locally, log, commit, push):

- **Phase 1, foundations and quick wins: done (2026-11-25).** Watch history recording, "last synced" line with Sync now, bulk edit in My List, custom accent colour, calendar export (.ics).
- **Phase 2, discovery: done (2026-11-25).** "Because you watched X" recommendations row on Discover (reuse the Random pick taste engine); seasonal chart (this and next season, one-tap add, sort by hype/popularity); studio pages (tap a studio in the detail sheet: their shows, which ones you have seen); sequel/prequel alerts (AniList `relations` of completed shows: announced / airing soon); paused/dropped nudges ("paused 3 months ago, 4 episodes left").
- **Phase 3, your history: done (2026-11-25).** episode diary (timeline per day, "this week you watched 14 episodes"); watch streaks and badges; year-in-review "Wrapped" story with a shareable image (reuse `statsImage()` drawing helpers).
- **Phase 4, deeper sync and platform: done (2026-11-25).** rewatch count and start/finish dates synced with AniList (`repeat`, `startedAt`, `completedAt` on `SaveMediaListEntry`); +1 action button on the episode alert (service worker `notificationclick` action, then sync); offline mode (cache covers and AniList responses, queue changes).

Second roadmap, approved by the owner on 2026-11-26 ("please build them"), phased the same way:
- **Phase 5, look: done (2026-11-26).** Hero spotlight on Discover with page tint; cover-coloured detail sheet; animated cards (tilt, shine, fade-in). Also fixed the Top 10 numbers on Android.
- **Phase 6, delight: done (2026-11-26).** Confetti and a "Completed!" stamp when you finish a show, a pop on +1; seasonal effects (sakura petals in spring, snow in winter; switch in Settings); badge polish (foil sheen on unlocked badges, reveal animation for new ones).
- **Phase 7, live info: done (2026-11-26).** Airing countdown ticker on cards of shows you're watching ("Ep 8 in 2d 4h 12m"); Character of the day on Discover (a favourite character from your list, with art).

Third roadmap, approved by the owner on 2026-11-27 ("these all sound cool, please work on them all in phases"):
- **Phase 8, look and feel: done (2026-11-27).** Random pick as a top-bar spinner button; bottom-bar highlight and bounce; pull to refresh with the panda; skeleton loading; My List tint; themes with matching effects.
- **Phase 9, watching tools: done (2026-11-27).** Episode reactions (emoji after +1, saved to the diary, shown in Wrapped); franchise view (every season / movie / OVA in watch order in the detail sheet, with ticks); "What to watch tonight" (picks from Currently watching and Plan to watch for 30 min / 1 h / 2 h).
- **Phase 10, stats and sharing: done (2026-11-27).** "Your taste" radar chart (genres and studios); a "Today" tile in Stats with today's episodes; watch party countdown link to share.

Other ideas (not scheduled):
- Jellyfin/Plex "Play from my library" button for anime the owner owns.
- An Auto theme variant that pairs Light with a chosen dark theme instead of always Midnight.
- True push alerts while the browser is fully closed (needs a small push server).
- Settings synced per profile (needs somewhere to store them; AniList has no slot for app settings).

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

### 2026-11-25 — App themes
- `index.html` CSS: replaced the remaining hard-coded dark colours (header/nav glass, background glows, scrollbar, card hover, focus ring, synopsis text) with variables; text over cover art, badges, the + button and the close button pinned to white on dark so they work in every theme; score badge colours fixed. Added 7 themes as `[data-theme]` variable sets incl. a Light theme (`color-scheme:light`).
- `index.html` JS: `THEMES`, `applyPrefs(t)` (preview), theme picker tiles in Edit profile, `closeModal()` re-applies the saved look so an unsaved preview is dropped, `<head>` script applies the theme before first paint, `theme-color` meta follows the theme.
- Accessibility: an automated contrast scan of Discover, This week, Settings, Edit profile and the detail sheet in all 7 themes found white text on bright accents (Forest/Ocean/Sakura/Sunset/AMOLED, ratio 1.7-2.7) and a white "+" on light grey in Light; fixed with a per-theme `--on-accent` text colour (now 5-10:1) and a themed "+" button. Rescan: no issues.
- Bug caught before release: a `//` comment added inside the one-line `closeModal()` commented out the rest of the function.
- `sw.js`: cache bumped to `kuro-v6`.

### 2026-11-25 — AniList sign-in verified on the live site
- `DEVELOPMENT_LOG.md` only: the owner confirmed that signing in with AniList and syncing between two browsers works on the hosted app. Moved it from "Not verified" to verified in Current status and removed it from Next ideas. No code change.

### 2026-11-25 — Stats page
- `index.html`: new Stats view (`#v-stats`, `drawStats()`, `fmtTime()`, `watchedEps()`, `FORMATS`) with a Stats tab in the header and the phone nav. Tiles for anime on list, episodes watched, time watched, completed and average rating; bar lists for status, top genres and formats; "Most time spent" top 5; ratings histogram. Uses theme variables only (bars in `--accent`), so it works in all 7 themes.
- `index.html`: `redrawList()` redraws My List or Stats after sync / airing refresh; `refreshCards()` uses it. Typing in the header search from Stats goes to Discover, as from This week.
- `.claude/launch.json`: added `kuro-alt` (port 5189). The `kuro` config hard-codes 5188 in the Python command, so when another session holds 5188 the preview's automatic port switch starts nothing; both configs now have `autoPort:false`.
- Tested on localhost: totals checked by hand against seeded data (56 episodes, 1 show without episode length noted), status row opens My List on that status, top-show row opens the detail sheet, rating parts hidden with ratings off, empty-list message, phone width with no sideways scroll, Light theme. No console errors.
- `sw.js`: cache bumped to `kuro-v7`.

### 2026-11-25 — PNG app icons
- New files `icon-192.png`, `icon-512.png` (same look as `icon.svg`), `icon-maskable-512.png` (full-bleed gradient, play triangle 1.5x, within the 80% safe circle) and `apple-touch-icon.png` (180, full-bleed, no transparency). Drawn with Pillow (no cairo on this machine) from the SVG's exact shapes and colours, 4x supersampled then downscaled; script kept out of the repo (one-off).
- `manifest.json`: icons now list the PNGs (192/512 `any`, 512 `maskable`) plus the SVG as `any`; the old SVG-only `"any maskable"` entry is gone.
- `index.html` `<head>`: PNG favicon fallback (192) next to the SVG one; `apple-touch-icon` now points to the PNG (iOS ignores SVG there).
- `sw.js`: the PNGs added to the cached app shell; cache bumped to `kuro-v8`.
- Tested on localhost: every manifest icon loads at its declared size, Apple icon 180x180, all four PNGs in the `kuro-v8` cache, no console errors. Not tested: an actual install on Android/iOS (needs the owner's phone).

### 2026-11-25 — Panda logo replaces the play-button icon
- The owner supplied a panda logo (sunglasses, moon, blue ring) to use as the app logo. Kept as `logo-source.webp`.
- Remade `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (full image), `icon-maskable-512.png` (emblem at 80% on `#000107` so the ring survives Android's mask) and new `favicon-32.png` from it with Pillow.
- Removed `icon.svg` (the old gradient play button) and every reference to it.
- `index.html`: header logo is now the panda (`<img src="icon-192.png">`, 32px round) instead of the gradient square; favicons are `favicon-32.png` + `icon-192.png`.
- `manifest.json`: PNG icons only; `background_color` `#000107` so the Android splash screen matches the logo.
- `sw.js`: cache list updated (favicon added, SVG removed); cache bumped to `kuro-v9`. The icons are bigger now (detailed artwork, about 700 KB in total in the offline cache, versus about 30 KB before).
- Tested on localhost: all manifest icons, Apple icon and favicon load at their declared sizes, header logo renders, all files in the `kuro-v9` cache, no console errors (apart from the 404 of a deliberate test request for the deleted `icon.svg`).

### 2026-11-25 — Accessibility pass
- **Keyboard:** every card, Next up / This week row, Stats status and top-show row, and episode row is now reachable with Tab and works with Enter/Space (`role="button" tabindex="0"` plus one global keydown handler for `[role=button]:not(button)`). On anime cards the title block is the focus target and comes before the +/+1 button in the Tab order (no nested buttons).
- **Dialogs** (detail sheet, Settings, Edit profile): `#modal` is `role="dialog" aria-modal="true"`, named by its `<h2>` (the detail title is now an `<h2 id="mtitle">`). On open, focus moves into the dialog and header/main/nav become `inert`; on close, focus returns to what opened it, found again by selector if the page behind was redrawn (`openerSel()`). Redraws of an open dialog (status, rating, episode tap, theme/colour tiles) keep focus on the same control (`dlgFocusKey()`, `dlgRefocus()`, capture-phase click listener). Escape only acts when a dialog is open.
- **Labels and states:** labels for the header search, list filter, genre and sort selects, all Discover filter fields (`for=`), Watch link, display name, Client ID, notes; Close buttons and the episode stepper have names. `aria-pressed` on genre chips, This week mode, list status chips, status buttons, rating buttons and episodes (watched); `aria-current="page"` on the active tab/nav button. The toast is a polite live region (`role="status"`), so "Added to…", "Synced ✓" and Undo are announced.
- **Images:** covers and thumbnails are `<img loading="lazy" decoding="async" alt="">` via `pic()` instead of CSS backgrounds, so only covers near the screen download. The detail-sheet cover has `role="img"` with "Cover of …".
- **CSS:** visible `:focus-visible` ring in the accent colour everywhere; `prefers-reduced-motion` turns off animations, transitions and the card lift.
- Tested on localhost with real key presses: Enter on a card opens the sheet with focus inside and the page inert; Tab reaches Close with a visible ring; Space on "Watching" keeps focus there (aria-pressed true); Enter on episode 1 marks it watched and keeps focus on it; Escape closes and returns focus to the rebuilt card; Settings → Edit profile → theme/colour tiles keep focus; closing returns focus to the Settings button; all 24 Discover covers are lazy `<img>`s and load. No console errors.
- `sw.js`: cache bumped to `kuro-v10`.

### 2026-11-25 — Auto theme
- `index.html`: new `auto` theme in `THEMES` (half light / half dark tile, last in the picker) with a hint under the picker. `applyPrefs()` turns `auto` into `light` or `dark` (Midnight) using `matchMedia('(prefers-color-scheme: light)')`; the `<head>` script does the same before first paint, so there is no flash of the wrong theme. `autoRecheck()` runs on the media query's `change` event and when the page becomes visible again, and only acts when the saved theme (or the one being previewed) is `auto`. The phone status-bar colour (`theme-color`) follows.
- Tested on localhost with emulated light/dark: picking Auto previews Light in light mode; saved as `theme:"auto"`; reload in dark mode starts in Midnight; a `change` event switches to Light and the status-bar colour to `#f4f4f9`; a fixed theme (Ocean) ignores the device; closing the editor without saving reverts an Auto preview. The browser pane's colour-scheme emulation did not fire `change` by itself, so the live switch was checked by firing the event by hand.
- `sw.js`: cache bumped to `kuro-v11`.

### 2026-11-25 — New-episode alerts and Random pick
- `index.html`: **alerts** (`alertsOn()`, `alertHint()`, `alertStore()`, `scheduleAlerts()`/`scheduleAlertsNow()`, `fireAlert()`, `periodicAlerts()`, `wireAlertsUI()`, `openFromHash()`, service-worker `message` listener). Settings gets an Alerts section with a switch, a hint that explains blocked permission / browser limits, and "Send a test alert". `renderNext()` now calls `scheduleAlerts()`, so timers follow list and airing changes.
- `index.html`: **Random pick** (`RP_F`, `RP_REC`, `RP_EXP`, `gqlPublic()`, `topGenres()`, `rpBuild()`, `rpChoose()`, `openRandom()`, `rpSpin()`, `rpShow()`), the `.spin-cta` button on Discover (shine animation, dice icon) and reel / switch / result-card / confetti CSS. Uses the shared dialog, so the accessibility focus handling applies; the reel itself is `aria-hidden` and the result is in a polite live region.
- `sw.js`: activate now deletes only old `kuro-v*` caches (it used to delete every other cache, which would have wiped `kuro-data`); added `notificationclick` (focus Kuro and open the show, or open `./#open=<id>`) and `periodicsync` → `checkEpisodes()` (alerts aired-but-not-alerted episodes from the saved schedule, then refreshes next-episode times from AniList, drops finished shows). Cache bumped to `kuro-v12`.
- Tested on localhost. Random pick: taste mode gave 32 picks from real AniList recommendations, none on the list, reason shown; explore mode gave 40 picks, none in the top 3 genres; Add puts the show in Plan to watch; Details opens it; phone width fits (no sideways scroll). Alerts (with notification permission faked, because the test browser has notifications blocked and permission prompts are left to the owner): an episode that airs sends exactly one notification and a repeat is suppressed; the schedule is mirrored to `kuro-data`; turning off clears it; `#open=<id>` opens the show; with permission really blocked, Settings shows how to unblock and the switch stays off. The worker's `checkEpisodes()` was run in the page with stand-ins for `fetch` and `registration`: it alerted only the aired, not-yet-alerted show, moved it to its next episode and dropped a finished show.
- Not tested: a real notification on the owner's devices, and Periodic Background Sync firing for real (only the browser can trigger it).

### 2026-11-25 — Random pick: no auto-spin, fixed layout, longer spin
- Owner feedback: the dialog grew when the result appeared, it spun straight away, and the spin should be longer and more epic.
- `index.html`: `openRandom()` no longer spins; `rpPrepare()` loads the pool and shows 9 covers centred under the pointer (gentle bob), with a "?" placeholder card and a **Spin** button where "Spin again" was. The switch reloads the pool instead of spinning. `.rp-out` has a fixed height (182 px, 206 px on phones; genre chips hidden on phones, title clamped to 2 lines) so the dialog keeps one size; checked 598 px before/during/after on desktop and 638 px on a phone.
- `index.html`: `rpSpin()` rebuilt with the Web Animations API: wind-up, 64-cover run, slow crawl, overshoot and settle (7.6 s); a per-frame loop sets blur from speed and ticks the pointer per cover; the frame glows and pulses while spinning. `rpLand()`: dim others, winner scale + glow + shine sweep, flash, 44-piece confetti, vibration. The next spin starts from the landed covers (`rpIdle`), so nothing jumps. The button reads "Spinning…" while it runs.
- Tested on localhost (desktop and phone width): no spin on open, height constant, spin about 7.6 s with blur and the frame glow, winner exactly under the pointer, "Spin again" starts on the same cover that was centred, result card fits its space.
- `sw.js`: cache bumped to `kuro-v13`.

### 2026-11-25 — My List sorting and filtering, compact view, shareable stats image
- Owner asked for better My List sorting and filtering, a compact list view and a shareable stats image.
- `index.html` (My List): new **All** status tab; format and airing-state filters (incl. "New episodes to watch" = Watching/Rewatching/Paused with an aired unwatched episode); sorts added: recently updated, popularity, progress, episodes left, next episode airs, length (year now includes season); reverse-order button; missing values always sort last, ties by title. Summary line "N of M shown · Clear filters" and a filtered empty state. All choices saved in `kuro.listUi` (`lui`). Rated cards show the ★ AniList score while sorting by it so the order makes sense.
- `index.html` (compact view): Grid / Compact switch; `rowHTML()` builds `.lrow` rows (same `data-open` / `role=button` pattern as Next up, +1 via `data-plus`). Phones: the duplicate filter box is hidden (the header search already filters My List), titles get 2 lines, no empty +1 slot.
- `index.html` (stats image): stats maths moved into `statsData()`; `statsImage()` draws the canvas with theme colours from CSS variables; `openShare()` shows the preview and Share… / Save image. Covers load with `crossOrigin` from a distinct URL (`?kuro=1`) because the copy already cached by the page has no CORS headers and would taint the canvas (AniList's CDN does send CORS headers).
- Tested on localhost with a seeded list from live AniList data: every sort order, reverse, filters and counts, Clear filters (also clears the header search), layout and filters surviving a reload, +1 from a row, Enter opens a row and focus returns; desktop and phone width with no sideways scroll; the image in dark and light themes, all covers loading (200) with no canvas errors.
- `sw.js`: cache bumped to `kuro-v14`.

### 2026-11-25 — Phased roadmap and Phase 1 (history, sync line, bulk edit, accent colour, calendar)
- Owner approved 15 ideas to be built in phases; the plan is in section 9 (Roadmap).
- `index.html` (watch history): new per-profile `kuro.hist.<id|guest>` log of `[time, mediaId, firstEp, lastEp]` written by `logWatch()` from `bump()` (+1 and the stepper) and `epTap()`; `unlogWatch()` drops episodes when progress goes down or +1 is undone. Status changes are not logged (marking a show Completed is not watching it). Last 5000 entries. Included in Export, merged (deduplicated) on Import. Nothing shows it yet: it is the data for the Phase 3 diary, streaks and Wrapped.
- `index.html` (sync line): `renderSyncBar()` above the My List tabs; refreshed on render, on every list save, when a sync starts and ends, and every 30 s while My List is open. Sync now calls `sync(true)`; sign-in links open Settings.
- `index.html` (bulk edit): `#lsel` toggles select mode (`selMode`, `sel`); a capture-phase click listener on `#lgrid` turns taps/Enter into select toggles; `markSel()` sets `.sel` classes and `aria-pressed`; `#selbar` floats above the phone nav, and the toast moves above it while selecting. The selection keeps only shows that are still visible after filtering. Leaving My List or pressing Escape ends it.
- `index.html` (accent colour): Edit profile → Accent colour: Theme default, 12 presets, any colour (`<input type=color>`), and up to 6 colours from your shows' covers (AniList `coverImage.color`). Saved per profile as `prefs.accent`. `setAccent()` sets `--accent`, `--accent2` (hue +40°) and `--on-accent`, stepping the shade darker on Light (about 3:1 on white) or lighter on dark themes (about 4.5:1) only when needed. Live preview with Cancel undo; the `<head>` script applies the raw colour before first paint.
- `index.html` (calendar): `exportIcs()` behind **Add to calendar** on This week.
- Tested on localhost (own server on 5189; the other chats' servers had stopped): history entries for +1, undo, -1; sync line in all four states (signed-in states with a fake profile, no AniList calls); select, move with Undo, Select all, Escape, Remove; accent presets on dark and Light (contrast computed for every preset), Cancel, Save and reload; the .ics content (31 events from a seeded list of currently airing shows); desktop and phone width with no sideways scroll.
- `sw.js`: cache bumped to `kuro-v15`.

### 2026-11-25 — Phase 2: recommendations, season chart, studio pages, sequel alerts, pick-up nudges
- `index.html` (HTML): Discover gets `#seasonLinks`, `#nudges`, `#rels`, `#recs`; new `#v-season` section. `setView()` knows 'season' (Discover stays highlighted) and calls `loadSeason()` / `loadExtras()`; searching from the season chart returns to Discover. `refreshCards()` also redraws the Discover extras, the season chart and any cards inside the dialog (studio page).
- `index.html` (JS, appended after Random pick so it can reuse `RP_REC`, `rpOk`, `MEDIA_FIELDS`): `pubQ()` public AniList helper; season chart (`seasonNow`, `loadSeason`, `drawSeason`); nudges (`nudgeItems`, `drawNudges`, Resume/hide with Undo); recommendations (`loadRecs`, `drawRecs`); sequels (`REL_Q`, `loadRels`, `relLabel`, `drawRels`, new-announcement toast/notification); studio pages (`STUDIO_Q`, `openStudio`, `stLoad`, `drawStudio`). AniList returns at most 25 media per page on `Studio.media`, hence the 4-page batches.
- `index.html` (detail sheet): Studio stat is a `.statlink` button → `openStudio()`.
- `index.html` (owner report): on phones the "›" of "Spin ›" in the Random pick banner wrapped to its own line; `.go` is now `nowrap` and the middle text takes the remaining width.
- Tested on localhost with a seeded list of 24 popular shows: nudges for paused / dropped / stale Watching, Resume with Undo, hide for 30 days; 16 sequel/prequel cards; a simulated new sequel gave the toast and New badge; two "Because you liked" rows; season chart Fall 2026 (118, grouped) and Winter 2027 (86), hide-on-list, back; Studio Pierrot page (100 then 200 of 500, filters, add updates the card, back to the show); phone width with no sideways scroll, Spin › on one line.
- `sw.js`: cache bumped to `kuro-v16`.

### 2026-11-25 — Phase 3: episode diary, streaks and badges, Wrapped
- `index.html` (HTML/CSS): `#stTabs` above `#stats`; styles for the heatmap, diary rows, badge cards and the Wrapped story (`.modal.wrm`, `.wr*`). `closeModal()` removes `wrm`.
- `index.html` (JS): the old `drawStats()` is now `drawOverview()` (plus the Wrapped banner); the new `drawStats()` switches sections. Helpers `dayStart`, `shiftDay`, `dayMap`, `streaks` (the current streak counts back from yesterday when nothing is marked yet today). `drawDiary`, `epsText`; `BADGES`, `badgeList`, `drawBadges`, `checkBadges` (called by `badgeSoon()` from `saveList()`, deferred). `PERSONA`, `wrapYears`, `wrapData`, `wrapSlides`, `openWrapped`, `wrDraw`, `wrShare`, `wrappedImage` (canvas 1080×1920 in the current theme; the top cover loads via the CORS-safe `coverImg`).
- Tested on localhost with 20 seeded shows and a seeded 11-entry history: tiles (6 this week, 23 this month, 5-day streak), heatmap, diary grouping and ranges; 11 badges recorded silently on first check, then "Badge unlocked: 📡 Simulcast squad"; Wrapped for 2026 (list-based, with the note) and All time, all 9 slides, counters end on the right numbers, arrow keys, the PNG (1080×1920); phone width and a short window (the share preview is capped at 40vh and the slide scrolls instead of covering the buttons). No console errors.
- `sw.js`: cache bumped to `kuro-v17`.

### 2026-11-25 — Phase 4: dates and rewatches (synced), +1 from alerts, offline mode
- `index.html` (dates): `isoDay`, `fdStr`, `strFd`, `autoDates()` called from `bump()`, `epTap()`, `addToList()`, bulk Move to, and the alert queue; undo of +1 and of bulk moves restores dates and rewatches too. Detail sheet "Your dates" (date inputs, rewatch stepper). `COLL` pulls `repeat startedAt completedAt`; `SAVE` sends them only when Kuro knows them (undefined = keep AniList's value), like ratings and notes. Checked against AniList without a token: the mutation and query validate (AniList answers 401 / user lookup, not a schema error). New My List sorts; Wrapped year matching uses the dates.
- `index.html` (bug fix): `addToList()` rebuilt the entry from the Discover cache, which dropped your rating, notes and other list fields when you changed a show's status in its detail sheet; it now keeps the list entry and only refreshes the media fields.
- `index.html` (alerts): notifications carry `{id, ep, title}` and a "+1" action; `drainQueue()` applies queued +1s (only when the episode is ahead of your progress), on load, on focus and on a message from the worker.
- `index.html` (offline): `#offbar`, `netState()`, online/offline listeners (reconnect syncs, refreshes airing, reloads an empty Discover / This week), `sync()` skips while offline, sync line offline state, friendlier load error, Settings → Offline (`wireOffline()`).
- `sw.js`: cover cache (`img()`, `cache:'reload'` because the browser's HTTP cache holds non-CORS copies from plain `<img>` loads, which made CORS fetches fail), AniList answer cache (`api()`, `hashKey()`), `trim()`, +1 queue in `notificationclick`, actions on background alerts. Cache bumped to `kuro-v18`; `kuro-img` / `kuro-api` survive updates.
- Tested on localhost with the worker in control: covers and AniList answers stored, every list cover saved by the Settings button, no broken images, stats image still draws through the worker; auto dates (+1 from Plan to watch, completing a rewatch → 1×, status Completed keeps rating and notes), date inputs, partial-date note, rewatch stepper; queue applied (progress 1 → 2, stale entry ignored, queue cleared, toast); offline banner and back online (simulated events). No console errors.

### 2026-11-25 — One recommendation row, Top 10 on Discover
- `index.html`: the two "Because you liked X" rows are now one "Picked for you" row (owner found the recommendation rows too many). `loadRecs()` interleaves the recommendations of your favourite shows, skips ones on your list and dupes, up to 16; `drawRecs()` puts "Because you liked X" under each card (`.relc` / `.relwhy`, as in From your shows).
- `index.html`: new **Top 10** section under it (`#top10`, `T10_Q`, `loadTop10()`, `drawTop10()`, CSS `.t10*`), with tabs Trending now / All-time best / Most popular. Hooked into `loadExtras()` / `drawExtras()` so ✓ marks update.
- `sw.js`: cache bumped to `kuro-v19`.
- `DEVELOPMENT_LOG.md`: Discover extras updated; stale "hosting not done yet" line in Running and testing fixed.
- Tested on localhost with a seeded 4-show list: one rec row of 16 cards with captions, Top 10 loads all three tabs, tab remembered after reload, desktop and 375 px phone width (no sideways scroll). No console errors.

### 2026-11-26 — Phase 5: hero spotlight, cover-coloured sheet, card motion; Top 10 numbers fix
- `index.html` (fix): the Top 10 rank numbers looked broken on the owner's phone: `-webkit-text-stroke` on Android's variable Roboto draws the glyphs' inner overlapping contours. The outline now comes from eight `text-shadow`s around a tinted fill (`--rkc`), which only follows the outer shape.
- `index.html` (hero): `#hero` + `.htint` at the top of Discover, `drawHero()`, `heroGo()`, `heroTimer()`, swipe/dots/hover-pause wiring; `fetchTop(sort)` now does the Top 10 fetch for both (one request per list per hour, in-flight promise shared). `#v-discover` became a stacking context (`isolation:isolate`) so the tint sits behind its content.
- `index.html` (sheet): `openModal()` sets `--mtint` from `m.color`; CSS tints the sheet background, banner fade, border, glow and cover ring; lighter mix on the Light theme.
- `index.html` (cards): fade-in, tilt and shine (see Features). Tilt skips the lift inside horizontal rows and the modal.
- `sw.js`: cache bumped to `kuro-v20`.
- Tested on localhost with a seeded list: hero renders 6 slides, rotates, dots switch slides (others `inert`), page tint follows the show; One Piece sheet tinted orange, Settings dialog not tinted; tilt transform on a synthetic mouse move; cards fade in when scrolled to; Top 10 numbers draw solid outlines; 375 px phone width without sideways scroll. No console errors. Not checked on a real Android phone (the test browser uses Windows fonts).

### 2026-11-26 — Phase 6: celebrations, seasonal effects, foil badges
- `index.html`: `celebrate(ids)` called from `bump()`, `epTap()`, `addToList()` and bulk Move to (only when a show newly becomes Completed); `fxShow()` / `fxNext()` queue for celebration cards, `confettiHTML()`, `fxBadge()` (replaces the unlock toast in `checkBadges()` when celebrations are on), `popAt()` on `[data-plus]` and the sheet's `+` stepper, `buzz()` (vibrate only after user activation; Chrome logged blocked calls otherwise).
- `index.html`: seasonal canvas `applySeason()`, `sfxNow()`, `seasonKind()`, `SFX_KINDS` (named to avoid the season chart's `SEASONS` / `seasonNow`); Settings → Effects (checkbox + select), saved in `kuro.settings`.
- `index.html`: badge foil CSS (`.bdg.on::before`), `.bdg.fresh` flip and "New" chip via `bNew` and `kuro.badgeSeen.*`.
- `sw.js`: cache bumped to `kuro-v21`.
- Tested on localhost with a seeded list: +1 on the last episode → Completed card with stamp and confetti, toast with Undo still there, +1 pop; Completed button path; celebrations off → no card; badge reveal card → tap opens Stats → Badges with the flipped "New" badge; foil animation running; Settings switches snow / off / auto (leaves now); sakura at 375 px phone width without sideways scroll. No console errors from the new build.

### 2026-11-26 — Phase 7: live airing countdown, Character of the day
- `index.html`: `cdLeft()`, `cdPill()` (added to `cardHTML()`'s `.cinfo`), a 1 s ticker for `[data-cd]`; Next up's "airs in 3h" became a live countdown. CSS `.cd` (`.soon`, `.out`), `.cdt`.
- `index.html`: `#cotd` on Discover, `CH_Q`, `cotdSeeds()`, `cleanDesc()`, `loadCotd(off)`, `drawCotd()`, hooked into `loadExtras()` / `drawExtras()`; CSS `.cotd`.
- `sw.js`: cache bumped to `kuro-v22`. Second roadmap (Phases 5–7) complete.
- Tested on localhost with three airing shows on Watching: pills on My List and Discover cards and in Next up tick every second, the last-hour style shows when a show is set to air in 10 minutes, formats checked (`38d 15h 41m`, `3h 02m 05s`, `10m 00s`, `out now`); Character of the day loaded (Yuno from Black Clover), "Another" switched to Luffy; 375 px phone width without sideways scroll. No new console errors.

### 2026-11-26 — One "Picked for you" row, "Currently watching", scroll jumps fixed
- `index.html`: removed the "From your shows" row (`#rels`); `drawRels()` now fills `relPicks` and calls `drawRecs()`, which puts up to 8 sequels/prequels (with their captions and "New" badge) before the recommendations in **Picked for you** (20 cards max, no duplicates). Sequel alerts, toasts and notifications are unchanged.
- `index.html`: "Next up" renamed **Currently watching** (heading only; code names unchanged).
- `index.html` (bug, reported on mobile): the detail sheet jumped back to the top after choosing a status (Plan to watch, Completed…) or using the episode +/−, because `openModal(id)` redrew it without `keep`. The status buttons and `step()` now pass `keep`, and `openModal()` restores `keepTop` right after drawing (not only after details load).
- `index.html` (bug, reported on mobile): horizontal rows snapped back to the start whenever they were redrawn (recommendations / sequels / Top 10 arriving, list changes, sync). `rowPos` remembers each row's sideways scroll (scroll listener) and a MutationObserver puts it back before paint; switching the Top 10 tab still starts at #1.
- `sw.js`: cache bumped to `kuro-v23`.
- Tested on localhost at 375 px: headings are Currently watching / Pick up again / Picked for you / Top 10; Picked for you has 20 cards, sequels first; row scrolled to 400 px and Top 10 to 300 px stay put after `refreshCards()` / `drawRels()` / `drawTop10()`; sheet scrolled to the status buttons stays at the same scroll after Plan to watch, Completed and episode +. No console errors.

### 2026-11-27 — Hero: titles no longer clipped, badge pinned to the top
- `index.html` (CSS only): the hero text block (`.hcon`) was anchored to the bottom, so a long title pushed it above the banner's top edge and the letters were cut off, and the badge moved up and down between slides. It now spans top to bottom as a flex column: the "#N trending" badge is always at the top, title/meta/synopsis follow, and the buttons sit at the bottom (`.hb{margin-top:auto}`). Title line height 1.1 → 1.22 with a little padding so heavy glyphs aren't clipped by the 2-line clamp.
- `sw.js`: cache bumped to `kuro-v24`.
- Tested on localhost: all 6 slides have the badge 25 px from the top and the buttons 25 px from the bottom on desktop (17 px on a 375 px phone); the long "The Laid-Off Cheat-Granting Mage…" title shows two full lines with "…", nothing cut; no sideways scroll.

### 2026-11-27 — Top 10: "This season" replaces "Trending now"
- `index.html`: the hero and Top 10 both showed AniList trending (owner found it redundant). Top 10's first tab is now **This season**: the best-rated shows of the current anime season (`seasonNow()`), at least 3,000 AniList users, `T10_SEASON_Q`, fetched through `fetchTop('SEASON')`. The hero still uses `fetchTop('TRENDING_DESC')`. A saved `kuro.t10Tab` of `TRENDING_DESC` falls back to This season (`T10_TABS`).
- `sw.js`: cache bumped to `kuro-v25`.
- Tested on localhost: with the old saved tab, This season is selected and lists Fall 2026's top 10 (Black Clover Season 2 ★ 8.8 first); hero still has 6 trending slides. No console errors.

### 2026-11-27 — Bigger header logo
- `index.html` (CSS): the header logo was hard to make out at 32 px. Now 46 px on desktop (40 px on phones) with a thin accent ring and soft shadow; the "Kuro" wordmark is 21 px (20 px on phones). Header grows from about 67 to 71 px.
- `sw.js`: cache bumped to `kuro-v26`.
- Tested on localhost at desktop and 375 px: logo 46 / 40 px, no sideways scroll.

### 2026-11-27 — Header logo: no outline, bigger on desktop
- `index.html` (CSS): removed the accent ring and shadow around the logo (owner didn't like the outline). The icon has its own thin blue rim at the edge; `clip-path:circle(45.5%)` trims it. Desktop: 66 px image (about 60 px visible), "Kuro" 24 px, header about 83 px tall (was 71). Phones: 44 px image (about 40 px visible), same header height as before.
- `sw.js`: cache bumped to `kuro-v27`.
- Tested on localhost at 1024 px and 375 px: no ring, no sideways scroll.

### 2026-11-27 — Header logo keeps its own rim
- `index.html` (CSS): the owner wants the icon's own thin blue rim kept; only the ring Kuro added should go. Removed the `clip-path` from the previous change. Logo is now a plain round 60 px image on desktop (header about 85 px) and 40 px on phones, with no added outline or shadow.
- `sw.js`: cache bumped to `kuro-v28`.
- Tested on localhost: no `clip-path`, no `box-shadow`, rim visible.

### 2026-11-27 — Phase 8: spinner button, nav polish, pull to refresh, skeletons, My List tint, theme effects
- `index.html`: Random pick banner removed from Discover; `#spinBtn` is now a `.spinbtn` icon button in the header (spinner-wheel SVG, `.whl` rotates). The `.spin-cta` CSS stays for the Wrapped button.
- `index.html`: `.npill` in `.tabs` and `nav.bottom`, `navPill()` called from `setView()` and on resize; `.bump` bounce on bottom-bar taps.
- `index.html`: pull to refresh (`.ptr`, touch listeners, `pullRefresh()`), only on coarse pointers; `overscroll-behavior-y: contain`.
- `index.html`: skeletons in `drawTop10()`, `drawHero()`, `drawRecs()` (while `recBusy`), `loadWeek()`, detail sheet.
- `index.html`: `listTint()` at the start of `renderList()`, `#v-list::before` glow.
- `index.html`: `THEME_FX`, `autoFx()`; `applyPrefs()` re-runs `applySeason()` (deferred: it runs before the effects code at boot).
- `sw.js`: cache bumped to `kuro-v29`.
- Tested on localhost: spinner button opens Random pick, banner gone; pill follows Discover → My List on desktop (left 189 px = tab) and phone; skeletons in hero and Top 10 while data is missing; My List tint from the last show (`#e49335`); simulated pull on a phone viewport → ready → spinning → "Updated"; Sakura theme → petals, Forest → fireflies, default → leaves; no sideways scroll at 375 px; no console errors. Not tried with a real finger on a phone yet.

### 2026-11-27 — Phase 9: reactions, franchise timeline, what to watch tonight; stat boxes fit
- `index.html` (fix): detail sheet stat boxes let long values (e.g. "NBCUniversal Entertainment Japan") run out of the box. `.stats` columns are now at least 132 px (`auto-fill`), `.stat` has more padding and `min-width:0`, values are `display:block` with `overflow-wrap:anywhere`, labels ellipsize.
- `index.html`: `askReaction()` (from `plusOne()` and `step()`), `setReaction()` writes `hist[i][4]`; diary rows show reactions (`.drx`); `wrapData()` counts `reacts` / `wow`, `wrapSlides()` adds the reactions slide; Settings checkbox `#reactOn`.
- `index.html`: `DETAIL_Q` now also asks for `relations`; `fillDetails()` calls `drawFranchise()` when there are PREQUEL / SEQUEL / PARENT / SIDE_STORY anime relations; `FR_Q`, `loadFranchise()` (breadth-first, one request per level), `#frz`, `[data-fr]` opens an entry.
- `index.html`: `tonightPicks()`, `openTonight()`, chip in `drawSeasonLinks()` (only when the list has shows).
- `sw.js`: cache bumped to `kuro-v30`.
- Tested on localhost with a seeded list: every stat box fits (forced the long studio name); Attack on Titan Season 2 sheet lists 11 franchise entries in release order (✓ on the completed first season, "Watching · ep 2" on S2); + stepper → reaction bar → 🔥 saved on the history entry, +1 from Currently watching → 🤯; diary row shows 🔥🤯; Wrapped reactions slide text correct; Tonight gives 5 picks for 30 min / 1 h, adds Spirited Away as movie night at 3 h; 375 px phone width without sideways scroll; no console errors.

### 2026-11-27 — Phase 10: Today tile, taste radar, watch party; episode list consistent
- `index.html` (episode list, owner feedback): watched episodes were dimmed (`.ep.done{opacity:.55}`) and shows without AniList stills fell back to a plain number grid, while others had thumbnail rows. Now `epsHTML()` always draws rows; each `.epth` has the banner/cover as a darkened background (`--eb`, `--ebp` shifts the slice per episode) with the number, and the still (if any) on top with `onerror="this.remove()"`. Watched rows: green border, ✓ badge on the thumbnail, full opacity.
- `index.html`: `todayTile()` at the top of Stats → Overview; `tasteHTML()` (radar SVG + studios) before Your ratings; `#stats` click handles `[data-tdo]` and `[data-studio]`.
- `index.html`: `openPartyMaker()`, `openParty()`, `checkPartyHash()` (on load and `hashchange`), `#partyBtn` in the sheet's More row.
- `sw.js`: cache bumped to `kuro-v31`. Third roadmap (Phases 8–10) complete.
- Tested on localhost: Demon Slayer (26 stills) and The Apothecary Diaries S3 (no stills) both show thumbnail rows, opacity 1, ✓ badges; Today tile lists a show airing today with a live countdown and "You watched 2 episodes today"; radar with 8 genres and 5 studios; party maker defaults (ep 4, 20:00), shared hash opens the countdown, reaches "It's time! 🎉" with confetti, closing clears the hash; phone width without sideways scroll. Console only showed AniList 429s from the test's burst of requests.

### 2026-11-27 — Phones get new versions; diary and badges synced per AniList account
- Reported by the owner: the phone (installed app) still showed an older version without the Today tile, and badges differed between devices (8/19 on desktop, 11/19 on the phone).
- Cause 1 (updates): an installed app can stay open for days and only looked for a new `sw.js` on a full start; the worker's network-first page fetch could also get a stale copy from the browser's HTTP cache (GitHub Pages allows 10 minutes), and `install` could cache a stale page too.
- `index.html`: the worker is registered with `updateViaCache:'none'` and `reg.update()` runs whenever Kuro comes back to the foreground and every 30 min. On `controllerchange` (only when a worker already controlled the page): reload at once if Kuro is in the background, else show "✨ Kuro has been updated · Reload" (`.updbar`), and reload the next time it goes to the background.
- `sw.js`: shell cached with `cache:'reload'`; page/same-origin fetches use `cache:'no-cache'` (revalidated, only `ok` responses stored); `activate` calls `clients.claim()`. Cache bumped to `kuro-v32`.
- Cause 2 (badges): streak, binge, night-owl and other badges come from the watch history (`kuro.hist.<id>`), which lived only in each browser. Badge unlock dates (`kuro.badges.*`) are local too, but the badges themselves are recomputed from shared data now.
- `index.html`: `histSync(p)` runs after every successful sync for signed-in profiles. It reads the account's AniList list activities ("watched / rewatched episode 5 - 7", `ACT_Q`, first time up to 12 pages × 50, then only newer ones via `createdAt_greater`, remembered in `kuro.histSync.<userId>`), and adds episodes not already in this browser's history, at the activity's time. Every device signed in to the account converges on the same diary, streaks and badges, and the diary also gains older AniList history. Diary footnote updated.
- Limits: emoji reactions stay on the device where they were made (AniList has nowhere to keep them); AniList merges quick successive updates into one activity, so a few episodes can share one time; if list activity is turned off in the AniList account settings, nothing comes in.
- Tested on localhost: `ACT_Q` validated against AniList; with a public account's activity (via the public endpoint) `histSync` added 11 entries over 7 days, sorted, no duplicate episodes, a second run added nothing; with the worker in control, changing the cache name and calling `update()` showed the Reload bar, deleted the old shell cache and kept `kuro-data` / `kuro-img` / `kuro-api`.

### 2026-11-27 — Diary and badges identical on every device (AniList activity is the source)
- Reported: still 11 badges on the phone, 10 on desktop (Binge mode: 10 episodes in a day on the phone, 9 on desktop). Cause: the v32 merge only added episodes a device was missing, so the phone kept its own tap times while the desktop used AniList's activity times (AniList groups quick updates into one activity under one time); it also only asked for activities newer than the last one seen, but AniList grows a recent activity in place ("1 - 3" → "1 - 10"), so updates were missed.
- `index.html`: `histSync()` now keeps every list activity by id in `kuro.acts.<userId>` (first sync up to 12 pages; afterwards it re-reads pages until it is 4 days past the newest known activity, max 6 pages) and `rebuildHist()` makes the history = AniList's watched/rewatched activities + only those locally tapped episodes AniList doesn't have (offline, not synced yet, activity turned off). Reactions are carried over by episode. With no activity at all, the local history is left alone. `kuro.histSync.*` (v32 bookkeeping) is removed. Badges are computed from this, so they match; a badge a device had unlocked only from its own tap times can turn locked again.
- `sw.js`: cache bumped to `kuro-v33`.
- Tested on localhost with a public account's activity (public endpoint standing in for the signed-in one): two simulated devices with different local histories end with the same entries and the same badge count; the device with a reaction keeps it, a local-only episode is kept.

### 2026-11-27 — "Watched in" years for shows watched before tracking
- Owner request: set general years for anime watched before using AniList.
- `index.html`: `yearOpts()`, `setYear()`; `#dYear` select in the sheet's dates; `#selYr` in the select bar with Undo; partial-date hint reworded ("Year only (2009). Pick a full date if you know it.").
- `index.html`: `yearsHTML()` in Stats → Overview (bars → `openWrapped(year)`, `#setYears`).
- `index.html` (Wrapped): a show's dates now decide which years it belongs to (started year to finished year; still watching → up to this year); `updated` is only the fallback for shows without dates, so setting a year no longer drags an old show into this year's Wrapped. `wrapYears()` also lists years from dates.
- `sw.js`: cache bumped to `kuro-v34`.
- Tested on localhost: Naruto set to 2009 in the sheet (started/finished `2009`, picker keeps 2009, hint shown); three shows bulk-set to 2014; Your years shows 2014 (3) and 2009 (1) and "1 completed show has no year yet"; Wrapped 2014 contains those three, 2026 does not; select bar and sheet fit at 375 px; no console errors.

### 2026-11-27 — Diary follows your dates; completions and local taps no longer split devices
- Reported: diaries still differed (phone: "Akame ga Kill! Eps 2–24 today", desktop: not there), and changing a show's watch dates on the phone didn't change the diary on either device.
- Causes: (1) the diary only used tap/activity times; Started/Finished dates were ignored. (2) When the last episode is marked, AniList logs "completed" instead of "watched episode N", which v33 skipped, so devices only had the tapping device's local copy. (3) Local taps AniList had no "watched" activity for (e.g. finishing by status change) were kept forever on that one device.
- `index.html`: activities now also keep "completed" entries (`kuro.acts2.<userId>`, a fresh full read; old keys removed). `rebuildHist()` turns a "completed" into the episodes after the last watched one (up to the show's episode count), but only if there was "watched" activity for it in the 30 days before; otherwise it is a status change and not counted. Local episodes without AniList activity are kept only if tapped after the sync that just ran (still on their way); older ones are dropped, so devices agree after each sync.
- `index.html`: `histV()` is what the diary, calendar, streaks, badges, Today tile and Wrapped read: episodes logged after a show's Finished date move to that day (noon); with a year- or month-only Finished date they leave the diary (no day to put them on); episodes before a full Started date move to it; rewatches (rewatch count > 0 or Rewatching) are untouched. Dates sync through AniList, so every device shows the same. Diary footnote mentions it.
- `sw.js`: cache bumped to `kuro-v35`.
- Tested on localhost with synthetic data: a finished-on-Nov-20 show tapped today shows on Fri Nov 20; a "2014" show tapped today leaves the diary; watched 1–11 + "completed" adds episode 12; "completed" with no watching is ignored; a phone with extra local taps and a desktop with none end with identical histories after `rebuildHist`; a just-tapped episode is kept; reactions carry over; the diary renders.

### 2026-11-27 — Seasonal effect no longer smears on phones
- Reported: on the phone the leaves sometimes drew as a stretched streak and only in the top-left area.
- Cause: the effects canvas was sized from `innerWidth`/`innerHeight` once and on `resize`. A phone app resumed from the background (or address bar / keyboard changes) can change the viewport without a resize event, so the canvas's pixel size no longer matched its on-screen size: the drawing was stretched, and `clearRect` (in old units) left trails.
- `index.html` (`applySeason()`): the canvas is sized from its real on-screen size (`clientWidth`/`clientHeight` × pixel ratio), checked every frame and fixed at once if it differs; each frame clears the whole pixel buffer with an identity transform; particles outside a smaller screen are moved back in. The resize listener is no longer needed.
- `sw.js`: cache bumped to `kuro-v36`.
- Tested on localhost: forcing the canvas to a wrong 120×200 size was corrected within a frame (1014×768); switching to a 375 px phone viewport resized it to 750×1624 with every particle inside.

### 2026-11-27 — Picked for you drops shows once they are on your list
- Reported: shows added as Plan to watch or Completed stayed in Picked for you (with a ✓).
- Cause: recommendations were filtered against the list only when they were loaded (cached 30 min); sequel/prequel picks also stayed when added.
- `index.html`: `drawRecs()` filters out anything on the list every time it draws (both sequel picks and recommendations); `loadRecs()` keeps up to 40 candidates instead of 16 so the row stays full (still 20 shown).
- `sw.js`: cache bumped to `kuro-v37`.
- Tested on localhost: adding the first card with + and setting the second to Completed removed both at once; the row still showed 20 cards, none on the list.

### 2026-11-26 — Readable button text and Today header; nav pill covers the label
- Reported: text hard to read (the "Today" header on This week, the +1 button); on phones the active-page pill should sit behind the label too, not just the icon.
- Cause (Today header): its class `today` clashed with the Today tile's `.today` styles, so it got a purple gradient under purple text. Renamed to `.wkday.now` in `index.html`.
- `index.html` (contrast, WCAG AA 4.5:1): default theme `--on-accent` is now near-black (#0b0b12): white on the purple/pink gradient was 3.3:1 / 2.5:1, dark is 6.0:1 / 7.8:1. Light theme `--accent2` darkened to #c7337f (white text 5.0:1) and `--on-accent:#fff` set there. Custom accent colours: `accentSet()` now picks white or dark button text by whichever reads best across both gradient ends, and on Light steps the accent down to at least 4.5:1 against white.
- `index.html` (phone nav): `nav.bottom .npill` is now nearly as tall as the bar (top 6px, `--nav-h` − 12px, radius 16px) and up to 84px wide, so the bouncing pill sits behind both icon and label.
- `sw.js`: cache bumped to `kuro-v38`.
- Tested on localhost at 375 px: the Today header has no background and uses the accent colour; the +1 text is #0b0b12; the pill spans the whole This week button (icon and label).

### 2026-11-26 — Settings and Profile are their own pages
- Asked: Settings should be its own page instead of opening over the others, and the profile part should be separate from Settings.
- `index.html` (pages): new views `#v-settings` and `#v-profile` in `<main>`, shown by `setView()` like the other tabs. `drawSettings()` replaces the Settings dialog: Watch link, Lists, Effects, Alerts, Offline and Backup in cards; every change saves at once (no Save button; a bad Watch link is refused with a toast). `drawProfile()` replaces the Edit profile dialog and the profile/accounts part of Settings: profile card, Look (picture, display name, colour, theme, accent; saved and applied at once, "Reset look" asks first) and AniList accounts (switch, sync now, sign out, sign in / add account, Client ID help). `keepPlace()` keeps scroll and focus when a page redraws. `openSettings()` / `openProfile()` now just switch view.
- `index.html` (getting there): top bar has a gear (`#gearBtn`, desktop only) for Settings and the profile/avatar button (`#settingsBtn`, now a person icon for a plain guest, aria-label "Profile: name") for Profile. The phone bar's Settings is a real tab (`data-view="settings"`) so the pill sits on it. "Sign in" on the sync line and the expired-sign-in toast point to the Profile. Searching from either page jumps to Discover; pull to refresh redraws them (Profile also syncs).
- `index.html`: `$$()` takes an optional root element.
- `sw.js`: cache bumped to `kuro-v39`.
- Tested on localhost (desktop and 375 px): gear and phone tab open Settings with no dialog, the phone pill sits on Settings, the gear hides on phones; a checkbox saved straight to `kuro.settings`; the avatar opens Profile with no tab highlighted; picking Ocean applied the theme and kept focus on the tile; a display name saved on change and updated the header button label; no console errors.
