/**
 * TikTok HTML scraper — fetches the TikTok page HTML and extracts the
 * `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON blob. This is MORE reliable than
 * yt-dlp for: author avatar, display name (nickname), follower count,
 * description (signature), and video stats.
 *
 * All requests go through the configured SOCKS5 proxy via SocksProxyAgent.
 */

import { SocksProxyAgent } from "socks-proxy-agent";
import { Agent } from "http";
import https from "https";
import { getEffectiveProxy, tiktokConfig } from "./config";
import type { AuthorProfile, VideoMeta, VideoComment, AuthorVideo } from "./types";

const UA = tiktokConfig.userAgent;

/** Fetch a URL through the proxy and return the body as a string. */
async function fetchHtml(url: string, timeoutMs = 30_000): Promise<string> {
  const proxy = await getEffectiveProxy();
  let agent: Agent | undefined;
  if (proxy && proxy.startsWith("socks")) {
    agent = new SocksProxyAgent(proxy) as unknown as Agent;
  }
  const isHttps = url.startsWith("https:");
  const lib = isHttps ? https : await import("http");
  return new Promise<string>((resolve, reject) => {
    const req = lib.get(
      url,
      { headers: { "User-Agent": UA, Referer: "https://www.tiktok.com/", "Accept-Language": "en-US,en;q=0.9" }, agent, timeout: timeoutMs },
      (res) => {
        // Follow redirects (3xx) — https module handles same-host redirects;
        // for cross-host we do it manually.
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          fetchHtml(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("request timed out"));
    });
    req.on("error", reject);
  });
}

/** Extract the __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON from a TikTok page. */
function extractUniversalData(html: string): any | null {
  const m = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/,
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** Deep-search a JSON object for the first dict containing the given keys. */
function findObjWithKeys(obj: any, keys: string[], depth = 0): any | null {
  if (depth > 10 || !obj) return null;
  if (typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const r = findObjWithKeys(v, keys, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (keys.every((k) => k in obj)) return obj;
  for (const v of Object.values(obj)) {
    const r = findObjWithKeys(v, keys, depth + 1);
    if (r) return r;
  }
  return null;
}

/** Fetch a creator's full profile by scraping the channel page HTML. */
export async function scrapeAuthorProfile(username: string): Promise<AuthorProfile | null> {
  const u = username.replace(/^@/, "");
  let html: string;
  try {
    html = await fetchHtml(`https://www.tiktok.com/@${u}`);
  } catch {
    return null;
  }
  const data = extractUniversalData(html);
  if (!data) return null;
  // The user object lives under __DEFAULT_SCOPE__.webapp.user-detail.userInfo.user
  const scope = data?.__DEFAULT_SCOPE__ ?? {};
  const userDetail = scope["webapp.user-detail"] ?? {};
  const user =
    userDetail?.userInfo?.user ??
    findObjWithKeys(data, ["uniqueId", "nickname"]) ??
    findObjWithKeys(data, ["uniqueId", "avatarLarger"]);
  if (!user || !user.uniqueId) return null;
  const stats = userDetail?.userInfo?.stats ?? findObjWithKeys(data, ["followerCount", "followingCount"]) ?? {};
  return {
    username: user.uniqueId,
    displayName: user.nickname ?? null,
    avatarUrl: user.avatarLarger ?? user.avatarMedium ?? user.avatarThumb ?? null,
    description: user.signature ?? null,
    followerCount: stats.followerCount ?? 0,
    followingCount: stats.followingCount ?? 0,
    heartCount: stats.heartCount ?? stats.heart ?? 0,
    videoCount: stats.videoCount ?? 0,
  };
}

/** Fetch full metadata for a single video by scraping the video page HTML. */
export async function scrapeVideoMeta(videoUrl: string): Promise<Partial<VideoMeta> | null> {
  let html: string;
  try {
    html = await fetchHtml(videoUrl);
  } catch {
    return null;
  }
  const data = extractUniversalData(html);
  if (!data) return null;
  const scope = data?.__DEFAULT_SCOPE__ ?? {};
  const itemStruct = scope?.["webapp.video-detail"]?.itemInfo?.itemStruct;
  if (!itemStruct) return null;
  const author = itemStruct.author ?? {};
  const stats = itemStruct.stats ?? {};
  const video = itemStruct.video ?? {};
  // Photo carousel detection
  const imagePost = itemStruct.imagePost ?? {};
  const imagesList = imagePost.images ?? [];
  const images = imagesList
    .map((img: any) => {
      // TikTok imagePost.images[].imageURL.urlList[]
      if (img?.imageURL?.urlList && Array.isArray(img.imageURL.urlList)) {
        return img.imageURL.urlList[0];
      }
      if (img?.urlList && Array.isArray(img.urlList)) return img.urlList[0];
      if (typeof img?.url === "string") return img.url;
      if (typeof img === "string") return img;
      return null;
    })
    .filter((u: any) => typeof u === "string" && u.length > 0);
  return {
    tiktokId: String(itemStruct.id ?? ""),
    title: itemStruct.desc ?? null,
    description: itemStruct.desc ?? null,
    thumbnailUrl:
      video.cover ??
      video.dynamicCover ??
      video.originCover ??
      imagePost.cover?.urlList?.[0] ??
      imagePost.cover ??
      null,
    duration: video.duration ?? 0,
    viewCount: stats.playCount ?? 0,
    likeCount: stats.diggCount ?? 0,
    commentCount: stats.commentCount ?? 0,
    shareCount: stats.shareCount ?? 0,
    publishedAt: itemStruct.createTime ? new Date(itemStruct.createTime * 1000) : null,
    isGallery: images.length > 0,
    images: images.length > 0 ? images : undefined,
    authorUsername: author.uniqueId ?? "",
    authorDisplayName: author.nickname ?? null,
    authorAvatarUrl: author.avatarLarger ?? author.avatarMedium ?? null,
    streamUrl: null,
  };
}

/**
 * Fetch comments for a video. TikTok's comment API requires X-Bogus signing,
 * which is complex to implement. As a fallback we return the comment count
 * (from stats) and an empty list — the UI shows "comments disabled / not
 * available" rather than failing.
 *
 * TODO: implement X-Bogus signing for full comment extraction.
 */
export async function scrapeComments(_videoUrl: string): Promise<VideoComment[] | null> {
  return null;
}

/**
 * Search TikTok for creators/videos by scraping the search page HTML.
 * The search page embeds results in __UNIVERSAL_DATA_FOR_REHYDRATION__.
 */
export async function scrapeSearch(query: string): Promise<any[]> {
  let html: string;
  try {
    html = await fetchHtml(`https://www.tiktok.com/search?q=${encodeURIComponent(query)}`);
  } catch {
    return [];
  }
  const data = extractUniversalData(html);
  if (!data) return [];
  const scope = data?.__DEFAULT_SCOPE__ ?? {};
  // Search results live under webapp.search-detail
  const searchDetail = scope["webapp.search-detail"] ?? {};
  const itemList = searchDetail?.data ?? searchDetail?.itemList ?? [];
  const results: any[] = [];
  for (const item of itemList) {
    if (item.type === "user" || item.uniqueId) {
      const user = item.userInfo?.user ?? item.user ?? item;
      if (user.uniqueId) {
        results.push({
          kind: "author",
          username: user.uniqueId,
          displayName: user.nickname ?? null,
          avatarUrl: user.avatarLarger ?? user.avatarMedium ?? null,
          description: user.signature ?? null,
          followerCount: item.userInfo?.stats?.followerCount ?? 0,
        });
      }
    } else if (item.type === "item" || item.id || item.awemeId) {
      const author = item.author ?? item.userInfo?.user ?? {};
      const stats = item.stats ?? item.videoStats ?? {};
      results.push({
        kind: "video",
        tiktokId: String(item.id ?? item.awemeId ?? ""),
        url: `https://www.tiktok.com/@${author.uniqueId ?? "_"}/video/${item.id ?? item.awemeId}`,
        title: item.desc ?? null,
        thumbnailUrl: item.video?.cover ?? item.video?.originCover ?? null,
        duration: item.video?.duration ?? 0,
        viewCount: stats.playCount ?? 0,
        likeCount: stats.diggCount ?? 0,
        commentCount: stats.commentCount ?? 0,
        authorUsername: author.uniqueId ?? "",
      });
    }
  }
  return results;
}
