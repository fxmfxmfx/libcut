# Changelog

## 2.0.0 — 2026-10-22

Libcut 2.0 refreshes the client experience, improves media delivery, and updates the application dependency stack.

### Added

- Export and import a versioned JSON backup of client subscriptions, favorites, watched videos, and preferences. Client favorites retain optional video and gallery metadata.
- Stable TikTok video identity for watched and favorite state, so those entries continue to match if a database row ID changes. Watched state can be updated in batches.
- Immediate local-library search alongside live TikTok search. Live keyword search uses the browser-backed signing service; results and public video/author metadata are also cached in the server database.
- Range-aware video playback and downloads, including seeking and resumable byte-range requests.
- Mobile-friendly comments controls and a dedicated comments view in the video player.

### Fixed and improved

- Client preferences, including automatic watched marking, hydrate before settings are applied and persist across reloads. Existing `libcut.*` browser preference keys are migrated without discarding their values.
- Client-mode personal state remains in browser storage; malformed or blocked storage is reported and preserved where possible rather than silently cleared.
- TikTok and media work now has bounded concurrency and request coalescing. The comments browser service also limits concurrent scrapes and search results.
- TikTok proxy handling and comment/search extraction were revised for more reliable browser-backed requests.

### Deployment and dependencies

- Updated Next.js, React, Prisma, Zustand, Puppeteer, and related dependencies; removed unused template packages; added type checks, regression tests, browser checks, and CI.
- Removed the tracked `.env` template in favor of `.env.example`; keep a private copy of an existing `.env` during upgrades.
- Compose now binds to loopback by default and supervises both services. The optional Caddy configuration no longer accepts arbitrary upstream ports from query parameters.
- Docker startup applies the Prisma schema to SQLite with `prisma db push` before starting the app.

Live TikTok requests remain subject to TikTok availability, proxy behavior, and captcha or other upstream blocking. Demo-mode checks do not establish that live TikTok search or comments will work in every deployment. Client mode keeps personal state in localStorage but still uses the server database for shared public metadata and cache; the app does not claim hardened multi-user isolation.
