import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { tiktokProvider } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

/**
 * POST /api/tiktok/refresh
 * Check every subscribed author for new videos via the provider and persist
 * any new ones. Called on app open so the feed shows fresh content.
 * Returns a per-author summary + total new count.
 */
export async function POST(_req: NextRequest) {
  await ensureInitialized();
  const authors = await db.author.findMany({ where: { subscribed: true } });

  const summary: { username: string; newVideos: number; error?: string }[] = [];
  let totalNew = 0;

  // Check all subscribed authors in parallel (much faster than sequential).
  const results = await Promise.allSettled(
    authors.map(async (author) => {
      const videos = await tiktokProvider.getAuthorVideos(author.username, 30);
      let newCount = 0;
      for (const v of videos) {
        const existing = await db.video.findUnique({
          where: { authorId_tiktokId: { authorId: author.id, tiktokId: v.tiktokId } },
          select: { id: true },
        });
        if (!existing) {
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
              seen: false,
              isGallery: v.isGallery ?? false,
              images: v.images ? JSON.stringify(v.images) : null,
            },
          });
          newCount++;
        }
      }
      await db.author.update({
        where: { id: author.id },
        data: { lastCheckedAt: new Date() },
      });
      return { username: author.username, newVideos: newCount };
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      summary.push(r.value);
      totalNew += r.value.newVideos;
    } else {
      const author = authors[results.indexOf(r)];
      summary.push({
        username: author.username,
        newVideos: 0,
        error: (r.reason as Error)?.message ?? String(r.reason),
      });
    }
  }

  return json({ totalNew, checkedAuthors: authors.length, summary });
}
