# libcut 2.0 Audit and Verification

Storage of client/local data, the TikTok API, search, the player, comments, media delivery, configuration, and the build were reviewed. This report describes the scenarios examined and defects found; it does not guarantee that all possible issues are absent.

## Update: Responsiveness and Audio — 2026-10-23

- The player loads the video stream without waiting for TikTok metadata; detail requests are coalesced and upstream work is limited. When importing an author's videos, existing IDs are read in one query instead of checking each video separately.
- Added a saved audio normalization setting, FFmpeg processing that copies the video track, and a cache of processed files. Processing is enabled manually in Settings; there is one worker process, a bounded queue and wait time, and a fallback to the original audio if processing fails.
- Browser checks found a FileHandle leak when a client disconnected. The stream now closes the file descriptor when the body is cancelled or the request is aborted; HEAD does not open a body. A repeated full run did not show the earlier exceptions.
- Checks: 48 application unit tests and 5 search parsing tests passed; Playwright: 17 passed, 3 skipped based on data mode. Linter, TypeScript, and production build passed. Browser scenarios use Chromium at mobile and desktop viewport sizes; this is not a test on a physical iPhone.
- One real cached video was checked on the homelab: the first Range request with audio processing took 1227 ms, the repeat took 9 ms; both returned 206 and the `X-Libcut-Audio: normalized` header. This is a single measurement, not an estimate for all videos or network conditions. The client bundle served is the same as the local build.

## Update: Photos and Preparing the Next Video

- The photo gallery was fully replaced: native horizontal snapping, a counter and compact indicators, keyboard and desktop buttons, position preservation on window resize, loading of the current and adjacent images, and retry on error. The frame size remains stable when switching between photos with different aspect ratios.
- Once the current media is ready, the next video stream is requested in the background with the `bytes=0-0` range. This pre-fills the server cache without a second video decoder; bandwidth saving, slow connections, and a hidden tab are taken into account. The first uncached video still waits for a download through TikTok/the proxy.
- Found and fixed the photo counter moving backward during smooth scrolling with the buttons. Checked real horizontal and vertical touch gestures in Chromium, image error handling, and the limit on the number of photos loaded.
- Final checks: 49 unit tests passed, Playwright: 21 passed, 3 skipped based on mode; ESLint, TypeScript, and production build passed.

## Update: Photo Post Music

- Added an audio track for the gallery through the server cache and configured proxy. Shared volume and mute settings are retained; tapping and pressing Space toggle music, and horizontal swipes do not interrupt it. The audio stream is released when leaving the post.
- Adjacent photos load eagerly, with priority given to the current frame; no more than three images remain in the DOM at once.
- Checks: 51 unit tests and 21 browser scenarios passed; 3 scenarios were skipped based on mode. On a real photo post on the homelab, the audio route returned an MP3 with 206; the browser decoded the track, a tap paused and resumed it, and there were no page errors. Personal server-side view records were not changed during the live check.

## Fixed Issues

| Area | Defect in the original version | Fix |
| --- | --- | --- |
| Client settings | Server values could be applied before DATA_MODE loaded; autoMarkSeen was not saved | Load the mode before synchronization, migrate old keys, and save all preferences |
| Storage | Read/write errors were not explained to the user; tabs overwrote stale state | Validate formats, show error messages, export original corrupted data, and synchronize tabs |
| Client feed | Author GET returned stale videos; every viewed-state change fetched all subscriptions again | Refresh the public cache, use a separate feed query cache, and filter viewed videos locally |
| Video statuses | Manual marking in client mode changed the server database; components subscribed to an unchanged checking function | Use local actions and reactive arrays, with compatibility for old IDs and stable TikTok IDs |
| Search | scrapeSearch was a stub; live videos did not always have an existing ID | Add signed browser search, fast search in the user's library, duplicate removal, and persistence of public metadata |
| Phone | Comments depended on several nested scroll areas | Add video/comments switching, accessible scrolling and closing, and safe-area spacing |
| Media | No download route existed; suffix and invalid Range requests were handled incorrectly | Add an attachment route, 206/416 handling, backpressure, and shared atomic file downloads |
| Backend | Blocking curl, unlimited parallel tasks, and partial comment replacement | Use asynchronous processes, queues and deduplication, limits/timeouts, and transactional replacement |
| Proxy | Chromium skipped URLs with credentials and ignored runtime configuration | Add a loopback proxy-chain bridge, pass the current proxy to the service, and prevent silent bypass |
| Isolation | Client API could read/change shared personal data; settings response included the proxy password | Block server-side personal APIs in client mode, mask secrets, and search browser data locally |
| Deployment | Caddy accepted an upstream port from the query; no coordinated standalone startup | Remove arbitrary port forwarding, default to loopback, and supervise both processes and readiness |
| Cache and metadata | Metadata was extracted again on every open and files could exist without database records | Add metadata TTL and clean up orphaned files with a grace period for active downloads |

## Checks

- `bun run check`: ESLint, TypeScript, and 33 regression tests for the main application.
- In `mini-services/tiktok-comments`: `bun run typecheck` and `bun run test` — 5 tests for parsing search responses.
- `bun run test:upgrade`: a real upgrade of a temporary SQLite database from the old schema preserves subscriptions, viewed status, favorites, and settings.
- `bun run build`: standalone Next.js production build.
- `bun run test:e2e`: four applicable browser scenarios on temporary databases; client/local search → profile → player → mobile comments → download, client data persistence, and tab synchronization. Two repetitions of client-only scenarios in the local project are intentionally skipped.
- Chromium/Puppeteer starts; the service rejects non-TikTok and local URLs, as well as invalid parameters.
- Live check without a proxy on the current network: search for `coffee` returned 12 videos; author search returned 10 authors. The live search handler saved 12 videos to a separate SQLite database without creating server subscriptions. This was a one-time check, not a guarantee of availability from another network.
- On selected live videos, TikTok showed “Video currently unavailable” / did not return the comments API. Error handling was checked; successful loading of live comments on this network was not confirmed. Mobile display was checked with demo comments.

Docker is not installed locally. [The first image build passed in CI](https://github.com/fxmfxmfx/libcut/actions/runs/39725236121/job/119647507512). [Running the ready container and checking both services, the feed, and downloads also passed](https://github.com/fxmfxmfx/libcut/actions/runs/39725591478). Video search is included in the next check; the latest result is available in the Actions tab. The local entrypoint check is limited to shell syntax. CI runs the application checks and browser scenarios.

## Dependencies and Remaining Limitations

The original main project lockfile had 111 advisories. After updates and removal of unused packages, `bun audit` reports **two high-severity advisories**: `braces` in the ESLint dependency chain and `deepmerge-ts` in the Prisma CLI. They remain in build/schema management tools; do not provide them with untrusted configuration. A compatible update does not remove these two dependencies; no forced major-version change was made just to suppress the report. The browser service audit found no vulnerabilities at the time of review.

The application has no authentication. `local` mode is intended for a trusted network. In `client` mode, personal state stays in the browser, while public metadata, comments, and the media cache remain shared. This is not a fully isolated multi-user hosting service.

Live features depend on region, captcha, TikTok availability, the proxy, and current yt-dlp/Chromium versions. Short TikTok links still need to be expanded to their full URL manually. The application cannot restore deleted videos or browser data lost without a backup.
