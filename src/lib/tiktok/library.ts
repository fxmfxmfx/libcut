import { db } from "@/lib/db";
import { tiktokProvider } from "./index";
import { tiktokConfig } from "./config";
import { proxyImage } from "./images";
import { canonicalVideoUrl, cleanUsername } from "./http";
import type { AuthorVideo, VideoMeta } from "./types";
import type { Author, Video } from "@prisma/client";

export function serializeVideo(v: Video) {
  let images: string[] | null = null;
  try { images = v.images ? JSON.parse(v.images) : null; } catch { /* old invalid metadata */ }
  return {
    id: v.id, tiktokId: v.tiktokId, url: v.url, title: v.title,
    description: v.description, thumbnailUrl: proxyImage(v.thumbnailUrl),
    duration: v.duration, width: v.width, height: v.height,
    viewCount: v.viewCount, likeCount: v.likeCount, commentCount: v.commentCount,
    shareCount: v.shareCount, publishedAt: v.publishedAt,
    seen: tiktokConfig.dataMode === "local" && v.seen,
    isGallery: v.isGallery, images: Array.isArray(images) ? images.filter((url): url is string => typeof url === "string").map(proxyImage) : null,
  };
}

export function serializeAuthor(a: Author) {
  return {
    id: a.id, username: a.username, displayName: a.displayName,
    avatarUrl: proxyImage(a.avatarUrl), description: a.description,
    followerCount: a.followerCount, followingCount: a.followingCount,
    heartCount: a.heartCount, videoCount: a.videoCount,
    lastCheckedAt: a.lastCheckedAt,
    subscribed: tiktokConfig.dataMode === "local" && a.subscribed,
  };
}

export async function storeVideos(authorId: string, videos: AuthorVideo[], seen = false) {
  let newVideos = 0;
  for (const v of videos) {
    const where = { authorId_tiktokId: { authorId, tiktokId: v.tiktokId } };
    const before = await db.video.findUnique({ where, select: { id: true } });
    const { images, isGallery } = v;
    // Search results carry extra author fields. Only model columns may reach
    // Prisma, even when callers pass a structural subtype of AuthorVideo.
    const metadata = {
      tiktokId: v.tiktokId, url: v.url, title: v.title,
      description: v.description, thumbnailUrl: v.thumbnailUrl,
      duration: v.duration, width: v.width, height: v.height,
      viewCount: v.viewCount, likeCount: v.likeCount,
      commentCount: v.commentCount, shareCount: v.shareCount,
      publishedAt: v.publishedAt,
    };
    await db.video.upsert({
      where,
      create: { ...metadata, authorId, seen, seenAt: seen ? new Date() : null, isGallery: isGallery ?? false, images: images ? JSON.stringify(images) : null },
      update: {
        ...metadata,
        // Flat/search metadata omits dates and dimensions; do not erase the
        // known publication order or richer profile metadata on a refresh.
        title: v.title ?? undefined, description: v.description ?? undefined,
        thumbnailUrl: v.thumbnailUrl ?? undefined,
        publishedAt: v.publishedAt ?? undefined,
        width: v.width || undefined, height: v.height || undefined,
        duration: isGallery ? 0 : v.duration || undefined,
        ...(isGallery !== undefined ? { isGallery } : {}), ...(images?.length ? { images: JSON.stringify(images) } : {}) },
    });
    if (!before) newVideos++;
  }
  return newVideos;
}

// Coalesce checks, limit expensive upstream work, and cache recent results.
const checks = new Map<string, Promise<{ newVideos: number; totalChecked: number; authorId: string; offset: number }>>();
export function invalidateLibraryChecks() { recentChecks.clear(); }
const recentChecks = new Map<string, { until: number; result: { newVideos: number; totalChecked: number; authorId: string; offset: number } }>();
let active = 0;
const waiters: (() => void)[] = [];
export async function withUpstreamSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= 3) {
    if (waiters.length >= 100) throw new Error("Server is busy. Try again shortly.");
    await new Promise<void>((resolve) => waiters.push(resolve));
  } else active++;
  try { return await task(); }
  finally { const next = waiters.shift(); if (next) next(); else active--; }
}

export function checkAuthor(username: string, limit = 30, offset = 0): Promise<{ newVideos: number; totalChecked: number; authorId: string; offset: number }> {
  const key = `${username}:${limit}:${offset}`;
  const recent = recentChecks.get(key);
  if (recent && recent.until > Date.now()) return db.author.findUnique({ where: { id: recent.result.authorId }, select: { id: true } }).then((author) => {
    if (author) return { ...recent.result, newVideos: 0 };
    recentChecks.delete(key);
    return checkAuthor(username, limit, offset);
  });
  const pending = checks.get(key);
  if (pending) return pending;
  const promise = withUpstreamSlot(async () => {
    const [profile, videos] = await Promise.all([
      tiktokProvider.getAuthorProfile(username),
      tiktokProvider.getAuthorVideos(username, limit, offset),
    ]);
    const author = await db.author.upsert({
      where: { username: profile.username.toLowerCase() },
      create: { ...profile, username: profile.username.toLowerCase(), subscribed: false, lastCheckedAt: new Date() },
      update: { ...profile, username: profile.username.toLowerCase(), lastCheckedAt: new Date() },
    });
    const newVideos = await storeVideos(author.id, videos, tiktokConfig.dataMode === "local" && offset > 0);
    const result = { newVideos, totalChecked: videos.length, authorId: author.id, offset };
    if (recentChecks.size >= 1000) recentChecks.delete(recentChecks.keys().next().value!);
    recentChecks.set(key, { until: Date.now() + 60_000, result });
    return result;
  }).finally(() => checks.delete(key));
  checks.set(key, promise);
  return promise;
}

export async function storeVideoMeta(meta: VideoMeta) {
  if (!cleanUsername(meta.authorUsername) || !canonicalVideoUrl(meta.url) || !/^\d+$/.test(meta.tiktokId)) throw new Error("TikTok returned invalid video metadata");
  const author = await db.author.upsert({
    where: { username: meta.authorUsername.toLowerCase() },
    create: { username: meta.authorUsername.toLowerCase(), displayName: meta.authorDisplayName, avatarUrl: meta.authorAvatarUrl, subscribed: false },
    update: { displayName: meta.authorDisplayName, avatarUrl: meta.authorAvatarUrl },
  });
  const { authorUsername, authorDisplayName, authorAvatarUrl, streamUrl, ...video } = meta;
  await storeVideos(author.id, [video]);
  return db.video.update({ where: { authorId_tiktokId: { authorId: author.id, tiktokId: video.tiktokId } }, data: { metadataFetchedAt: new Date() } });
}
