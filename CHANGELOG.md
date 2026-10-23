# Changelog

## 2.0.0 — 2026-10-23

Version 2.0.0 is a major update to the player, browsing experience, client preferences, and media backend. Compared with the previous version, it adds a continuous swipe feed and shared player for video collections, improves TikTok search and comments, makes playback more responsive, and gives users more control over browser-local data and appearance.

### Player and browsing

- Add a full-height vertical feed with touch swipes, native scroll snapping, keyboard controls, desktop navigation, stable queues, seeking, favorites, watched controls, downloads, and feed volume controls.
- Use the same vertical player for feed, search results, favorites, and creator profiles. Keep only nearby pages mounted and one video decoder active; release media resources when leaving a post to reduce memory use on phones.
- Redesign the phone player with full-height video, transparent lower actions and captions, a compact volume control, and a subtle bottom seek bar. Arrange desktop metadata and actions beside the video, with a thin seek bar along the bottom.
- Keep desktop comments beside the player without dimming the screen or pausing video. Keep phone comments in a sheet. Move player controls outside the video rectangle so browser Picture-in-Picture overlays are less likely to cover them.
- Replace instant photo changes with a horizontal gallery carousel featuring touch scrolling, desktop and keyboard controls, progress indicators, stable framing, bounded image loading, adjacent-photo preloading, and per-image retry.
- Play gallery soundtracks when TikTok provides them. Cache audio through a proxy-backed endpoint, share saved volume and mute preferences, toggle music by tapping a photo, continue audio across slides, and stop it when leaving the post.
- Start gallery playback toggles on touch release, distinguish taps from swipe gestures, and avoid duplicate pause/play cycles. Ignore stale playback promises after pausing or leaving a post.
- Add Space/K playback shortcuts, delayed buffering feedback, and a small orange shield favicon.

### Search, comments, and TikTok data

- Add local-library search alongside live TikTok search. Put exact or close creator matches before video results; otherwise show videos first. Forward the selected search type to the browser-backed search service.
- Wait for real search results after TikTok's empty bootstrap responses, avoid caching upstream failures as successful empty searches, and provide retry for transient busy responses.
- Fetch public comments through the configured proxy before using Chromium. Improve browser fallback readiness and CAPTCHA reporting; load comment replies on demand with pagination, duplicate filtering, and independent retry controls.
- Queue browser-service requests, return comments after the first valid batch, and retain visible comments while refreshing. Bound concurrent scraping and search work.
- Cache live search results and public video/creator metadata in the server database. Keep the viewing queue stable when watched state changes and load more local-feed pages with a stable cursor.

### Playback speed and reliability

- Start media loading from feed, profile, and search cards while metadata refreshes. Coalesce concurrent detail requests, cap upstream metadata work, cancel abandoned client requests, and avoid redundant detail fetches after marking a video watched.
- Warm the next video's server cache after the current media is ready without creating another video decoder. Skip warming on data-saving connections and keep playback on the same stream endpoint.
- Add range-aware video streaming and downloads, including seeking and resumable byte ranges. Stream cached files in bounded chunks and handle cancelled requests without writing to closed streams.
- Add optional per-browser audio normalization using FFmpeg. It is off by default; enabling it can delay first playback while the full audio track is processed. Cache processed audio, copy rather than re-encode video, bound processing concurrency and queue time, preserve original downloads, and fall back to original audio if processing fails.
- Save volume and mute preferences across reloads, feed navigation, and individual video playback; enable sound by default.
- Bound and coalesce TikTok/media work, improve proxy routing and error reporting, and run the browser service on Node.js to avoid Bun HTTP CONNECT issues. Provide writable Chromium configuration/cache directories for systemd deployments.

### Client preferences, data, and interface

- Use English throughout the interface and repository documentation. Remove the language switcher, and normalize legacy Russian locale preferences to English without discarding other saved settings.
- Keep client-mode subscriptions, favorites, watched state, and preferences in browser storage; support versioned JSON backup export/import and stable TikTok video identity for saved items.
- Migrate existing `libcut.*` browser preference keys and hydrate settings before applying them. Preserve malformed or blocked browser storage where possible and report errors instead of silently clearing data.
- Store theme, accent color, and custom CSS in the current browser in both data modes, without reading or writing shared appearance settings. Reject external resource URLs and `@import` in custom CSS.
- Keep feed title and refresh controls in the search toolbar. Improve phone controls, comments access, author links, and player interactions around browser Picture-in-Picture overlays.

### Deployment, dependencies, and checks

- Update Next.js, React, Prisma, Zustand, Puppeteer, and related dependencies; remove unused template packages; add type checks, regression tests, browser checks, and CI.
- Replace the tracked `.env` template with `.env.example`; keep a private copy of an existing `.env` during upgrades.
- Bind Compose to loopback by default and supervise both services. Restrict the optional Caddy configuration from accepting arbitrary upstream ports through query parameters.
- Apply the Prisma schema to SQLite with `prisma db push` during Docker startup.

Live TikTok requests remain subject to TikTok availability, proxy behavior, CAPTCHA, and other upstream restrictions. Demo-mode checks do not establish that live search or comments will work in every deployment. Client mode keeps personal state in browser storage while public metadata and caches remain server-side; the app does not claim hardened multi-user isolation.
