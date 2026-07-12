import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { tiktokProvider } from "@/lib/tiktok";
import { proxyImage } from "@/lib/tiktok/images";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/search?q=...&kind=all|author|video
 * Search via the provider (network) AND the local DB (subscriptions/videos).
 * Results are de-duplicated by username (for authors) so the same creator from
 * the library and from live search doesn't appear twice.
 */
export async function GET(req: NextRequest) {
  await ensureInitialized();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const kind = (req.nextUrl.searchParams.get("kind") ?? "all") as "all" | "author" | "video";
  if (!q) return json({ results: [] });

  const seenAuthors = new Set<string>();
  const localResults: any[] = [];

  if (kind === "all" || kind === "author") {
    const ql = q.toLowerCase().replace(/^@/, "");
    const authors = await db.author.findMany({
      where: {
        OR: [
          { username: { contains: ql } },
          { displayName: { contains: ql } },
        ],
      },
      take: 20,
    });
    for (const a of authors) {
      if (seenAuthors.has(a.username)) continue;
      seenAuthors.add(a.username);
      localResults.push({
        kind: "author",
        source: "library",
        id: a.id,
        username: a.username,
        displayName: a.displayName,
        avatarUrl: proxyImage(a.avatarUrl),
        description: a.description,
        followerCount: a.followerCount,
        subscribed: a.subscribed,
      });
    }
  }

  if (kind === "all" || kind === "video") {
    const videos = await db.video.findMany({
      where: {
        OR: [{ title: { contains: q } }, { description: { contains: q } }],
      },
      take: 30,
      include: { author: true },
    });
    for (const v of videos) {
      localResults.push({
        kind: "video",
        source: "library",
        id: v.id,
        title: v.title,
        thumbnailUrl: proxyImage(v.thumbnailUrl),
        duration: v.duration,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        commentCount: v.commentCount,
        publishedAt: v.publishedAt,
        isGallery: v.isGallery,
        author: {
          id: v.author.id,
          username: v.author.username,
          displayName: v.author.displayName,
          avatarUrl: proxyImage(v.author.avatarUrl),
          subscribed: v.author.subscribed,
        },
      });
    }
  }

  // Provider (live) matches.
  let liveResults: any[] = [];
  let liveError: string | null = null;
  try {
    const live = await tiktokProvider.search(q, kind);
    liveResults = live
      .filter((r) => {
        // De-dup authors against what we've already returned.
        if (r.kind === "author" && r.username) {
          if (seenAuthors.has(r.username)) return false;
          seenAuthors.add(r.username);
        }
        return true;
      })
      .map((r) => ({
        kind: r.kind,
        source: "live",
        username: r.username,
        displayName: r.displayName,
        avatarUrl: proxyImage(r.avatarUrl),
        description: r.description,
        followerCount: r.followerCount,
        video: r.video
          ? {
              tiktokId: r.video.tiktokId,
              url: r.video.url,
              title: r.video.title,
              thumbnailUrl: proxyImage(r.video.thumbnailUrl),
              duration: r.video.duration,
              viewCount: r.video.viewCount,
              likeCount: r.video.likeCount,
              commentCount: r.video.commentCount,
              publishedAt: r.video.publishedAt,
              isGallery: r.video.isGallery,
              authorUsername: r.video.authorUsername,
            }
          : undefined,
      }));
  } catch (e: any) {
    liveError = e?.message ?? String(e);
  }

  return json({ query: q, kind, results: [...localResults, ...liveResults], liveError });
}
