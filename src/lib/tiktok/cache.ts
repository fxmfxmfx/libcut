/**
 * Temp video cache manager.
 *
 * Videos are downloaded on demand to `tiktokConfig.cacheDir` and their path is
 * stored on the Video row (`cachedPath` / `cachedAt`). A background timer runs
 * every minute and evicts (deletes) any cached file whose `cachedAt` is older
 * than `cacheTtlMs` (default 10 minutes), clearing the DB fields. The DB
 * metadata is preserved so the video still shows up in the UI — it just gets
 * re-downloaded the next time the user plays it.
 */

import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { tiktokConfig } from "./config";

let cleanupTimer: NodeJS.Timeout | null = null;

/** Ensure the cache directory exists. */
export async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(tiktokConfig.cacheDir, { recursive: true });
  } catch {
    // ignore
  }
}

/** Build a safe file path for a cached video. */
export function cachePathFor(videoId: string, ext = "mp4"): string {
  return path.join(tiktokConfig.cacheDir, `${videoId}.${ext}`);
}

/** Record that a video is now cached at the given path. */
export async function markCached(videoId: string, filePath: string): Promise<void> {
  await db.video.update({
    where: { id: videoId },
    data: { cachedPath: filePath, cachedAt: new Date() },
  });
}

/** Delete the cached file for a video and clear its DB fields. */
export async function evictCached(videoId: string): Promise<void> {
  const v = await db.video.findUnique({ where: { id: videoId }, select: { cachedPath: true } });
  if (v?.cachedPath) {
    try {
      await fs.unlink(v.cachedPath);
    } catch {
      // file may already be gone
    }
  }
  await db.video.update({
    where: { id: videoId },
    data: { cachedPath: null, cachedAt: null },
  });
}

/** One cleanup pass: evict every cached file older than the TTL. */
export async function cleanupCacheOnce(): Promise<number> {
  const cutoff = new Date(Date.now() - tiktokConfig.cacheTtlMs);
  const stale = await db.video.findMany({
    where: { cachedAt: { lt: cutoff }, cachedPath: { not: null } },
    select: { id: true, cachedPath: true },
  });
  await Promise.all(
    stale.map(async (v) => {
      if (v.cachedPath) {
        try {
          await fs.unlink(v.cachedPath);
        } catch {
          // ignore
        }
      }
    }),
  );
  if (stale.length > 0) {
    await db.video.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { cachedPath: null, cachedAt: null },
    });
  }
  return stale.length;
}

/** Start the periodic cleanup loop (every 1 minute). Idempotent. */
export function startCacheCleanup(): void {
  if (cleanupTimer) return;
  // Run a pass immediately, then every minute.
  cleanupTimer = setInterval(
    () => {
      cleanupCacheOnce().catch(() => {
        // swallow errors so the timer keeps running
      });
    },
    60 * 1000,
  );
  // Don't keep the process alive just for cleanup.
  if (cleanupTimer && typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
  }
  cleanupCacheOnce().catch(() => {});
}
