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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Fetch a URL via curl with SOCKS5 proxy and browser headers. Follows redirects. */
async function fetchHtml(url: string, timeoutMs = 30_000): Promise<string> {
  const proxy = await getEffectiveProxy();
  const args = [
    "-fsSL",
    "--proto", "=https",
    "--proto-redir", "=https",
    "--max-redirs", "3",
    "--compressed",
    "--max-time", String(Math.floor(timeoutMs / 1000)),
    "-H", `User-Agent: ${UA}`,
    "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-H", "Referer: https://www.tiktok.com/",
  ];
  if (proxy) args.push("--proxy", proxy);
  args.push(url);
  try {
    const { stdout } = await execFileAsync("curl", args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf8",
    });
    return stdout;
  } catch {
    return "";
  }
}

/** Extract the __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON from a TikTok page HTML string. */
function extractUniversalData(html: string): any | null {
  const m = html.match(
    /<script[^>]*id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/,
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

/** Read TikTok soundtrack URLs from both common hydrated gallery shapes. */
export function extractGalleryAudioUrl(itemStruct: any): string | null {
  for (const music of [itemStruct?.music, itemStruct?.imagePost?.music]) {
    const candidate = music?.playUrl ?? music?.play_url ?? music?.playUrlList?.[0] ?? music?.play_url_list?.[0];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
    const nested = candidate?.urlList?.[0] ?? candidate?.UrlList?.[0];
    if (typeof nested === "string" && nested.length > 0) return nested;
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
  if (!user || !user.uniqueId || user.uniqueId.toLowerCase() !== u.toLowerCase()) return null;
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
  const audioUrl = extractGalleryAudioUrl(itemStruct);
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
    width: video.width ?? 0,
    height: video.height ?? 0,
    viewCount: stats.playCount ?? 0,
    likeCount: stats.diggCount ?? 0,
    commentCount: stats.commentCount ?? 0,
    shareCount: stats.shareCount ?? 0,
    publishedAt: itemStruct.createTime ? new Date(itemStruct.createTime * 1000) : null,
    isGallery: images.length > 0,
    images: images.length > 0 ? images : undefined,
    audioUrl: typeof audioUrl === "string" ? audioUrl : null,
    authorUsername: author.uniqueId ?? "",
    authorDisplayName: author.nickname ?? null,
    authorAvatarUrl: author.avatarLarger ?? author.avatarMedium ?? null,
    streamUrl: null,
  };
}

export async function scrapeSearch(query: string, kind: "all" | "author" | "video" = "all"): Promise<any[]> {
  const url = new URL("http://127.0.0.1:3040/search");
  url.searchParams.set("q", query);
  url.searchParams.set("kind", kind);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(75_000), headers: { "x-libcut-proxy": (await getEffectiveProxy()) ?? "" } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "TikTok search unavailable");
    if (!Array.isArray(body.results)) throw new Error("Invalid search response");
    return body.results;
  } catch (e) {
    throw new Error(`TikTok search: ${(e as Error).name === "TimeoutError" ? "request timed out" : (e as Error).message}`);
  }
}

export async function scrapeComments(_videoUrl: string): Promise<VideoComment[] | null> {
  return null;
}
