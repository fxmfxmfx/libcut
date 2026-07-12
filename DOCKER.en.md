# Docker deployment

> English version | [Русская версия](DOCKER.md)

A self-hosted, tracker-free TikTok parser (a redlib analogue for TikTok).
The app runs on Next.js 16 + Prisma (SQLite), fetches videos via
`yt-dlp` + `ffmpeg`, and **all** network access to TikTok goes through a
SOCKS5 proxy.

---

## Prerequisites

- A server with **Docker** and **Docker Compose** (v2) installed.
  Verify with `docker --version` and `docker compose version`.
- A SOCKS5 proxy with an exit in a region where TikTok is available
  (e.g. a proxy in Russia/CIS if your server faces Europe, or vice versa).

Nothing else needs to be installed — `python3`, `ffmpeg`, `yt-dlp`, `node` and
`bun` are installed inside the image automatically.

---

## 1. Configure the SOCKS5 proxy

All requests to TikTok go through `yt-dlp`, which receives the
`--proxy=$TIKTOK_PROXY` flag. Without a proxy, TikTok typically blocks the
requests.

Open the `.env` file in the project root and fill in the variables:

```dotenv
# Demo mode: on the server this MUST be false (otherwise real requests won't go through).
DEMO_MODE=false

# SOCKS5 proxy. Format: socks5://user:pass@host:port
TIKTOK_PROXY=socks5://user:pass@1.2.3.4:1080

# How many minutes to keep downloaded videos in the temp cache (then deleted).
TIKTOK_CACHE_TTL_MIN=10
```

Examples of `TIKTOK_PROXY`:

| Case                                      | Value                                         |
|-------------------------------------------|-----------------------------------------------|
| SOCKS5 with password                      | `socks5://user:pass@host:1080`                |
| SOCKS5 without auth                       | `socks5://host:1080`                          |
| Local SSH tunnel (`ssh -D 1080`)          | `socks5://127.0.0.1:1080` (proxy on the host) |
| HTTP proxy (yt-dlp supports it too)       | `http://user:pass@host:8080`                  |

> Important: if the proxy runs on the host machine, the container must address
> it not by `127.0.0.1` but by `host.docker.internal` (or by the host's IP on
> the local network). Example:
> `TIKTOK_PROXY=socks5://host.docker.internal:1080`

---

## 2. Run

From the project root (where `docker-compose.yml` lives):

```bash
docker compose up -d --build
```

- `--build` — rebuilds the image (needed on the first run and after updates).
- `-d` — run in the background.

Check that the container is up:

```bash
docker compose ps
docker compose logs -f tiktok-libre
```

Open in your browser: **http://localhost:3000** (or `http://SERVER-IP:3000`).

Stop:

```bash
docker compose down
```

---

## 3. Where data is stored

Two named volumes (see `docker-compose.yml`):

| Volume        | In container        | What it stores                                                    |
|---------------|---------------------|-------------------------------------------------------------------|
| `tiktok-db`   | `/app/db`           | SQLite database `custom.db` (subscriptions, videos, favorites, comments) |
| `tiktok-cache`| `/app/cache/videos` | Temporarily downloaded `.mp4` files (cleaned every `TIKTOK_CACHE_TTL_MIN` minutes) |

See where they live on disk:

```bash
docker volume inspect tiktok-libre_tiktok-db
docker volume inspect tiktok-libre_tiktok-cache
```

Wipe all data (careful — you'll lose subscriptions and favorites):

```bash
docker compose down -v
```

---

## 4. About DEMO_MODE

`DEMO_MODE=true` — the app serves built-in demo data and **does not** make any
real requests to TikTok. Handy for just previewing the UI without a proxy.

`DEMO_MODE=false` — the app reaches TikTok via `yt-dlp` + the SOCKS5 proxy.
**On the server this must be `false`**, with a working `TIKTOK_PROXY` configured.

> The default `.env` in the repo ships with `DEMO_MODE=true` (this is for local
> sandbox preview). Before launching on the server, make sure to switch it to
> `false`.

---

## 5. How to update yt-dlp

TikTok frequently changes its internal API, so `yt-dlp` needs to be updated.
The simplest way is to rebuild the image (it pulls a fresh `yt-dlp` via
`pip3 install` every time):

```bash
docker compose up -d --build
```

To force an update without rebuilding the whole image, you can shell into the
container and update the package, but **this change won't survive a rebuild**.
The correct path is to rebuild the image (above) or to pin a `yt-dlp` version
in the `Dockerfile` (`pip3 install ... yt-dlp==<version>`) if you need stability.

---

## 6. Port

By default the app listens on port **3000** inside the container and is mapped
to port `3000` on the host (`ports: "3000:3000"` in `docker-compose.yml`).

Change the host port (e.g. to 8080) without touching the image:

```yaml
ports:
  - "8080:3000"
```

For production it's recommended to put a reverse proxy (Caddy/Nginx) with TLS
in front of the container. An example `Caddyfile` is already in the project
root.

---

## 7. Environment variables

| Variable                 | Default                  | Description                                                          |
|--------------------------|--------------------------|----------------------------------------------------------------------|
| `DEMO_MODE`              | `false`                  | `true` — demo data; `false` — real requests via yt-dlp.              |
| `TIKTOK_PROXY`           | _(empty)_                | SOCKS5 proxy for yt-dlp (`socks5://user:pass@host:port`).            |
| `TIKTOK_CACHE_TTL_MIN`   | `10`                     | Lifetime of the temporary video cache, in minutes.                   |
| `TIKTOK_SOCKET_TIMEOUT`  | `30`                     | Timeout of a single yt-dlp request, in seconds.                      |
| `TIKTOK_RETRIES`         | `3`                      | Number of yt-dlp retries on network errors.                          |
| `DATABASE_URL`           | `file:/app/db/custom.db` | Path to the SQLite database (inside the container).                  |
| `TIKTOK_CACHE_DIR`       | `/app/cache/videos`      | Temporary video cache directory (inside the container).              |
| `NODE_ENV`               | `production`             | Node.js mode.                                                        |

Variables can be set in the `.env` file (picked up by compose automatically)
or passed via the shell:

```bash
TIKTOK_PROXY=socks5://user:pass@host:1080 docker compose up -d --build
```

---

## 8. Common issues

- **Container starts, but videos won't load.** Make sure `DEMO_MODE=false`
  and that `TIKTOK_PROXY` is set and working: `docker compose logs tiktok-libre |
  grep -i proxy`.
- **`bun install --frozen-lockfile` fails during build.** The local `bun.lock`
  is out of sync with `package.json`. Run `bun install` on the host, commit
  the updated `bun.lock`, then rebuild.
- **Host proxy not reachable from the container.** Use
  `host.docker.internal` instead of `127.0.0.1` (on Linux you may need the
  `--add-host=host.docker.internal:host-gateway` flag — already supported by
  modern Docker versions).
- **I want to reset the database.** `docker compose down -v && docker compose up -d --build`.
