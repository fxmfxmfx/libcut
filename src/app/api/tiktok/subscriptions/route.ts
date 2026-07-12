import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson, cleanUsername } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { tiktokProvider } from "@/lib/tiktok";
import { proxyImage } from "@/lib/tiktok/images";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/subscriptions
 * List subscribed authors with video + unseen counts.
 */
export async function GET() {
  await ensureInitialized();
  const authors = await db.author.findMany({
    where: { subscribed: true },
    orderBy: { createdAt: "asc" },
    include: { videos: { select: { id: true, seen: true } } },
  });
  const data = authors.map((a) => ({
    id: a.id,
    username: a.username,
    displayName: a.displayName,
    avatarUrl: proxyImage(a.avatarUrl),
    description: a.description,
    followerCount: a.followerCount,
    videoCount: a.videoCount,
    lastCheckedAt: a.lastCheckedAt,
    storedVideoCount: a.videos.length,
    unseenCount: a.videos.filter((v) => !v.seen).length,
  }));
  return json({ subscriptions: data });
}

/**
 * POST /api/tiktok/subscriptions
 * Body: { username }
 * Subscribe to a creator: fetch profile + recent videos via the provider,
 * persist them, mark all as unseen.
 */
export async function POST(req: NextRequest) {
  await ensureInitialized();
  const body = await req.json().catch(() => ({}));
  const username = cleanUsername(String(body.username ?? ""));
  if (!username) return errorJson("username is required", 400);

  let profile, videos;
  try {
    profile = await tiktokProvider.getAuthorProfile(username);
    videos = await tiktokProvider.getAuthorVideos(username, 30);
  } catch (e: any) {
    return errorJson(`Could not fetch @${username}: ${e?.message ?? String(e)}`, 502);
  }

  const author = await db.author.upsert({
    where: { username: profile.username },
    create: {
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      description: profile.description,
      followerCount: profile.followerCount,
      followingCount: profile.followingCount,
      heartCount: profile.heartCount,
      videoCount: profile.videoCount,
      subscribed: true,
      lastCheckedAt: new Date(),
    },
    update: {
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      description: profile.description,
      followerCount: profile.followerCount,
      followingCount: profile.followingCount,
      heartCount: profile.heartCount,
      videoCount: profile.videoCount,
      subscribed: true,
      lastCheckedAt: new Date(),
    },
  });

  let newCount = 0;
  for (const v of videos) {
    const created = await db.video.upsert({
      where: { authorId_tiktokId: { authorId: author.id, tiktokId: v.tiktokId } },
      create: {
        tiktokId: v.tiktokId,
        authorId: author.id,
        url: v.url,
        title: v.title,
        description: v.description,
        thumbnailUrl: v.thumbnailUrl,
        duration: v.duration,
        width: v.width,
        height: v.height,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        commentCount: v.commentCount,
        shareCount: v.shareCount,
        publishedAt: v.publishedAt,
        seen: false,
        isGallery: v.isGallery ?? false,
        images: v.images ? JSON.stringify(v.images) : null,
      },
      update: {
        title: v.title,
        description: v.description,
        thumbnailUrl: v.thumbnailUrl,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        commentCount: v.commentCount,
        shareCount: v.shareCount,
        isGallery: v.isGallery ?? false,
        images: v.images ? JSON.stringify(v.images) : null,
      },
    });
    if (created.discoveredAt && Date.now() - created.discoveredAt.getTime() < 2000) newCount++;
  }

  return json({ author: { id: author.id, username: author.username }, storedVideos: videos.length, newVideos: newCount });
}
