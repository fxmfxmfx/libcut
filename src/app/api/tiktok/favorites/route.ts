import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { proxyImage } from "@/lib/tiktok/images";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/favorites
 * List the user's favorite videos (with author), newest-favorite first.
 */
export async function GET() {
  await ensureInitialized();
  const favs = await db.favorite.findMany({
    orderBy: { createdAt: "desc" },
    include: { video: { include: { author: true } } },
  });
  return json({
    favorites: favs.map((f) => ({
      id: f.video.id,
      tiktokId: f.video.tiktokId,
      url: f.video.url,
      title: f.video.title,
      thumbnailUrl: proxyImage(f.video.thumbnailUrl),
      duration: f.video.duration,
      viewCount: f.video.viewCount,
      likeCount: f.video.likeCount,
      commentCount: f.video.commentCount,
      publishedAt: f.video.publishedAt,
      favoritedAt: f.createdAt,
      isGallery: f.video.isGallery,
      author: {
        id: f.video.author.id,
        username: f.video.author.username,
        displayName: f.video.author.displayName,
        avatarUrl: proxyImage(f.video.author.avatarUrl),
      },
    })),
  });
}
