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
  const v = await db.video.findUnique({
    where: { id },
    include: { author: true, favorites: { select: { id: true } } },
  });
  if (!v) return errorJson("video not found", 404);

  // In real mode, only fetch full meta if we don't already have a cached
  // streamUrl / avatar in the DB (avoids a slow yt-dlp call on every open).
  let streamUrl: string | null = null;
  let images: string[] | null = v.images ? JSON.parse(v.images) : null;
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
  } else if (!v.streamUrl) {
    // Real mode: fetch meta once and cache streamUrl + author info in DB.
    try {
      const meta = await tiktokProvider.getVideoMeta(v.url);
      if (meta.isGallery) {
        isGallery = true;
        images = meta.images ?? images;
        await db.video.update({
          where: { id: v.id },
          data: {
            isGallery: true,
            images: meta.images ? JSON.stringify(meta.images) : null,
          },
        });
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

  const isFavorited = v.favorites.length > 0;

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
      seen: v.seen,
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
      subscribed: v.author.subscribed,
    },
  });
}

/**
 * PATCH /api/tiktok/videos/[id]
 * Body: { seen?: boolean }
 * Mark a video as seen (so it leaves the feed).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureInitialized();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const data: { seen?: boolean; seenAt?: Date | null } = {};
  if (typeof body.seen === "boolean") {
    data.seen = body.seen;
    data.seenAt = body.seen ? new Date() : null;
  }
  const updated = await db.video.update({ where: { id }, data });
  return json({ ok: true, seen: updated.seen });
}
