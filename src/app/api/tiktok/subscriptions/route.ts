import { requireLocalMode } from "@/lib/tiktok/access";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson, cleanUsername } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { checkAuthor } from "@/lib/tiktok/library";
import { proxyImage } from "@/lib/tiktok/images";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/subscriptions
 * List subscribed authors with video + unseen counts.
 */
export async function GET() {
  const denied = requireLocalMode();
  if (denied) return denied;
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
  const denied = requireLocalMode(req);
  if (denied) return denied;
  await ensureInitialized();
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body.username !== "string") return errorJson("username is required", 400);
  const username = cleanUsername(body.username);
  if (!username) return errorJson("username is required", 400);

  try {
    const checked = await checkAuthor(username);
    const author = await db.author.update({ where: { id: checked.authorId }, data: { subscribed: true } });
    return json({ author: { id: author.id, username: author.username }, storedVideos: checked.totalChecked, newVideos: checked.newVideos });
  } catch (e) { return errorJson(`Could not fetch @${username}: ${(e as Error).message}`, 502); }

}
