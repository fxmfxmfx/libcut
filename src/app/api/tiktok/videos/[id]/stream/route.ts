import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorJson } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { tiktokConfig } from "@/lib/tiktok/config";
import { tiktokProvider } from "@/lib/tiktok";
import { ensureLocalFile, streamLocalFile } from "@/lib/tiktok/stream";
import { demoLocalPathForUrl } from "@/lib/tiktok/demo";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/videos/[id]/stream
 * Stream the video for playback (range-aware).
 * - Real mode: ensure the file is cached locally (via yt-dlp+proxy), then stream it.
 * - Demo mode: stream the local public sample file directly.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureInitialized();
  const { id } = await ctx.params;
  const v = await db.video.findUnique({
    where: { id },
    select: { id: true, url: true, cachedPath: true },
  });
  if (!v) return errorJson("video not found", 404);

  // Demo mode: resolve the local sample file and stream it directly.
  if (tiktokConfig.demoMode) {
    try {
      const meta = await tiktokProvider.getVideoMeta(v.url);
      if (meta.streamUrl) {
        return streamLocalFile(demoLocalPathForUrl(meta.streamUrl), req);
      }
    } catch (e: any) {
      return errorJson(`stream failed: ${e?.message ?? String(e)}`, 502);
    }
    return errorJson("no playable source available in demo mode", 502);
  }

  // Real mode: ensure a local cached file (download via yt-dlp if needed), then stream.
  let localPath: string | null = null;
  try {
    localPath = await ensureLocalFile(v);
  } catch (e: any) {
    return errorJson(`Could not fetch video: ${e?.message ?? String(e)}`, 502);
  }
  if (localPath) {
    return streamLocalFile(localPath, req);
  }

  return errorJson(
    "Could not fetch the video file. Check your SOCKS5 proxy (TIKTOK_PROXY) and yt-dlp.",
    502,
  );
}
