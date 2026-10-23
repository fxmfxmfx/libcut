import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ensureInitialized } from "@/lib/tiktok/init";
import { errorJson } from "@/lib/tiktok/http";
import { fetchVideoMetadata } from "@/lib/tiktok/library";
import { streamLocalFile } from "@/lib/tiktok/stream";
import { ensureGalleryAudio, isAllowedGalleryAudioUrl } from "@/lib/tiktok/gallery-audio";

export const dynamic = "force-dynamic";

const refreshed = new Map<string, Promise<string | null>>();

async function refreshAudioUrl(id: string, videoUrl: string): Promise<string | null> {
  let pending = refreshed.get(id);
  if (!pending) {
    pending = fetchVideoMetadata(videoUrl).then(async (meta) => {
      if (!meta.isGallery || !meta.audioUrl || !isAllowedGalleryAudioUrl(meta.audioUrl)) return null;
      await db.video.update({ where: { id }, data: { streamUrl: meta.audioUrl, metadataFetchedAt: new Date() } });
      return meta.audioUrl;
    }).catch(() => null).finally(() => refreshed.delete(id));
    refreshed.set(id, pending);
  }
  return pending;
}

/** GET /api/tiktok/videos/[id]/audio — cached, range-aware gallery soundtrack. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureInitialized();
  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id }, select: { id: true, url: true, isGallery: true, streamUrl: true } });
  if (!video) return errorJson("video not found", 404);
  if (!video.isGallery) return errorJson("video has no gallery soundtrack", 404);

  let source = video.streamUrl && isAllowedGalleryAudioUrl(video.streamUrl) ? video.streamUrl : null;
  if (!source) source = await refreshAudioUrl(video.id, video.url);
  if (!source) return errorJson("no gallery soundtrack available", 404);

  try {
    let cached = await ensureGalleryAudio(video.id, source);
    // TikTok CDN URLs expire. Refresh metadata once, then retry the download.
    try {
      const response = await streamLocalFile(cached.path, req, { mime: cached.mime });
      if (response.status !== 404) return response;
    } catch { /* stale cached file or invalid cache */ }
    cached = await ensureGalleryAudio(video.id, source);
    const response = await streamLocalFile(cached.path, req, { mime: cached.mime });
    if (response.status !== 404) return response;
  } catch {
    const fresh = await refreshAudioUrl(video.id, video.url);
    if (fresh && fresh !== source) {
      try {
        const cached = await ensureGalleryAudio(video.id, fresh);
        return await streamLocalFile(cached.path, req, { mime: cached.mime });
      } catch { /* return a stable upstream error below */ }
    }
    return errorJson("Could not fetch gallery soundtrack", 502);
  }
  return errorJson("Could not read cached gallery soundtrack", 502);
}
