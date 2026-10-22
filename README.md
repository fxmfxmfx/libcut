> English | [Русский](README.ru.md)

# libcut 2.0

A self-hosted TikTok viewer with subscriptions, an unwatched feed, favorites, comments, downloads, and photo galleries. No TikTok account is required. The interface supports English and Russian, six themes, accent colors, and custom CSS.

**Use libcut on your own machine or a trusted network. There is no login or authorization system.** Client mode isolates personal browser state, but does not make an instance a hardened public service. Respect copyright and TikTok's terms.

## What's new in 2.0

- Client preferences and subscriptions survive reloads; watched and favorite state uses stable TikTok IDs.
- Client feed refresh, manual watched toggles, JSON backup export/import, and storage error recovery.
- Immediate search in your library alongside live TikTok search, exact `@handle` lookup, and full profile/video links. Search results open in the player.
- Mobile video/comments switching, reachable comment scrolling, touch navigation for photo galleries, and playback retry controls.
- Working attachment downloads, correct byte ranges, shared downloads, bounded upstream concurrency, and transactional comment refreshes.
- Updated dependencies and reproducible checks for both storage modes.

See [CHANGELOG.md](CHANGELOG.md) and the [2.0 upgrade guide](docs/UPGRADING-2.0.md) before updating an existing installation.

## Run with Docker Compose

Requires Docker and Compose. The image includes Node, Bun, Chromium, Python, ffmpeg, yt-dlp, and curl_cffi.

```sh
git clone https://github.com/fxmfxmfx/libcut.git
cd libcut
cp .env.example .env
# Review .env, then:
docker compose up -d --build
```

Open **http://localhost:3000**. The default is offline demo data and a loopback-only port binding. For live TikTok data, set these values in `.env` and recreate the container:

```dotenv
DEMO_MODE=false
TIKTOK_PROXY=socks5://your-proxy-host:1080
DATA_MODE=local
```

Authenticated SOCKS5 and HTTP(S) proxies are supported. URL-encode special characters in credentials. To reach a proxy on the Docker host, use `host.docker.internal` and add the platform's host-gateway mapping if required.

For access from other devices on a **trusted LAN**, set `LIBCUT_BIND` to your LAN interface address (or `0.0.0.0` if appropriate). Do not forward this unauthenticated service to the public internet.

```sh
docker compose logs -f libcut
docker compose ps
docker compose down
```

The named volumes retain SQLite and cached media. **`docker compose down -v` deletes those volumes.** The internal browser service listens only on loopback port 3040; only port 3000 is published.

## Storage modes

| Mode | Personal data | Shared server storage |
| --- | --- | --- |
| `DATA_MODE=local` | Subscriptions, favorites, watched state, and preferences in SQLite; shared by everyone with access | Metadata, comments, media cache |
| `DATA_MODE=client` | Subscriptions, favorites, watched state, and preferences in this browser's localStorage | Public metadata, comments, media cache; no server personal-data API |

Client data belongs to a browser and origin, not an account. A different device, port, hostname, or cleared site storage has a separate library. Use **Settings → Export backup / Import backup** to transfer it. Export a backup before clearing site storage. Damaged storage is preserved for recovery rather than overwritten silently.

In client mode, local search uses your subscriptions, saved favorites, and metadata already loaded in that browser. It does not list the shared server library. The server still caches public TikTok metadata, so this mode is not stateless.

## Search and TikTok availability

Search accepts keywords, `@username`, a full `https://www.tiktok.com/@username` profile URL, or a full `/@username/video/ID` or `/photo/ID` URL. Shortened `vm.tiktok.com` links are not resolved: open the link and use its full address.

Library results appear independently of TikTok. Live keyword search and comments require the separate Chromium service. TikTok can return captcha pages, regional restrictions, or empty responses; these are reported as errors. Use a working proxy and check the service logs. Demo mode does not contact TikTok and cannot establish whether a particular proxy works.

## Local development

Requires **Node 22+**, **Bun 1.3+**, and, for live mode, `curl`, `ffmpeg`, Python with `yt-dlp` and `curl_cffi`, plus Chromium for the browser service.

```sh
cp .env.example .env
mkdir -p db
# Use absolute paths for local SQLite and cache, including standalone production:
export DATABASE_URL="file:$(pwd)/db/custom.db"
export TIKTOK_CACHE_DIR="$(pwd)/cache/videos"
bun install --frozen-lockfile
bun run db:generate
bun run db:push
bun run dev
```

Save those absolute values in `.env` if you want them to persist between terminals. Development runs on port 3000. Demo mode works without Chromium or yt-dlp.

For live search and comments, run a second terminal:

```sh
cd mini-services/tiktok-comments
PUPPETEER_SKIP_DOWNLOAD=true bun install --frozen-lockfile
# Set PUPPETEER_EXECUTABLE_PATH to your system Chromium, or install one:
bunx puppeteer browsers install chrome
bun run dev
```

The application passes its effective proxy to the loopback browser service. In client mode that proxy is controlled by the server environment; clients cannot read its credentials or change global settings.

Production build and startup:

```sh
bun run build
bun run start
```

## Configuration

Copy [.env.example](.env.example); keep `.env` and credentials out of Git.

| Variable | Purpose |
| --- | --- |
| `DEMO_MODE` | `true` serves offline sample data; `false` requests TikTok |
| `DATA_MODE` | `local` or `client`; requires a restart |
| `TIKTOK_PROXY` | SOCKS5/SOCKS5H/HTTP(S) upstream proxy |
| `DATABASE_URL` | SQLite URL; use an absolute path for local production |
| `TIKTOK_CACHE_DIR` | Download cache directory |
| `TIKTOK_CACHE_TTL_MIN` | Media retention, default 10 minutes; metadata remains |
| `TIKTOK_SOCKET_TIMEOUT` / `TIKTOK_RETRIES` | yt-dlp network timeout and retries, defaults 30 / 3 |
| `YTDLP_PATH` | yt-dlp executable, default `yt-dlp` |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium executable for the browser service |
| `LIBCUT_BIND` | Compose host binding, default `127.0.0.1` |

Appearance settings apply immediately. Custom CSS is limited to local styles; external resource URLs and `@import` are rejected.

## Checks and contributions

```sh
bun run check          # ESLint, TypeScript, and Bun regression tests
bun run build          # production build
bunx playwright install chromium
bun run test:e2e       # isolated demo databases, local + client browser tests
```

The browser tests build on the existing production output: run `bun run build` first. They create temporary databases and do not use your configured SQLite file. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium installation. Docker checks require Docker; browser-backed live requests require reachable TikTok and a suitable proxy.

[Project audit](docs/PROJECT-AUDIT.md) records validation and remaining limitations. Include a clear description, relevant checks, and screenshots for UI changes in pull requests. License: [MIT](LICENSE).
