/**
 * One-time app init: seed demo data + start the cache cleanup loop.
 * Safe to call repeatedly; runs at most once per process.
 */

import { db } from "@/lib/db";
import { seedDemoData } from "./seed";
import { startCacheCleanup, ensureCacheDir } from "./cache";
import { tiktokConfig } from "./config";

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      await db.setting.count();
      await ensureCacheDir();
      startCacheCleanup();
      if (tiktokConfig.demoMode) {
        try {
          await seedDemoData();
        } catch (e) {
          // Seeding must never block the app.
          console.error("[tiktok] demo seed failed:", e);
        }
      }
      initialized = true;
    })().catch((error) => { initPromise = null; throw error; });
  }
  await initPromise;
}
