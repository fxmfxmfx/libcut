import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { proxyImage } from "@/lib/tiktok/images";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/feed
 * Unseen videos from subscribed authors, newest first.
 * Query: ?limit= (default 50)
 */
export async function GET(req: NextRequest) {
  await ensureInitialized();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50, 200);
  const videos = await db.video.findMany({
    where: { seen: false, author: { subscribed: true } },
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: { author: true },
  });
  return json({
    videos: videos.map((v) => ({
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
      isGallery: v.isGallery,
      images: v.images ? (JSON.parse(v.images) as string[]).map(proxyImage) : null,
      author: {
        id: v.author.id,
        username: v.author.username,
        displayName: v.author.displayName,
        avatarUrl: proxyImage(v.author.avatarUrl),
      },
    })),
  });
}
