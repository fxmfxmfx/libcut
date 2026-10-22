import { requireLocalMode } from "@/lib/tiktok/access";
import { canonicalVideoUrl } from "@/lib/tiktok/http";
import { storeVideoMeta, withUpstreamSlot } from "@/lib/tiktok/library";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { tiktokProvider } from "@/lib/tiktok";
import { tiktokConfig } from "@/lib/tiktok/config";
import { proxyImage } from "@/lib/tiktok/images";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/videos/[id]
 * Video details + author + favorite state + playable source.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureInitialized();
  const { id } = await ctx.params;
  let v = await db.video.findFirst({
    where: { OR: [{ id }, { tiktokId: id }] },
    include: { author: true, favorites: { select: { id: true } } },
  });
  if (!v) {
    const url = canonicalVideoUrl(_req.nextUrl.searchParams.get("url") ?? "");
    if (url && url.split("/").pop() === id) {
      try {
        const row = await withUpstreamSlot(async () => storeVideoMeta(await tiktokProvider.getVideoMeta(url)));
        v = await db.video.findUnique({ where: { id: row.id }, include: { author: true, favorites: { select: { id: true } } } });
      } catch { return errorJson("Could not restore video from TikTok", 502); }
    }
    if (!v) return errorJson("video not found", 404);
  }

  // In real mode, only fetch full meta if we don't already have a cached
  // streamUrl / avatar in the DB (avoids a slow yt-dlp call on every open).
  let streamUrl: string | null = null;
  let images: string[] | null = null;
  try { const parsed = v.images ? JSON.parse(v.images) : null; images = Array.isArray(parsed) ? parsed.filter((url): url is string => typeof url === "string") : null; } catch { /* preserve playable video despite malformed gallery metadata */ }
  let isGallery = v.isGallery;
  let authorDisplayName = v.author.displayName;
  let authorAvatarUrl = v.author.avatarUrl;

  if (tiktokConfig.demoMode) {
    try {
      const meta = await tiktokProvider.getVideoMeta(v.url);
      streamUrl = meta.streamUrl;
      if (meta.authorDisplayName && meta.authorDisplayName !== authorDisplayName) {
        authorDisplayName = meta.authorDisplayName;
        await db.author.update({ where: { id: v.author.id }, data: { displayName: meta.authorDisplayName } });
      }
      if (meta.authorAvatarUrl && meta.authorAvatarUrl !== v.author.avatarUrl) {
        authorAvatarUrl = meta.authorAvatarUrl;
        await db.author.update({ where: { id: v.author.id }, data: { avatarUrl: meta.authorAvatarUrl } });
      }
    } catch {
      // fall back to /stream
    }
  } else if (!v.metadataFetchedAt || Date.now() - v.metadataFetchedAt.getTime() > 60 * 60_000) {
    // Real mode: fetch meta once and cache streamUrl + author info + stats in DB.
    try {
      const meta = await tiktokProvider.getVideoMeta(v.url);
      // Update video stats + gallery info in one query.
      const updateData: any = { metadataFetchedAt: new Date() };
      if (typeof meta.isGallery === "boolean") {
        isGallery = meta.isGallery;
        images = isGallery ? meta.images ?? images : null;
        updateData.isGallery = isGallery;
        updateData.images = images ? JSON.stringify(images) : null;
      }
      if (meta.viewCount > 0) updateData.viewCount = meta.viewCount;
      if (meta.likeCount > 0) updateData.likeCount = meta.likeCount;
      if (meta.commentCount > 0) updateData.commentCount = meta.commentCount;
      if (meta.shareCount > 0) updateData.shareCount = meta.shareCount;
      if (meta.thumbnailUrl) updateData.thumbnailUrl = meta.thumbnailUrl;
      if (meta.duration > 0) updateData.duration = meta.duration;
      if (Object.keys(updateData).length > 0) {
        v = { ...v, ...await db.video.update({ where: { id: v.id }, data: updateData }) };
      }
      if (meta.authorDisplayName && meta.authorDisplayName !== v.author.displayName) {
        authorDisplayName = meta.authorDisplayName;
        await db.author.update({ where: { id: v.author.id }, data: { displayName: meta.authorDisplayName } });
      }
      if (meta.authorAvatarUrl && meta.authorAvatarUrl !== v.author.avatarUrl) {
        authorAvatarUrl = meta.authorAvatarUrl;
        await db.author.update({ where: { id: v.author.id }, data: { avatarUrl: meta.authorAvatarUrl } });
      }
    } catch {
      // meta fetch may fail; keep DB values
    }
  }

  const isFavorited = tiktokConfig.dataMode === "local" && v.favorites.length > 0;

  return json({
    video: {
      id: v.id,
      tiktokId: v.tiktokId,
      url: v.url,
      title: v.title,
      description: v.description,
      thumbnailUrl: proxyImage(v.thumbnailUrl),
      duration: v.duration,
      width: v.width,
      height: v.height,
      viewCount: v.viewCount,
      likeCount: v.likeCount,
      commentCount: v.commentCount,
      shareCount: v.shareCount,
      publishedAt: v.publishedAt,
      seen: tiktokConfig.dataMode === "local" && v.seen,
      cached: !!v.cachedPath,
      streamUrl,
      isGallery,
      images: images ? images.map(proxyImage) : null,
      isFavorited,
      streamSrc: `/api/tiktok/videos/${v.id}/stream`,
      downloadSrc: `/api/tiktok/videos/${v.id}/download`,
    },
    author: {
      id: v.author.id,
      username: v.author.username,
      displayName: authorDisplayName,
      avatarUrl: proxyImage(authorAvatarUrl),
      description: v.author.description,
      followerCount: v.author.followerCount,
      subscribed: tiktokConfig.dataMode === "local" && v.author.subscribed,
    },
  });
}

/**
 * PATCH /api/tiktok/videos/[id]
 * Body: { seen?: boolean }
 * Mark a video as seen (so it leaves the feed).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireLocalMode(req);
  if (denied) return denied;
  await ensureInitialized();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body.seen !== "boolean") return errorJson("seen must be a boolean", 400);
  if (!await db.video.findUnique({ where: { id }, select: { id: true } })) return errorJson("video not found", 404);
  const data: { seen?: boolean; seenAt?: Date | null } = {};
  if (typeof body.seen === "boolean") {
    data.seen = body.seen;
    data.seenAt = body.seen ? new Date() : null;
  }
  const updated = await db.video.update({ where: { id }, data });
  return json({ ok: true, seen: updated.seen });
}
