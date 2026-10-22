import { requireLocalMode } from "@/lib/tiktok/access";
import type { Prisma } from "@prisma/client";
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
  const cursor = req.nextUrl.searchParams.get("cursor");
  // Seek by immutable ordering fields: a Prisma cursor disappears from its
  // filtered window as soon as the anchor is marked seen.
  const anchor = cursor ? await db.video.findUnique({ where: { id: cursor }, select: { id: true, publishedAt: true } }) : null;
  if (cursor && !anchor) return json({ error: "Feed cursor expired. Refresh the feed." }, 400);
  const after: Prisma.VideoWhereInput = !anchor ? {} : anchor.publishedAt ? {
    OR: [
      { publishedAt: { lt: anchor.publishedAt } },
      { publishedAt: anchor.publishedAt, id: { lt: anchor.id } },
      { publishedAt: null },
    ],
  } : { publishedAt: null, id: { lt: anchor.id } };
  const videos = await db.video.findMany({
    where: { seen: false, author: { subscribed: true }, ...after },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: { author: true },
  });
  return json({
    nextCursor: videos.length > limit ? videos[limit - 1].id : null,
    videos: videos.slice(0, limit).map((v) => ({
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
