# Handover prompt

Copy everything inside the box below into Claude Code on the new machine, after copying this whole project folder there (include the hidden `.claude` folder and the `.md` files; the folder name and location can differ).

````text
I'm continuing an existing project called Kuro Watchlist, which was started in another Claude Code session on a different computer. This folder is the full project.

Before doing anything else:
1. Read CLAUDE.md and then DEVELOPMENT_LOG.md in full. They hold the architecture, decisions, how to run it, current status, known issues and the complete change log.
2. Look at index.html, manifest.json, sw.js and icon.svg to confirm the code matches the log.
3. If .claude/launch.json is missing, recreate it as a dev server for `python -m http.server 5188` on port 5188, then start it and check the app loads with no console errors (hard refresh, because a service worker caches the page).
4. Tell me in a few lines what the project is, its current state, and what you think the next steps are. Then wait for my instructions.

Project in short: a mobile and desktop friendly web app (PWA, vanilla HTML/CSS/JS, one file) to track a personal anime watchlist. Data comes from the AniList GraphQL API. Features: Discover with filters, add-to-list, My List with statuses and episode progress, detail sheet with official "Where to watch" links, episode list, in-app trailer, "Next up" row, punctuation-tolerant search, and two-way sync with my AniList account.

Standing instructions that apply for the rest of this project (also in CLAUDE.md):
- Record every change you make in DEVELOPMENT_LOG.md. After each change, append an entry to the Change Log at the bottom (`### YYYY-MM-DD — short title`, then bullets: what changed, which file, why), in the same turn as the change. Keep Current status, Known issues and Next ideas up to date.
- Do not build scraping, embedding or re-serving of video from unlicensed streaming sites, or torrent streaming. My own configurable Watch link (a plain link to a search page) stays. Official streaming links, tracking, trailers, and playing my own files through Jellyfin or Plex are fine.
- Keep the app dependency-free and single-file unless I agree otherwise. Test UI changes in a browser.
- Keep my personal details out of any requests to outside services, and treat AniList tokens as secrets (localStorage only, never logged or exported).
- I'm on Windows and use Brave; give shell commands in the right syntax (PowerShell vs cmd).

Open items I may ask about: hosting the app permanently (Netlify or GitHub Pages) and registering that address as the AniList Redirect URL so sync works on my phone; a "This week" airing schedule; a Jellyfin/Plex "Play from my library" button; PNG app icons.
````

## Moving the project between machines
- **Easiest:** zip the folder (include hidden files) and unzip it on the other machine.
- **Better for ongoing work:** `git init`, commit, and push to a **private** GitHub repo, then clone it on the other machine. (The project is not a git repo yet.)
- Your app data (the watchlist) is not in these files. It lives in each browser's localStorage, so use Export/Import in Kuro Settings, or AniList sync, to carry the list over.
