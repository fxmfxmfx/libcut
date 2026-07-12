/**
 * Unified TikTok provider: picks the real yt-dlp provider or the demo provider
 * based on `tiktokConfig.demoMode`.
 */

import { tiktokConfig } from "./config";
import { YtDlpProvider } from "./ytdlp";
import { DemoProvider } from "./demo";
import type { TikTokProvider } from "./types";

export const tiktokProvider: TikTokProvider = tiktokConfig.demoMode
  ? new DemoProvider()
  : new YtDlpProvider();

export { tiktokConfig } from "./config";
export { startCacheCleanup, ensureCacheDir, cachePathFor, markCached, evictCached } from "./cache";
export * from "./types";
