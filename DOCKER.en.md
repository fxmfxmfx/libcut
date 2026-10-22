# Docker: libcut 2.0

See [README.md](README.md) for the complete setup. Existing installations should follow the [2.0 upgrade guide](docs/UPGRADING-2.0.md) and back up SQLite first.

```sh
cp .env.example .env
# Review DATA_MODE, DEMO_MODE, and TIKTOK_PROXY in .env.
docker compose up -d --build
docker compose logs -f libcut
```

The default is offline demo data at `http://127.0.0.1:3000`. For live data, set `DEMO_MODE=false` and configure a working proxy. Set `LIBCUT_BIND` to allow access from your trusted LAN; the application has no login system.

- Named volumes `libcut-db` and `libcut-cache` retain SQLite and downloaded media.
- Compose sets absolute paths `/app/db/custom.db` and `/app/cache/videos`; local development paths from `.env` are overridden.
- The image includes Chromium, yt-dlp, curl_cffi, and ffmpeg. The browser service listens only on `127.0.0.1:3040`.
- Startup applies the compatible schema with `prisma db push --skip-generate` before starting both services. Schema errors stop startup.
- Container health is checked through `/api/tiktok/status`.
- For a proxy on the Docker host, use `host.docker.internal`; for a separate proxy container, use its network service name. `127.0.0.1` inside the container refers to the container itself.

```sh
docker compose ps
docker compose restart libcut
docker compose down
```

`docker compose down` retains volumes. **`docker compose down -v` deletes the database and cache.** Do not use it for ordinary upgrades.

Client mode keeps personal state in browser localStorage, while shared public metadata and comments remain on the server. Export a JSON backup in Settings before changing origins or clearing site data. TikTok proxy requirements, captcha, and regional blocking can affect live search and comments even when the container is healthy.
