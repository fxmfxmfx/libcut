/**
 * Real TikTok provider backed by yt-dlp.
 *
 * All network access goes through the configured SOCKS5 proxy (resolved at
 * request time via getEffectiveProxy). yt-dlp is invoked as a child process;
 * we parse its JSON output.
 *
 * NOTE: TikTok actively blocks datacenter IPs and requires a working proxy +
 * fresh enough yt-dlp. Errors are mapped to TikTokError with a `code`.
 */

import { spawn } from "child_process";
import { tiktokConfig, ytdlpCommonArgs, getEffectiveProxy } from "./config";
import {
  type AuthorProfile,
  type AuthorVideo,
  type VideoComment,
  type VideoMeta,
  type SearchResult,
  type TikTokProvider,
  TikTokError,
} from "./types";
import { scrapeAuthorProfile, scrapeVideoMeta, scrapeSearch } from "./scraper";

/** Run yt-dlp with the given args and return its stdout as a string. */
async function runYtDlp(args: string[], opts: { timeoutMs?: number } = {}): Promise<string> {
  const proxy = await getEffectiveProxy();
  const fullArgs = [...ytdlpCommonArgs(proxy), ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(tiktokConfig.ytdlpPath, fullArgs, {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(
      () => {
        child.kill("SIGKILL");
        reject(new TikTokError("yt-dlp timed out", "network"));
      },
      opts.timeoutMs ?? 90_000,
    );

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new TikTokError(`Failed to start yt-dlp: ${err.message}`, "unknown"));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        const msg = stderr.trim() || `yt-dlp exited with code ${code}`;
        const lower = msg.toLowerCase();
        let code2: TikTokError["code"] = "unknown";
        if (lower.includes("http error 404") || lower.includes("does not exist") || lower.includes("unable to find")) {
          code2 = "not_found";
        } else if (lower.includes("captcha") || lower.includes("blocked") || lower.includes("403") || lower.includes("rate")) {
          code2 = "blocked";
        } else if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("connection")) {
          code2 = "network";
        }
        reject(new TikTokError(msg, code2));
      }
    });
  });
}

/** Run yt-dlp and parse its stdout as JSON. */
async function runYtDlpJson(args: string[], opts?: { timeoutMs?: number }): Promise<any> {
  const out = await runYtDlp(args, opts);
  try {
    return JSON.parse(out);
  } catch {
    throw new TikTokError("yt-dlp returned non-JSON output", "unknown");
  }
}

function authorUrl(username: string): string {
  const u = username.replace(/^@/, "");
  return `https://www.tiktok.com/@${u}`;
}

function parseNumber(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v === "number") {
    if (v > 10_000_000_000) return new Date(v);
    if (v > 10_000_000) return new Date(v * 1000);
    const s = String(v);
    if (s.length === 8) {
      const y = s.slice(0, 4);
      const m = s.slice(4, 6);
      const d = s.slice(6, 8);
      return new Date(`${y}-${m}-${d}T00:00:00Z`);
    }
  }
  if (typeof v === "string") {
    if (/^\d{8}$/.test(v)) {
      return new Date(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00Z`);
    }
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/** Extract the best avatar URL from a yt-dlp info dict. */
function pickAvatar(data: any): string | null {
  // Video-level: uploader avatar is often in `uploader_thumbnail` or thumbnails.
  if (data.uploader_thumbnail) return data.uploader_thumbnail;
  // Channel-level: thumbnails array.
  if (Array.isArray(data.thumbnails) && data.thumbnails.length > 0) {
    // Prefer the largest / last one.
    const t = data.thumbnails[data.thumbnails.length - 1];
    if (t?.url) return t.url;
  }
  if (data.avatar) return data.avatar;
  if (data.channel_thumbnail) return data.channel_thumbnail;
  if (data.channel_avatar) return data.channel_avatar;
  return null;
}

/** Extract display name vs username cleanly. Returns null if only a username is available. */
function pickDisplayName(data: any): string | null {
  // `channel` is the human-readable display name in yt-dlp.
  // For TikTok it's the display name (can be anything, including "/home/tsukasa").
  // We only reject values that look like a pure @username.
  for (const field of [data.channel, data.uploader, data.uploader_title, data.channel_title]) {
    if (field && typeof field === "string" && !field.startsWith("@")) {
      return field;
    }
  }
  return null;
}
function pickUsername(data: any, fallback: string): string {
  // For TikTok: `uploader` is the @username, `uploader_id` is a numeric id.
  // Prefer `uploader` (the handle) over the numeric id.
  const u =
    (data.uploader && String(data.uploader).replace(/^@/, "")) ||
    (data.uploader_id && String(data.uploader_id).replace(/^@/, "")) ||
    (data.channel_id && String(data.channel_id).replace(/^@/, "")) ||
    (data.channel && String(data.channel).replace(/^@/, "")) ||
    fallback;
  return u.replace(/^@/, "");
}

/** Detect a TikTok photo carousel / image post. */
function pickImages(entry: any): { isGallery: boolean; images: string[] } {
  // yt-dlp marks TikTok image posts with _type "images" and an `images` array
  // where each item has {url, width, height}. Also check `images` directly.
  const rawImages: any[] = [];
  if (Array.isArray(entry?.images)) rawImages.push(...entry.images);
  if (entry?._type === "images" && Array.isArray(entry?.entries)) {
    rawImages.push(...entry.entries);
  }
  const imgs: string[] = rawImages
    .map((im: any) => (typeof im === "string" ? im : im?.url))
    .filter((u: any) => typeof u === "string" && u.length > 0);
  if (imgs.length > 0) return { isGallery: true, images: imgs };

  // TikTok photo posts in flat-playlist have duration === 0 (no video stream).
  // Mark as gallery so the UI shows the image icon; full image URLs are fetched
  // on demand when the player opens (via scrapeVideoMeta).
  if (parseNumber(entry?.duration) === 0) {
    return { isGallery: true, images: [] };
  }
  return { isGallery: false, images: [] };
}

/** Map a yt-dlp video entry to our AuthorVideo shape. */
function mapEntry(entry: any, fallbackAuthorUrl?: string): AuthorVideo {
  const id = String(entry.id ?? entry.url ?? "");
  const url =
    entry.url && /^https?:/.test(String(entry.url))
      ? String(entry.url)
      : entry.original_url || (fallbackAuthorUrl ? `${fallbackAuthorUrl}/video/${id}` : `https://www.tiktok.com/@_/video/${id}`);
  const gallery = pickImages(entry);
  const base: AuthorVideo = {
    tiktokId: id,
    url,
    title: entry.title ?? entry.description ?? null,
    description: entry.description ?? null,
    thumbnailUrl: entry.thumbnail ?? entry.thumbnails?.[entry.thumbnails.length - 1]?.url ?? null,
    duration: parseNumber(entry.duration),
    width: parseNumber(entry.width),
    height: parseNumber(entry.height),
    viewCount: parseNumber(entry.view_count),
    likeCount: parseNumber(entry.like_count),
    commentCount: parseNumber(entry.comment_count),
    shareCount: parseNumber(entry.repost_count ?? entry.share_count),
    publishedAt: parseDate(entry.upload_date ?? entry.timestamp ?? entry.release_date),
  };
  if (gallery.isGallery) {
    base.isGallery = true;
    base.images = gallery.images;
  }
  return base;
}

export class YtDlpProvider implements TikTokProvider {
  async getAuthorProfile(username: string): Promise<AuthorProfile> {
    // Prefer the HTML scraper — it reliably returns nickname (display name),
    // avatarLarger, signature and followerCount. yt-dlp's flat-playlist often
    // returns None for all of these on TikTok channels AND can crash with
    // "Unable to extract secondary user ID".
    try {
      const scraped = await scrapeAuthorProfile(username);
      if (scraped && scraped.username) {
        return scraped;
      }
    } catch {
      // fall through to yt-dlp
    }

    // Fallback: yt-dlp flat-playlist + first-video extraction for display name.
    // If yt-dlp ALSO fails, return a minimal profile so subscribe doesn't crash.
    try {
      const url = authorUrl(username);
      const data = await runYtDlpJson([
        "-J",
        "--flat-playlist",
        "--playlist-end",
        "1",
        url,
      ]);

      const handle = pickUsername(data, username.replace(/^@/, ""));
      let displayName = pickDisplayName(data);
      let avatar = pickAvatar(data);
      let followerCount =
        parseNumber(data.channel_follower_count) ||
        parseNumber(data.followers) ||
        parseNumber(data.follower_count) ||
        0;
      const videoCount =
        parseNumber(data.playlist_count) ||
        (Array.isArray(data.entries) ? data.entries.length : 0);

      const firstEntry = Array.isArray(data.entries) ? data.entries[0] : null;
      if ((!displayName || !avatar) && firstEntry) {
        try {
          const firstUrl =
            (firstEntry.url && /^https?:/.test(String(firstEntry.url)))
              ? String(firstEntry.url)
              : firstEntry.original_url || `${url}/video/${firstEntry.id}`;
          const vmeta = await runYtDlpJson(["-J", "--no-playlist", firstUrl]);
          if (!displayName) displayName = pickDisplayName(vmeta);
          if (!avatar) avatar = pickAvatar(vmeta);
          if (!followerCount) followerCount = parseNumber(vmeta.channel_follower_count) || 0;
        } catch {
          // best-effort; keep what we have
        }
      }

      return {
        username: handle,
        displayName,
        avatarUrl: avatar,
        description: data.description ?? null,
        followerCount,
        followingCount: 0,
        heartCount: 0,
        videoCount,
      };
    } catch {
      // Both scraper and yt-dlp failed — return a minimal profile so the
      // subscribe flow doesn't crash. The user can still browse; stats will
      // refresh when the profile is opened (re-scrape on GET /authors/[username]).
      return {
        username: username.replace(/^@/, ""),
        displayName: null,
        avatarUrl: null,
        description: null,
        followerCount: 0,
        followingCount: 0,
        heartCount: 0,
        videoCount: 0,
      };
    }
  }

  async getAuthorVideos(username: string, limit = 30, offset = 0): Promise<AuthorVideo[]> {
    const url = authorUrl(username);
    const args = ["-J", "--flat-playlist"];
    const start = Math.max(1, offset + 1);
    args.push("--playlist-start", String(start));
    args.push("--playlist-end", String(start + limit - 1));
    args.push(url);
    try {
      const data = await runYtDlpJson(args);
      const entries: any[] = data.entries ?? [];
      const base = authorUrl(username);
      return entries
        .filter((e) => e && (e.id || e.url))
        .map((e) => mapEntry(e, base));
    } catch {
      // yt-dlp failed (e.g. "Unable to extract secondary user ID") — return
      // empty array instead of crashing. The profile page can still be opened;
      // videos will appear after the user clicks "Check for new".
      return [];
    }
  }

  async getVideoMeta(videoUrl: string): Promise<VideoMeta> {
    // Prefer the HTML scraper for author display name / avatar / gallery
    // detection — yt-dlp doesn't expose the author avatar on video pages and
    // its imagePost detection is unreliable.
    let meta: VideoMeta | null = null;
    try {
      const scraped = await scrapeVideoMeta(videoUrl);
      if (scraped) {
        // Get a streamable URL from yt-dlp (scraper doesn't extract formats).
        // Prefer h264 (browser-playable) over h265/bytevc1 (not supported).
        let streamUrl: string | null = null;
        try {
          const data = await runYtDlpJson(["-J", "--no-playlist", videoUrl]);
          const formats: any[] = data.formats ?? [];
          const isH264 = (f: any) => {
            const vc = String(f.vcodec ?? "").toLowerCase();
            return vc.startsWith("h264") || vc.startsWith("avc1");
          };
          const progressive = (f: any) => f.vcodec !== "none" && f.acodec !== "none" && f.url;
          const h264 = formats.find((f) => progressive(f) && isH264(f));
          const anyProg = formats.find((f) => progressive(f));
          if (h264?.url) streamUrl = h264.url;
          else if (anyProg?.url) streamUrl = anyProg.url;
          else if (data.url) streamUrl = data.url;
        } catch {
          // yt-dlp may fail; scraper still gives us metadata
        }
        meta = {
          tiktokId: scraped.tiktokId || "",
          url: videoUrl,
          title: scraped.title ?? null,
          description: scraped.description ?? null,
          thumbnailUrl: scraped.thumbnailUrl ?? null,
          duration: scraped.duration ?? 0,
          width: 0,
          height: 0,
          viewCount: scraped.viewCount ?? 0,
          likeCount: scraped.likeCount ?? 0,
          commentCount: scraped.commentCount ?? 0,
          shareCount: scraped.shareCount ?? 0,
          publishedAt: scraped.publishedAt ?? null,
          isGallery: scraped.isGallery,
          images: scraped.images,
          authorUsername: scraped.authorUsername ?? "",
          authorDisplayName: scraped.authorDisplayName ?? null,
          authorAvatarUrl: scraped.authorAvatarUrl ?? null,
          streamUrl,
        };
      }
    } catch {
      // fall through to yt-dlp-only path
    }
    if (meta) return meta;

    // Fallback: yt-dlp only.
    const data = await runYtDlpJson(["-J", "--no-playlist", videoUrl]);
    const entry = mapEntry(data);
    const authorUsername = pickUsername(data, "");
    const authorDisplayName = pickDisplayName(data);
    const authorAvatarUrl = pickAvatar(data);
    let streamUrl: string | null = null;
    const formats: any[] = data.formats ?? [];
    const isH264 = (f: any) => {
      const vc = String(f.vcodec ?? "").toLowerCase();
      return vc.startsWith("h264") || vc.startsWith("avc1");
    };
    const progressive = (f: any) => f.vcodec !== "none" && f.acodec !== "none" && f.url;
    const h264 = formats.find((f) => progressive(f) && isH264(f));
    const anyProg = formats.find((f) => progressive(f));
    if (h264?.url) streamUrl = h264.url;
    else if (anyProg?.url) streamUrl = anyProg.url;
    else if (data.url) streamUrl = data.url;
    return {
      ...entry,
      authorUsername,
      authorDisplayName,
      authorAvatarUrl,
      streamUrl,
    };
  }

  async getComments(videoUrl: string): Promise<VideoComment[]> {
    // yt-dlp embeds comments in the info json with --write-comments.
    // TikTok comments require extra API calls, so allow a longer timeout.
    const data = await runYtDlpJson(
      ["-J", "--write-comments", "--skip-download", "--no-playlist", videoUrl],
      { timeoutMs: 180_000 },
    );
    let comments: any[] = data.comments ?? [];
    // Flatten nested replies (yt-dlp nests replies under `replies`).
    const flat: any[] = [];
    const walk = (list: any[]) => {
      for (const c of list) {
        if (!c) continue;
        flat.push(c);
        if (Array.isArray(c.replies)) walk(c.replies);
      }
    };
    walk(comments);

    return flat.slice(0, 300).map((c, i) => ({
      id: String(c.id ?? c.comment_id ?? i),
      authorName: c.author ?? c.uploader ?? c.author_id ?? "TikTok user",
      authorAvatar: c.thumbnail ?? c.author_avatar ?? null,
      text: c.text ?? c.comment ?? c.content ?? "",
      likeCount: parseNumber(c.like_count ?? c.heart_count),
      postedAt: parseDate(c.timestamp),
    }));
  }

  async downloadVideo(videoUrl: string, destPath: string): Promise<void> {
    await runYtDlp(
      ["-o", destPath, "--no-part", "--newline", "--no-playlist", videoUrl],
      { timeoutMs: 180_000 },
    );
  }

  async search(query: string, kind: "all" | "author" | "video"): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const wantAuthor = kind === "all" || kind === "author";
    const wantVideo = kind === "all" || kind === "video";
    const seenAuthors = new Set<string>();

    // 1) Try treating the query as a handle (works even with partial / no proxy).
    if (wantAuthor) {
      const handle = query.replace(/^@/, "").trim();
      if (handle) {
        try {
          const profile = await this.getAuthorProfile(handle);
          if (!seenAuthors.has(profile.username)) {
            seenAuthors.add(profile.username);
            results.push({
              kind: "author",
              username: profile.username,
              displayName: profile.displayName,
              avatarUrl: profile.avatarUrl,
              description: profile.description,
              followerCount: profile.followerCount,
            });
          }
        } catch {
          // not a valid handle; ignore
        }
      }
    }

    // 2) Scrape the TikTok search page HTML (more reliable than yt-dlp search).
    try {
      const scraped = await scrapeSearch(query);
      for (const s of scraped) {
        if (s.kind === "author" && wantAuthor) {
          if (!s.username || seenAuthors.has(s.username)) continue;
          seenAuthors.add(s.username);
          results.push({
            kind: "author",
            username: s.username,
            displayName: s.displayName,
            avatarUrl: s.avatarUrl,
            description: s.description,
            followerCount: s.followerCount,
          });
        } else if (s.kind === "video" && wantVideo) {
          results.push({
            kind: "video",
            username: s.authorUsername,
            video: {
              tiktokId: s.tiktokId,
              url: s.url,
              title: s.title,
              description: s.title,
              thumbnailUrl: s.thumbnailUrl,
              duration: s.duration,
              width: 0,
              height: 0,
              viewCount: s.viewCount,
              likeCount: s.likeCount,
              commentCount: s.commentCount,
              shareCount: 0,
              publishedAt: null,
              authorUsername: s.authorUsername,
            },
          });
        }
      }
    } catch {
      // scrape search failed; keep partial results
    }

    // 3) Fallback: yt-dlp search (may fail, but try).
    try {
      if (wantVideo) {
        const data = await runYtDlpJson([
          "-J",
          "--flat-playlist",
          "--playlist-end",
          "24",
          `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`,
        ]);
        const authorField = (e: any) => pickUsername(e, "");
        for (const e of data.entries ?? []) {
          if (!e || !(e.id || e.url)) continue;
          results.push({
            kind: "video",
            username: authorField(e),
            video: {
              ...mapEntry(e),
              authorUsername: authorField(e),
            },
          });
        }
      }
    } catch {
      // search may fail; keep partial results
    }

    return results;
  }
}
