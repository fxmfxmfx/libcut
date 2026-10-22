import { requireLocalMode } from "@/lib/tiktok/access";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, boundedInt } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { serializeVideo } from "@/lib/tiktok/library";
import { proxyImage } from "@/lib/tiktok/images";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/feed
 * Unseen videos from subscribed authors, newest first.
 * Query: ?limit= (default 50)
 */
export async function GET(req: NextRequest) {
  const denied = requireLocalMode();
  if (denied) return denied;
  await ensureInitialized();
  const limit = boundedInt(req.nextUrl.searchParams.get("limit"), 50, 1, 200);
  const videos = await db.video.findMany({
    where: { seen: false, author: { subscribed: true } },
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: { author: true },
  });
  return json({
    videos: videos.map((v) => ({
      ...serializeVideo(v),
      author: {
        id: v.author.id,
        username: v.author.username,
        displayName: v.author.displayName,
        avatarUrl: proxyImage(v.author.avatarUrl),
      },
    })),
  });
}
