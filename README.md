> English | [Русская версия](README.ru.md)

# libcut

**A self-hosted, privacy-first TikTok viewer. No ads, no tracking, no account required.**

libcut is the [redlib](https://github.com/redlib-org/redlib) / [libreddit](https://github.com/libreddit/libreddit) idea, but for TikTok. You run it on your own server, subscribe to creators by `@username`, and get a clean feed of new, unwatched videos — with comments, favorites, downloads, photo carousels, and full author profiles. All TikTok traffic is funneled through a SOCKS5 proxy and [`yt-dlp`](https://github.com/yt-dlp/yt-dlp); no third-party TikTok scripts or pixels ever execute in your browser.

> ⚠️ Intended for **personal** use. Respect copyright and TikTok's Terms of Service.
> ⚠️ Completely vibe-coded by GLM 5.2 on chat.z.ai

[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/yt-dlp/yt-dlp/pulls)

---

## Screenshots

| Feed of unseen videos | Gruvbox theme |
|---|---|
| ![Feed](preview3-feed.png) | ![Gruvbox](preview3-gruvbox.png) |

| Video player | Author profile |
|---|---|
| ![Player](preview3-player.png) | ![Profile](preview3-profile.png) |

> All screenshots live in the repository root. New previews may be added over time.

---

## Features

### Browsing
- **Subscribe to creators** by `@username` — profile and recent videos are fetched via `yt-dlp` and stored locally.
- **Feed of unseen videos** — shows only videos you haven't watched yet; auto-checks for new ones when you open the app.
- **Author profiles** — avatar, channel display name, description, and full stats (followers, following, likes/heart count, video count) plus a grid of all stored videos.
- **Search by handle** — search across your local library and TikTok directly; toggle between All / Authors / Videos.

### Playback
- **Video player** with native controls, auto-loop, and HTTP `Range`-seek support.
- **Volume control** — always available, fades in on hover.
- **Photo carousels (slides)** for TikTok image posts — swipe with arrows, dots, or the ←/→ keys.
- **Comments** with author names, avatars, like counts, and timestamps — refreshable on demand.
- **iOS-friendly muted autoplay** — the player starts muted and unmutes on the first tap, working around Safari's autoplay policy.

### Library
- **Favorites** — save videos to the local database for later.
- **Download videos** to your computer in one click (streamed with HTTP `Range` support).
- **Mark-as-watched** — individually per video, or "Mark all as watched" on an author profile.
- **Load older videos** — paginate deeper into a creator's backlog via `yt-dlp`'s `--playlist-start`.

### Privacy
- **No TikTok account needed** — subscribe and browse anonymously.
- **No tracking, no ads** — nothing from TikTok's frontend ever runs in your browser.
- **SOCKS5 proxy for all TikTok access** — every request goes through your proxy at the `yt-dlp` layer.
- **Server-side image proxy** — all avatars and thumbnails are re-served through `/api/tiktok/proxy-image` (TikTok's CDN blocks hotlinking).
- **Temp video cache auto-cleaned every 10 min** (configurable via `TIKTOK_CACHE_TTL_MIN`) — DB metadata is kept, stale `.mp4` files are deleted.

### Customization
- **6 built-in themes**: Default (Rose), Gruvbox, Catppuccin Mocha, Nord, Dracula, Light.
- **Custom accent color** picked from a palette (or any CSS value via custom CSS).
- **Custom CSS injection** — paste arbitrary CSS that overrides every built-in style and theme.
- **English / Russian UI** — toggle live without a rebuild.
- All appearance settings are stored in the database, survive container restarts, and apply instantly.

### Self-hosting
- **Docker** deployment — a single `docker compose up -d --build`.
- **SQLite** database via Prisma (no external DB to manage).
- **`yt-dlp` + `curl_cffi`** for TikTok TLS impersonation (required — TikTok blocks naive clients).
- **Headless Chromium** (`puppeteer-extra` + stealth plugin) for comment extraction (accepts GDPR consent, clicks the comment icon, captures the signed comment API response).
- **Demo mode** — preview the UI with built-in sample data without ever touching TikTok.

---

## Quick Start (Docker)

This is the primary way to run libcut.

### Prerequisites
- **Docker** and **Docker Compose** v2 — verify with `docker --version` and `docker compose version`.
- A working **SOCKS5 proxy** whose exit IP is in a region where TikTok is reachable.

Everything else (`python3`, `ffmpeg`, `yt-dlp`, `curl_cffi`, `node`, `bun`, Chromium) is installed automatically inside the image.

### Steps

1. **Clone the repository:**

   ```bash
   git clone https://github.com/fxmfxmfx/libcut/
   cd libcut
   ```

2. **Edit `.env`** in the project root — switch off demo mode and set your proxy:

   ```dotenv
   DEMO_MODE=false
   TIKTOK_PROXY=socks5://user:pass@1.2.3.4:1080
   ```

3. **Build and start the container:**

   ```bash
   docker compose up -d --build
   ```

4. **Open** http://localhost:3000 in your browser.

Check status:

```bash
docker compose ps
docker compose logs -f libcut
```

Stop:

```bash
docker compose down
```

> ⚠️ **Build requirements:** the first build runs Turbopack (`next build`) **and** downloads Chromium for the comments service. Plan for **~2 GB of free RAM** and **~3 minutes** of build time. The final image size is **~1.5 GB** (mostly Chromium).

> ℹ️ **DEMO_MODE default:** the shipped `.env` ships with `DEMO_MODE=true` so the UI is previewable in a sandbox. On your server you **must** flip it to `false` (and set `TIKTOK_PROXY`) or no real TikTok requests will be made.

See [DOCKER.md](DOCKER.md) and [DOCKER.en.md](DOCKER.en.md) for the in-depth Docker guide.

---

## Configuration

All configuration is via environment variables, set in `.env` (auto-picked-up by Compose) or passed on the shell.

| Variable | Default | Description |
|---|---|---|
| `DEMO_MODE` | `false` (Docker) / `true` (local dev) | `true` serves built-in demo data and never contacts TikTok. `false` makes real requests through `yt-dlp` + proxy. |
| `TIKTOK_PROXY` | _(empty)_ | SOCKS5 proxy for `yt-dlp` and the HTML scraper. Format: `socks5://user:pass@host:port`. Can be overridden at runtime in Settings. |
| `TIKTOK_CACHE_TTL_MIN` | `10` | Lifetime of the temp video cache, in minutes. After expiry the `.mp4` file is deleted (DB metadata is kept). |
| `TIKTOK_SOCKET_TIMEOUT` | `30` | Per-attempt socket timeout for `yt-dlp`, in seconds. |
| `TIKTOK_RETRIES` | `3` | Number of `yt-dlp` retries on network errors. |
| `DATABASE_URL` | `file:/app/db/custom.db` | Path to the SQLite database file (inside the container). |
| `TIKTOK_CACHE_DIR` | `/app/cache/videos` | Directory for the temp video cache (inside the container). |
| `NODE_ENV` | `production` | Node.js mode. |
| `YTDLP_PATH` | `yt-dlp` | Path to the `yt-dlp` binary (override if installed in a non-standard location). |
| `TIKTOK_UA` | Chrome 124 User-Agent | User-Agent string sent by `yt-dlp` and the HTML scraper. |

> 💡 **Runtime settings:** the **proxy, language, theme, accent color, custom CSS, and auto-mark-watched behavior** are also stored in the database and editable in the **Settings** panel — they apply immediately, no rebuild needed, and survive a container restart. The DB value takes precedence over the env var (except for `DEMO_MODE`, which is env-only).

---

## Proxy Setup

TikTok aggressively blocks requests coming from datacenter IPs, so **all** network access to TikTok goes through a SOCKS5 proxy. The proxy is passed to `yt-dlp` via the `--proxy=` flag and to the HTML scraper via `socks-proxy-agent`.

### Format

```
socks5://user:pass@host:port       # authenticated
socks5://host:port                 # no auth
http://user:pass@host:8080         # yt-dlp also accepts HTTP proxies
```

### Where to configure

You can set the proxy in two places (they compose):

1. **`TIKTOK_PROXY` env var** in `.env` — the default value used when nothing is in the DB.
2. **Settings → Proxy** in the app — URL + "Use proxy" toggle, stored in the DB and applied immediately without a rebuild. If the DB URL is empty, the env value is used.

The proxy is **enabled by default** (`proxyEnabled=true`). Turn the toggle off in Settings if you need to debug direct requests.

### Proxy on the host machine

If your proxy runs on the same machine as Docker, you must address it from the container by `host.docker.internal` (not `127.0.0.1`):

```dotenv
TIKTOK_PROXY=socks5://host.docker.internal:1080
```

On older Linux you may need to add `--add-host=host.docker.internal:host-gateway` (modern Docker adds it automatically — the bundled `docker-compose.yml` already supports this).

### SSH tunnel trick

If you have SSH access to a server in the right region, spin up a one-shot SOCKS5 proxy:

```bash
ssh -D 1080 -N user@remote-host
# then in .env:
# TIKTOK_PROXY=socks5://host.docker.internal:1080
```

### Proxy is on by default

Even if you set `TIKTOK_PROXY`, you can toggle it off at runtime from the Settings panel for testing — yt-dlp will then go direct (and TikTok will likely block it).

---

## Usage Guide

### Subscriptions
1. Open the **Subscriptions** tab.
2. Click **Subscribe**.
3. Enter the creator's `@username`.
4. libcut fetches the profile + recent videos via `yt-dlp` (through your proxy) and saves them locally.

### Feed
- The **Feed** tab shows only unseen videos from your subscriptions.
- It auto-checks for new videos when you open the app.
- Click **Check for new** to force a refresh.

### Search
- The top search bar searches both your local library and TikTok.
- Use the **All / Authors / Videos** toggle to filter.
- Search is primarily handle-based (exact `@username`) — TikTok's full-text search isn't reliably scrapeable.

### Video player
Click any video card to open the player:
- **Favorite** — add/remove from your local favorites.
- **Download** — save the `.mp4` to your computer.
- **Comments** — view + refresh (the headless-browser service handles signing).
- **Slides** — for photo posts, navigate with arrows, dots, or ←/→.
- **Volume** — slider control.
- **Mark watched / Mark as new** — toggle the seen state.
- **Original** — opens the real TikTok page (with a confirmation dialog warning about tracking/ads).

### Author profile
Click an author's avatar/name to open their profile:
- Avatar, display name, description, followers, following, likes, video count.
- **Check for new** — fetch fresh videos.
- **Load older videos** — paginate deeper into the backlog.
- **Mark all as watched** — clears the "new" badges for that creator.
- **Open on TikTok** — external link with confirmation dialog.

### Settings
Open the **Settings** tab to configure:
- **Language** — English or Russian.
- **Theme** — 6 built-in palettes.
- **Accent color** — preset swatches.
- **Custom CSS** — arbitrary CSS, injected into the page.
- **Proxy** — toggle and URL.
- **Behavior** — auto-mark videos as watched when opened.
- **Cache** — video cache lifetime (minutes).
- **Danger zone** — clear all data (subscriptions, favorites, comments, settings).

---

## How It Works

libcut is a Next.js 16 single-page app backed by a small REST API. The interesting parts live in `src/lib/tiktok/` and `mini-services/tiktok-comments/`.

### `yt-dlp` + `curl_cffi`
[`yt-dlp`](https://github.com/yt-dlp/yt-dlp) is invoked as a child process (`src/lib/tiktok/ytdlp.ts`) to fetch video lists, stream URLs, and metadata. `curl_cffi` is installed alongside it to provide **browser TLS fingerprint impersonation** — without it, TikTok blocks extraction with `Unexpected response from webpage request`. All `yt-dlp` requests go through the resolved SOCKS5 proxy via `--proxy=`.

### HTML scraper
`src/lib/tiktok/scraper.ts` fetches TikTok page HTML (also through the proxy via `socks-proxy-agent`) and extracts the `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON blob. This is **more reliable than yt-dlp** for:
- author `nickname` (display name), `avatarLarger`, `signature` (bio),
- `followerCount`, `followingCount`, `heartCount`, `videoCount`,
- video `stats` (playCount, diggCount, commentCount, shareCount),
- `imagePost.images[]` for **photo carousel detection**.

### Image proxy
TikTok's CDN blocks hotlinking (returns 403 on `<img>` tags from other origins). `src/lib/tiktok/images.ts` rewrites every remote image URL to `/api/tiktok/proxy-image?url=...`; the server fetches the image through the proxy and re-serves it. Avatars and thumbnails wouldn't load without this.

### Comments service
TikTok's comment API requires `a_bogus` request signing, which is non-trivial to reimplement. Instead, the `mini-services/tiktok-comments/` mini-service uses **headless Chromium** (`puppeteer-extra` + the stealth plugin) to:
1. Load the video page.
2. **Accept TikTok's GDPR consent banner** (EEA proxy regions show a consent wall that blocks comments until accepted — this was the long-standing blocker).
3. **Click the comment icon** — TikTok fires the signed comment API request from the real browser.
4. **Intercept the response** — `/api/comment/list` payloads are parsed into `{ authorName, authorAvatar, text, likeCount, postedAt }`.

The service listens on port `3040` (internal — not exposed to the host) and is called by the Next.js API route at `/api/tiktok/videos/[id]/comments`. First-load latency is ~20–40 seconds (Chromium spin-up + page load + consent + click + scroll); subsequent loads are faster.

### Temp cache
`src/lib/tiktok/cache.ts` downloads videos on demand into `cache/videos/` (or `TIKTOK_CACHE_DIR`). A background timer runs every **1 minute** and evicts files older than `TIKTOK_CACHE_TTL_MIN` (default **10 minutes**). DB metadata is preserved — the file is just re-downloaded next time the user plays it.

### Database
SQLite via Prisma (`prisma/schema.prisma`), with models `Author`, `Video`, `Comment`, `Favorite`, `SearchHistory`, `Setting`. The `Setting` table holds runtime-edited values (language, theme, accent, custom CSS, proxy URL, proxy toggle, auto-mark-watched) so they survive restarts and don't require a rebuild.

---

## Custom CSS

Open **Settings → Custom CSS** to paste arbitrary CSS. It's injected into the page as a separate `<style id="libcut-custom-css">` tag inside `<head>`, applied **after** all themes, the accent color, and base styles — so it overrides everything.

### Key CSS variables

All variables are defined in [`src/app/globals.css`](src/app/globals.css). The most useful ones to override:

| Variable | What it controls |
|---|---|
| `--primary`, `--primary-foreground` | Accent color (buttons, active items) + text on it |
| `--background`, `--foreground` | Page background and base text |
| `--card`, `--card-foreground` | Card background and text |
| `--border`, `--input` | Border and input field colors |
| `--ring` | Focus ring color |
| `--sidebar`, `--sidebar-foreground` | Sidebar background and text |
| `--muted`, `--muted-foreground` | Muted blocks and muted text |
| `--accent`, `--accent-foreground` | Hover/selection accent |
| `--secondary`, `--secondary-foreground` | Secondary color and text |
| `--destructive` | Danger/destructive action color |
| `--radius` | Base border radius (drives `--radius-sm/md/lg/xl`) |

Themes target the `[data-theme="..."]` selector (e.g. `[data-theme="gruvbox"]`); the base palette lives on `:root` / `.dark`.

### Example

```css
:root {
  --primary: #ff6b6b;
  --radius: 1rem;
}

/* Rounder video cards */
.video-portrait {
  border-radius: 1.5rem;
}

/* Per-theme override */
[data-theme="gruvbox"] {
  --primary: #fabd2f;
}
```

### Tips
- Colors can be in any CSS format (`#hex`, `rgb()`, `oklch()` — all built-in themes use `oklch()` or `#hex`).
- The accent color from **Settings → Accent** also overrides `--primary` (plus `--ring`, `--sidebar-primary`, `--sidebar-ring`), but **custom CSS wins** if both set it.
- The **Save** button applies instantly — no page reload. The value is persisted in the DB.
- To reset, clear the textarea and click Save.

---

## Local Development (without Docker)

You'll need [bun](https://bun.sh), Python 3 with `pip`, and `ffmpeg` in your `PATH`.

```bash
# 1. Install JS deps + create the SQLite schema
bun install
bun run db:push

# 2. Install yt-dlp + curl_cffi (for TikTok TLS impersonation)
pip install yt-dlp curl_cffi

# 3. Install ffmpeg (macOS: brew install ffmpeg; Debian/Ubuntu: sudo apt install ffmpeg)

# 4. Start the comments mini-service (optional, only needed for comments)
cd mini-services/tiktok-comments
bun install
bun run index.ts   # listens on http://localhost:3040

# 5. Run the app in demo mode (built-in sample data, no proxy needed)
DEMO_MODE=true bun run dev
```

Open http://localhost:3000.

For real TikTok access, set `DEMO_MODE=false` and a working `TIKTOK_PROXY`:

```bash
DEMO_MODE=false TIKTOK_PROXY=socks5://127.0.0.1:1080 bun run dev
```

### Available scripts

| Command | Action |
|---|---|
| `bun run dev` | Dev server on `:3000` |
| `bun run build` | Production build (Turbopack, standalone output) |
| `bun run start` | Run the built standalone server |
| `bun run lint` | ESLint |
| `bun run db:push` | Apply the Prisma schema to SQLite |
| `bun run db:generate` | Regenerate the Prisma client |
| `bun run db:reset` | Reset the DB |

---

## Troubleshooting

- **Videos don't load.**
  Make sure `DEMO_MODE=false` in `.env` and that `TIKTOK_PROXY` is set and working. Check the logs:
  ```bash
  docker compose logs libcut | grep -iE 'proxy|yt-dlp|error'
  ```

- **Avatars / thumbnails don't load.**
  All images are proxied through `/api/tiktok/proxy-image` because TikTok's CDN blocks hotlinking. Check that the proxy is enabled and reachable. If your proxy is on the host, use `host.docker.internal` (not `127.0.0.1`).

- **Comments are slow or empty.**
  The comments service uses a **headless Chromium** that loads the video page, accepts GDPR consent, clicks the comment icon, and intercepts the signed API response. First load takes **~20–40 seconds** (browser spin-up + page + consent + click + scroll). Subsequent loads are faster. If comments are consistently empty:
  - Ensure Chromium is installed (the Docker image handles this automatically; for local dev, run `cd mini-services/tiktok-comments && bun install`).
  - Ensure the comments service is running on port 3040.
  - GDPR consent is auto-accepted — but if TikTok changes the consent flow, comments may silently break. Try a different proxy region.

- **Build fails with exit code `137`.**
  That's an OOM kill — the build needs **~2 GB of free RAM** (Turbopack + Chromium download). Add more memory to the server, or build on a beefier machine and `docker save` / `docker load` the image.

- **`bun install --frozen-lockfile` fails during build.**
  Your local `bun.lock` is out of sync with `package.json`. Run `bun install` on the host, commit the updated `bun.lock`, then rebuild.

- **Proxy on the host not reachable from the container.**
  Use `host.docker.internal` instead of `127.0.0.1`:
  ```dotenv
  TIKTOK_PROXY=socks5://host.docker.internal:1080
  ```

- **No sound on iOS.**
  Safari blocks autoplay with sound. Tap the video (or the play button overlay) — sound will turn on. This is intentional (muted autoplay + unmute on user gesture).

- **Photo posts show an error.**
  Photo carousels are detected by the HTML scraper from `imagePost.images[]` in the `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON. If the scraper can't reach TikTok (proxy issue, region block, TikTok layout change), the post may fall through to the video player and fail. Check the proxy and rebuild the image to get a fresh `yt-dlp`.

- **I want to reset everything.**
  ```bash
  docker compose down -v && docker compose up -d --build
  ```
  Or use **Settings → Danger zone → Clear all data** in the UI.

---

## Data Storage

Docker Compose creates two named volumes (see [`docker-compose.yml`](docker-compose.yml)):

| Volume | In container | What it stores |
|---|---|---|
| `libcut-db` | `/app/db` | SQLite database `custom.db` — subscriptions, videos, favorites, comments, settings |
| `libcut-cache` | `/app/cache/videos` | Temporarily downloaded `.mp4` files (cleaned by TTL, default 10 minutes) |

Inspect on-disk paths:

```bash
docker volume inspect libcut_libcut-db
docker volume inspect libcut_libcut-cache
```

Wipe everything (loses subscriptions + favorites + comments + settings):

```bash
docker compose down -v
```

---

## Updating yt-dlp

TikTok changes its internal API frequently, so `yt-dlp` needs to be updated periodically. The simplest way is to rebuild the image — the Dockerfile pulls a fresh `yt-dlp` via `pip3 install` on every build:

```bash
docker compose up -d --build
```

To pin a specific version for stability, edit the [`Dockerfile`](Dockerfile):

```dockerfile
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp==<version> curl_cffi
```

If extraction suddenly breaks on a working setup, the first thing to try is rebuilding the image — the upstream `yt-dlp` maintainers usually ship a fix within hours of TikTok breaking things.

---

## Tech Stack

- **[Next.js 16](https://nextjs.org/)** (App Router, Turbopack, standalone output) + **React 19** + **TypeScript**.
- **[Tailwind CSS 4](https://tailwindcss.com/)** + **[shadcn/ui](https://ui.shadcn.com/)** + Radix UI primitives.
- **[Prisma](https://www.prisma.io/)** + **SQLite** for the local database.
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** + **[curl_cffi](https://github.com/lexiforest/curl_cffi)** + **[ffmpeg](https://ffmpeg.org/)** for TikTok video/metadata extraction with TLS impersonation.
- **[puppeteer-extra](https://github.com/berstend/puppeteer-extra)** + stealth plugin + headless **Chromium** for comment extraction.
- **[TanStack Query](https://tanstack.com/query)** (server state) + **[Zustand](https://github.com/pmndrs/zustand)** (UI state + i18n).
- **[socks-proxy-agent](https://github.com/TooTallNate/proxy-agents)** for proxied HTML scraping.
- **[bun](https://bun.sh)** as the runtime and package manager.

---

## License

Released under the **MIT License**. See [LICENSE](LICENSE) for the full text.
Vibe-coded by GLM 5.2 which is open-weight model developed by z.ai  

### Credits

This project would not be possible without:

- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** — the workhorse that does all the actual TikTok extraction. 🙏
- **[Next.js](https://nextjs.org/)** — React framework (App Router, Turbopack).
- **[Prisma](https://www.prisma.io/)** — type-safe ORM for SQLite.
- **[shadcn/ui](https://ui.shadcn.com/)** — the UI component library.
- **[puppeteer](https://pptr.dev/)** + **puppeteer-extra-plugin-stealth** — headless Chromium automation for comments.

Inspired by [redlib](https://github.com/redlib-org/redlib) and [libreddit](https://github.com/libreddit/libreddit) — the same privacy-first, self-hosted spirit, applied to TikTok.
