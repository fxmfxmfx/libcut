import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson, cleanUsername } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { tiktokProvider } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

/**
 * POST /api/tiktok/authors/[username]/check?limit=30&offset=0
 * Refresh this author's video list via the provider and persist new videos.
 * Supports offset so the profile can load older videos ("Load older" button).
 * Returns the count of newly discovered videos.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  await ensureInitialized();
  const username = cleanUsername((await ctx.params).username);
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 30) || 30, 100);
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? 0) || 0);
  // When loading older videos (offset > 0), mark them as seen so they don't
  // flood the feed as "new". Fresh checks (offset=0) leave seen=false.
  const markSeen = req.nextUrl.searchParams.get("seen") === "1" || offset > 0;

  let profile, videos;
  try {
    profile = await tiktokProvider.getAuthorProfile(username);
    videos = await tiktokProvider.getAuthorVideos(username, limit, offset);
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
      videoCount: profile.videoCount,
      subscribed: true,
      lastCheckedAt: new Date(),
    },
    update: {
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      description: profile.description,
      followerCount: profile.followerCount,
      videoCount: profile.videoCount,
      lastCheckedAt: new Date(),
    },
  });

  let newCount = 0;
  for (const v of videos) {
    const before = await db.video.findUnique({
      where: { authorId_tiktokId: { authorId: author.id, tiktokId: v.tiktokId } },
      select: { id: true },
    });
    if (!before) {
      await db.video.create({
        data: {
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
          seen: markSeen,
          seenAt: markSeen ? new Date() : null,
          isGallery: v.isGallery ?? false,
          images: v.images ? JSON.stringify(v.images) : null,
        },
      });
      newCount++;
    }
  }

  return json({ newVideos: newCount, totalChecked: videos.length, authorId: author.id, offset });
}
