import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { proxyImage } from "@/lib/tiktok/images";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/videos/[id]/comments
 * Return stored comments; if none stored (or ?refresh=1), fetch via provider
 * and persist them.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureInitialized();
  const { id } = await ctx.params;
  const v = await db.video.findUnique({
    where: { id },
    select: { id: true, url: true, commentCount: true },
  });
  if (!v) return errorJson("video not found", 404);

  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  let stored = await db.comment.findMany({
    where: { videoId: id },
    orderBy: { postedAt: "desc" },
  });

  if (refresh || stored.length === 0) {
    let fetchError: string | null = null;
    let fetched: any[] = [];

    // yt-dlp cannot extract TikTok comments (returns 0). Skip it and go
    // straight to the headless-browser comments service.
    // Try the tiktok-comments mini-service (port 3040) which uses a headless
    // browser with GDPR consent acceptance to get the signed comment API.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const r = await fetch(
        `http://localhost:3040/comments?videoUrl=${encodeURIComponent(v.url)}&limit=100`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);
      if (r.ok) {
        const data = await r.json();
        fetched = (data.comments ?? []).map((c: any) => ({
          id: c.id,
          authorName: c.authorName,
          authorAvatar: c.authorAvatar,
          text: c.text,
          likeCount: c.likeCount,
          postedAt: c.postedAt ? new Date(c.postedAt) : null,
        }));
      }
    } catch (e: any) {
      clearTimeout(timeout);
      if (e?.name === "AbortError") {
        fetchError = "Comments timed out — the headless browser is slow. Try refreshing.";
      }
      // service unavailable; fall through
    }

    if (fetched.length) {
      await db.comment.deleteMany({ where: { videoId: id } });
      await db.comment.createMany({
        data: fetched.map((c) => ({
          videoId: id,
          authorName: c.authorName,
          authorAvatar: c.authorAvatar,
          text: c.text,
          likeCount: c.likeCount,
          postedAt: c.postedAt,
          parentId: c.parentId ?? null,
          replyCount: c.replyCount ?? 0,
        })),
      });
      stored = await db.comment.findMany({
        where: { videoId: id },
        orderBy: [{ parentId: "asc" }, { likeCount: "desc" }],
      });
    } else if (v.commentCount > 0) {
      fetchError = "Comments could not be loaded (TikTok blocks the comment API for some regions)";
    }
    if (stored.length === 0 && fetchError) {
      return json({ comments: [], error: fetchError, commentCount: v.commentCount });
    }
  }

  return json({
    comments: stored.map((c) => ({
      id: c.id,
      authorName: c.authorName,
      authorAvatar: proxyImage(c.authorAvatar),
      text: c.text,
      likeCount: c.likeCount,
      postedAt: c.postedAt,
      parentId: c.parentId,
      replyCount: c.replyCount,
    })),
    commentCount: v.commentCount,
  });
}
