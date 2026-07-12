/**
 * TikTok HTML scraper — fetches TikTok pages via curl (with SOCKS5 proxy) and
 * extracts the __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON blob.
 *
 * TikTok blocks naive Node.js https requests with a 302 redirect to /hk/about
 * (geo-block). Using curl with proper headers + --compressed + --socks5
 * bypasses this reliably.
 *
 * For profile/video data that yt-dlp can't provide (follower count, avatar,
 * display name, photo carousel images), we fall back to this HTML scraper.
 */

import { getEffectiveProxy } from "./config";
import type { AuthorProfile, VideoMeta, VideoComment, AuthorVideo } from "./types";
import { execFileSync } from "child_process";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Fetch a URL via curl with SOCKS5 proxy and browser headers. Follows redirects. */
async function fetchHtml(url: string, timeoutMs = 30_000): Promise<string> {
  const proxy = await getEffectiveProxy();
  const args = [
    "-sL",
    "--compressed",
    "--max-time", String(Math.floor(timeoutMs / 1000)),
    "-H", `User-Agent: ${UA}`,
    "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-H", "Referer: https://www.tiktok.com/",
  ];
  if (proxy) {
    if (proxy.startsWith("socks5")) {
      args.push("--socks5", proxy.replace(/^socks5:\/\//, "").replace(/^socks5h:\/\//, ""));
    } else if (proxy.startsWith("http")) {
      args.push("--proxy", proxy);
    }
  }
  args.push(url);
  try {
    return execFileSync("curl", args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf8",
    });
  } catch {
    return "";
  }
}

/** Extract the __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON from a TikTok page HTML string. */
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
  const html = await fetchHtml(`https://www.tiktok.com/@${u}`);
  if (!html) return null;
  const data = extractUniversalData(html);
  if (!data) return null;
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
  const html = await fetchHtml(videoUrl);
  if (!html) return null;
  const data = extractUniversalData(html);
  if (!data) return null;
  const scope = data?.__DEFAULT_SCOPE__ ?? {};
  const itemStruct = scope?.["webapp.video-detail"]?.itemInfo?.itemStruct;
  if (!itemStruct) return null;
  const author = itemStruct.author ?? {};
  const stats = itemStruct.stats ?? {};
  const video = itemStruct.video ?? {};
  const imagePost = itemStruct.imagePost ?? {};
  const imagesList = imagePost.images ?? [];
  const images = imagesList
    .map((img: any) => {
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

export async function scrapeSearch(_query: string): Promise<any[]> {
  return [];
}

export async function scrapeComments(_videoUrl: string): Promise<VideoComment[] | null> {
  return null;
}
