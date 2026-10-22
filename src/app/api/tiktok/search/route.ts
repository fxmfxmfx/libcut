import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson, cleanUsername, canonicalVideoUrl } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { tiktokProvider } from "@/lib/tiktok";
import { tiktokConfig } from "@/lib/tiktok/config";
import { proxyImage } from "@/lib/tiktok/images";
import { serializeAuthor, serializeVideo, storeVideoMeta, storeVideos, withUpstreamSlot } from "@/lib/tiktok/library";

export const dynamic = "force-dynamic";
const cache = new Map<string, { until: number; results: unknown[] }>();
const pending = new Map<string, Promise<unknown[]>>();

async function liveSearch(q: string, kind: "all" | "author" | "video", signal: AbortSignal) {
  const key = `${kind}:${q.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) return cached.results;
  const running = pending.get(key);
  if (running) return running;
  const task = withUpstreamSlot(async () => {
    if (signal.aborted) throw new Error("Search cancelled");
    const results: unknown[] = [];
    const url = canonicalVideoUrl(q);
    if (/^https?:\/\//i.test(q) && !url && !cleanUsername(q)) throw new Error("Use a TikTok profile URL or a full https://www.tiktok.com/@user/video/ID link.");
    if (url) {
      const video = await storeVideoMeta(await tiktokProvider.getVideoMeta(url));
      const author = await db.author.findUniqueOrThrow({ where: { id: video.authorId } });
      results.push({ kind: "video", source: "live", ...serializeVideo(video), author: serializeAuthor(author) });
    } else if (q.startsWith("@") || /^https:\/\/(?:www\.)?tiktok\.com\/@/i.test(q)) {
      const username = cleanUsername(q);
      if (!username) throw new Error("Invalid TikTok username");
      const profile = await tiktokProvider.getAuthorProfile(username);
      results.push({ kind: "author", source: "live", ...profile, avatarUrl: proxyImage(profile.avatarUrl), subscribed: false });
    } else {
      const query = cleanUsername(q) || q;
      const live = await tiktokProvider.search(query, kind);
      const authors = new Set<string>();
      const videos = new Set<string>();
      for (const result of live.slice(0, 40)) {
        if (result.kind === "author" && result.username) {
          const username = cleanUsername(result.username);
          if (!username || authors.has(username)) continue;
          authors.add(username);
          results.push({ ...result, username, source: "live", avatarUrl: proxyImage(result.avatarUrl), subscribed: false });
        } else if (result.video && result.video.authorUsername && !videos.has(result.video.tiktokId)) {
          const v = result.video;
          const username = cleanUsername(v.authorUsername);
          if (!username || !canonicalVideoUrl(v.url)) continue;
          videos.add(v.tiktokId);
          const author = await db.author.upsert({ where: { username }, create: { username, subscribed: false }, update: {} });
          await storeVideos(author.id, [v]);
          const video = await db.video.findUniqueOrThrow({ where: { authorId_tiktokId: { authorId: author.id, tiktokId: v.tiktokId } } });
          results.push({ kind: "video", source: "live", ...serializeVideo(video), author: serializeAuthor(author) });
        }
      }
    }
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(key, { until: Date.now() + 60_000, results });
    return results;
  }).finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const kind = req.nextUrl.searchParams.get("kind") ?? "all";
  const source = req.nextUrl.searchParams.get("source") ?? "all";
  if (!["all", "author", "video"].includes(kind) || !["all", "library", "live"].includes(source) || q.length > 200) return errorJson("Invalid search parameters", 400);
  if (!q) return json({ results: [], liveError: null });
  await ensureInitialized();
  const results: any[] = [];
  if (source !== "live" && tiktokConfig.dataMode === "local") {
    const handle = cleanUsername(q) || q.toLowerCase().replace(/^@/, "");
    if (kind !== "video") {
      const authors = await db.author.findMany({ where: { OR: [{ username: { contains: handle } }, { displayName: { contains: q } }] }, take: 30 });
      authors.sort((a, b) => Number(b.username === handle) - Number(a.username === handle));
      results.push(...authors.map((a) => ({ kind: "author", source: "library", ...serializeAuthor(a) })));
    }
    if (kind !== "author") {
      const videos = await db.video.findMany({
        where: { OR: [{ title: { contains: q } }, { description: { contains: q } }, { author: { username: { contains: handle } } }, { url: q }] },
        orderBy: { publishedAt: "desc" }, take: 50, include: { author: true },
      });
      results.push(...videos.map((v) => ({ kind: "video", source: "library", ...serializeVideo(v), author: serializeAuthor(v.author) })));
    }
  }
  let liveError: string | null = null;
  if (source !== "library" && q.length >= 2) {
    try { results.push(...await liveSearch(q, kind as "all" | "author" | "video", req.signal)); }
    catch (e) { liveError = (e as Error).message; }
  }
  const unique = new Map<string, any>();
  for (const r of results) {
    const key = r.kind === "author" ? `author:${r.username}` : `video:${r.tiktokId}`;
    if (!unique.has(key)) unique.set(key, r);
  }
  return json({ query: q, kind, results: [...unique.values()], liveError });
}
