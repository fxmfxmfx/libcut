import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson, cleanUsername } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { checkAuthor, serializeAuthor, serializeVideo } from "@/lib/tiktok/library";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const username = cleanUsername((await ctx.params).username);
  if (!username) return errorJson("Invalid TikTok username", 400);
  await ensureInitialized();
  let author = await db.author.findUnique({ where: { username }, include: { videos: { orderBy: { publishedAt: "desc" }, take: 500 } } });
  let refreshError: string | null = null;
  const stale = !author?.lastCheckedAt || Date.now() - author.lastCheckedAt.getTime() > 5 * 60_000;
  if (!author || (req.nextUrl.searchParams.get("refresh") === "1" && stale)) {
    try {
      await checkAuthor(username);
      author = await db.author.findUnique({ where: { username }, include: { videos: { orderBy: { publishedAt: "desc" }, take: 500 } } });
    } catch (e) {
      if (!author) return errorJson((e as Error).message, 502);
      refreshError = (e as Error).message;
    }
  }
  if (!author) return errorJson("Author not found", 404);
  return json({ author: serializeAuthor(author), videos: author.videos.map(serializeVideo), refreshError });
}
