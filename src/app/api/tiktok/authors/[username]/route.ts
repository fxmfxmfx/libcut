import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson, cleanUsername } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { tiktokProvider } from "@/lib/tiktok";
import { proxyImage } from "@/lib/tiktok/images";
import { scrapeAuthorProfile } from "@/lib/tiktok/scraper";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/authors/[username]
 * Author profile + stored videos.
 * If the author is in the DB with stale data (followerCount=0), re-scrape to
 * refresh. If not in DB at all, fetch live and persist (browse without subscribe).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  await ensureInitialized();
  const username = cleanUsername((await ctx.params).username);

  let author = await db.author.findUnique({
    where: { username },
    include: { videos: { orderBy: { publishedAt: "desc" } } },
  });

  // Re-scrape if data is stale (any missing stats from old subscribe before scraper).
  if (author && (author.followerCount === 0 || author.heartCount === 0)) {
    try {
      const fresh = await scrapeAuthorProfile(username);
      if (fresh && (fresh.followerCount > 0 || fresh.heartCount > 0)) {
        author = await db.author.update({
          where: { id: author.id },
          data: {
            displayName: fresh.displayName,
            avatarUrl: fresh.avatarUrl,
            description: fresh.description,
            followerCount: fresh.followerCount,
            followingCount: fresh.followingCount,
            heartCount: fresh.heartCount,
            videoCount: fresh.videoCount,
            lastCheckedAt: new Date(),
          },
          include: { videos: { orderBy: { publishedAt: "desc" } } },
        });
      }
    } catch {
      // keep DB data
    }
  }

  if (author) {
    return json({
      author: {
        id: author.id,
        username: author.username,
        displayName: author.displayName,
        avatarUrl: proxyImage(author.avatarUrl),
        description: author.description,
        followerCount: author.followerCount,
        followingCount: author.followingCount,
        heartCount: author.heartCount,
        videoCount: author.videoCount,
        subscribed: author.subscribed,
        lastCheckedAt: author.lastCheckedAt,
      },
      videos: author.videos.map((v) => ({
        id: v.id,
        tiktokId: v.tiktokId,
        url: v.url,
        title: v.title,
        description: v.description,
        thumbnailUrl: proxyImage(v.thumbnailUrl),
        duration: v.duration,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        commentCount: v.commentCount,
        shareCount: v.shareCount,
        publishedAt: v.publishedAt,
        seen: v.seen,
        cached: !!v.cachedPath,
        isGallery: v.isGallery,
        images: v.images ? JSON.parse(v.images) : null,
      })),
    });
  }

  // Not in DB — fetch live so the user can preview before subscribing.
  // Persist the author (subscribed=false) + videos so they get real DB ids
  // and the player can open them.
  try {
    const profile = await tiktokProvider.getAuthorProfile(username);
    const videos = await tiktokProvider.getAuthorVideos(username, 30);

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
        subscribed: false,
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
        lastCheckedAt: new Date(),
      },
    });

    const videoRows: Array<{
      id: string; tiktokId: string; url: string; title: string | null;
      description: string | null; thumbnailUrl: string | null; duration: number;
      viewCount: number; likeCount: number; commentCount: number; shareCount: number;
      publishedAt: Date | null; seen: boolean; cachedPath: string | null;
      isGallery: boolean; images: string | null;
    }> = [];
    for (const v of videos) {
      const row = await db.video.upsert({
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
        update: {},
      });
      videoRows.push(row);
    }

    return json({
      author: {
        id: author.id,
        username: author.username,
        displayName: author.displayName,
        avatarUrl: proxyImage(author.avatarUrl),
        description: author.description,
        followerCount: author.followerCount,
        followingCount: author.followingCount,
        heartCount: author.heartCount,
        videoCount: author.videoCount,
        subscribed: author.subscribed,
        lastCheckedAt: author.lastCheckedAt,
      },
      videos: videoRows.map((v) => ({
        id: v.id,
        tiktokId: v.tiktokId,
        url: v.url,
        title: v.title,
        description: v.description,
        thumbnailUrl: proxyImage(v.thumbnailUrl),
        duration: v.duration,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        commentCount: v.commentCount,
        shareCount: v.shareCount,
        publishedAt: v.publishedAt,
        seen: v.seen,
        cached: !!v.cachedPath,
        isGallery: v.isGallery,
        images: v.images ? JSON.parse(v.images) : null,
      })),
    });
  } catch (e: any) {
    return errorJson(`Could not load @${username}: ${e?.message ?? String(e)}`, 502);
  }
}
