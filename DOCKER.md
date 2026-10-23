# Docker: libcut 2.0

The complete guide is in [README.md](README.md). For an existing installation, first read [Upgrading to 2.0](docs/UPGRADING-2.0.md) and save a database backup.

```sh
cp .env.example .env
# Configure DATA_MODE, DEMO_MODE, and TIKTOK_PROXY in .env.
docker compose up -d --build
docker compose logs -f libcut
```

By default, the site is available only at `http://127.0.0.1:3000` and displays demo data. For live data, set `DEMO_MODE=false` and configure a working proxy. For a trusted LAN, set `LIBCUT_BIND`; built-in authentication is not available.

- SQLite is stored in the `libcut-db` volume; the media cache is stored in `libcut-cache`.
- Compose sets the absolute paths `/app/db/custom.db` and `/app/cache/videos`; local paths from `.env` are not used inside the container.
- Chromium, yt-dlp, curl_cffi, and ffmpeg are included in the image. The browser service listens only on `127.0.0.1:3040`.
- Before startup, `prisma db push --skip-generate` safely applies compatible schema updates. Startup stops if the schema update fails.
- Check container status at `/api/tiktok/status`.
- For a proxy running on the host, use `host.docker.internal`; for a separate proxy container, use its network name. `127.0.0.1` inside a container refers to that container itself.

```sh
docker compose ps
docker compose restart libcut
docker compose down
```

`docker compose down` preserves volumes. **`docker compose down -v` deletes the database and cache.** Do not run this command for a routine update.

In client mode, personal data remains in the browser's localStorage; shared metadata and comments are still stored on the server. Export a JSON backup through Settings before moving to another domain or clearing browser data. Proxies, captchas, and TikTok restrictions can affect search and comments regardless of whether the container is running correctly.
