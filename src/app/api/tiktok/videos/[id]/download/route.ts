import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorJson } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { tiktokConfig } from "@/lib/tiktok/config";
import { tiktokProvider } from "@/lib/tiktok";
import { downloadFilename, ensureLocalFile, streamLocalFile } from "@/lib/tiktok/stream";
import { demoLocalPathForUrl } from "@/lib/tiktok/demo";

export const dynamic = "force-dynamic";

/** Download a video as an attachment, using the same cached file as playback. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureInitialized();
  const { id } = await ctx.params;
  const video = await db.video.findUnique({
    where: { id },
    select: {
      id: true,
      tiktokId: true,
      title: true,
      url: true,
      cachedPath: true,
      author: { select: { username: true } },
    },
  });
  if (!video) return errorJson("video not found", 404);

  const filename = downloadFilename(video);
  try {
    let localPath: string | null = null;
    if (tiktokConfig.demoMode) {
      const meta = await tiktokProvider.getVideoMeta(video.url);
      if (!meta.streamUrl) return errorJson("no downloadable source available", 422);
      localPath = demoLocalPathForUrl(meta.streamUrl);
    } else {
      localPath = await ensureLocalFile(video);
    }
    if (!localPath) return errorJson("no downloadable source available", 502);
    return await streamLocalFile(localPath, req, {
      asAttachment: true,
      filename,
      mime: "video/mp4",
    });
  } catch (e: any) {
    return errorJson(`Could not fetch video: ${e?.message ?? String(e)}`, 502);
  }
}
