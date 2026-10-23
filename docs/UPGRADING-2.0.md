# Upgrading to Libcut 2.0

## Before Upgrading

1. Back up the SQLite database. With Docker Compose, stop the application, then copy the file from the volume:

   ```sh
   docker compose stop libcut
   mkdir -p backup
   docker cp libcut:/app/db/custom.db ./backup/custom.db.pre-2.0
   ```

   The container must still exist so `docker cp` can read its volume. Do not use `docker compose down -v`: this command deletes the named volumes containing the database and cache.

2. Save `.env` outside the repository before `git pull`, for example with `cp .env ../libcut-env.pre-2.0`. In 2.0, this file is excluded from Git; after updating, restore it with `cp ../libcut-env.pre-2.0 .env`. Preserve the `DATA_MODE`, `DEMO_MODE`, and `TIKTOK_PROXY` values. Make sure you do not change the database directory or named volume.

3. If the previous version can export a client backup, download one through **Settings → Export backup**. Older builds may not have this feature: after starting 2.0, export the data through Settings immediately, before clearing browser data or changing browsers/domains. Client settings and subscriptions are stored in localStorage for that specific browser and origin.

## Docker Compose

From the project directory, run:

```sh
docker compose up -d --build
docker compose logs -f libcut
```

At startup, the container runs `prisma db push --skip-generate` and applies the current schema to SQLite before Next.js starts. In 2.0, the port is bound to `127.0.0.1` by default. To allow access from a trusted LAN, set `LIBCUT_BIND` in `.env`.

Wait for the application startup message. Open the site and check subscriptions, favorites, and the feed. In client mode, import the JSON backup through Settings if you need to restore or move data.

To run without Docker, install dependencies from the lockfile, update the local schema, and build the application:

```sh
bun install --frozen-lockfile
bun run db:generate
bun run db:push
bun run build
bun run start
```

Back up the SQLite file specified by `DATABASE_URL` before running `db:push`.

## Data and Operating Modes

- In `local` mode, personal data is stored in SQLite. Docker Compose stores the database in the named `libcut-db` volume at `/app/db/custom.db`; downloaded media files are stored separately in `libcut-cache`.
- In `client` mode, subscriptions, favorites, viewed items, and user settings are stored in the browser's localStorage. Use Settings to create or import a JSON backup. Do not clear site data until you have saved any backup you need.
- Client mode does not mean the server stores nothing: public author and video information, as well as the search cache, are stored in the shared server database.
- The application is intended for local use on a trusted network and does not provide authentication. Do not expose it to an untrusted or public network as a multi-user service.

## TikTok and Checks

Search in the local library works independently of TikTok; live search, comments, and fetching new data depend on TikTok availability, proxy settings, and possible captchas or blocks. Successful checks in demo mode do not guarantee that live requests will work on a particular network. If live features do not work, check `TIKTOK_PROXY` and the container logs.
