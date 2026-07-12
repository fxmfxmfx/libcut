import { NextRequest } from "next/server";
import { json } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { tiktokConfig, getEffectiveProxy } from "@/lib/tiktok/config";

export const dynamic = "force-dynamic";

/** GET /api/tiktok/status — app config + triggers init. */
export async function GET(_req: NextRequest) {
  await ensureInitialized();
  const proxy = await getEffectiveProxy();
  return json({
    demoMode: tiktokConfig.demoMode,
    proxyConfigured: !!proxy,
    cacheTtlMin: tiktokConfig.cacheTtlMs / 60000,
    ytdlpPath: tiktokConfig.ytdlpPath,
  });
}
