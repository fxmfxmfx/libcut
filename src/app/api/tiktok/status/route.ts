import { NextRequest } from "next/server";
import { json, errorJson } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { tiktokConfig, getEffectiveProxy } from "@/lib/tiktok/config";

export const dynamic = "force-dynamic";

/** GET /api/tiktok/status — app config + triggers init. */
export async function GET(_req: NextRequest) {
  try { await ensureInitialized(); }
  catch { return errorJson("Database or cache is not ready. Check server configuration and database setup.", 503); }
  const proxy = await getEffectiveProxy();
  return json({
    demoMode: tiktokConfig.demoMode,
    proxyConfigured: !!proxy,
    cacheTtlMin: tiktokConfig.cacheTtlMs / 60000,
    ytdlpPath: tiktokConfig.ytdlpPath,
    dataMode: tiktokConfig.dataMode,
  });
}
