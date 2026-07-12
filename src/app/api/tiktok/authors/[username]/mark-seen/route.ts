import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson, cleanUsername } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";

export const dynamic = "force-dynamic";

/**
 * POST /api/tiktok/authors/[username]/mark-seen
 * Mark ALL stored videos of this author as seen (so they leave the feed).
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  await ensureInitialized();
  const username = cleanUsername((await ctx.params).username);
  const author = await db.author.findUnique({ where: { username } });
  if (!author) return errorJson("author not found", 404);
  const res = await db.video.updateMany({
    where: { authorId: author.id, seen: false },
    data: { seen: true, seenAt: new Date() },
  });
  return json({ ok: true, marked: res.count });
}
