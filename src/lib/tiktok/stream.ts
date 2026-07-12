/**
 * Helpers for serving video files: range-aware local streaming + on-demand
 * caching via the provider.
 */

import { promises as fs } from "fs";
import type { NextRequest } from "next/server";
import { tiktokConfig } from "./config";
import { tiktokProvider } from "./index";
import { cachePathFor, markCached } from "./cache";
import { TikTokError } from "./types";

type Video = { id: string; url: string; cachedPath: string | null };

/**
 * Make sure a local playable file exists for the video.
 * - Real mode: download via provider into the cache (if not already cached).
 * - Demo mode: returns null (caller should redirect to the remote streamUrl).
 * Returns the absolute file path, or null if no local file is available.
 */
export async function ensureLocalFile(video: Video): Promise<string | null> {
  // Already cached?
  if (video.cachedPath) {
    try {
      await fs.access(video.cachedPath);
      return video.cachedPath;
    } catch {
      // fall through and re-download
    }
  }
  if (tiktokConfig.demoMode) {
    return null; // demo uses remote sample URLs
  }
  const dest = cachePathFor(video.id, "mp4");
  try {
    await tiktokProvider.downloadVideo(video.url, dest);
  } catch (e) {
    if (e instanceof TikTokError) throw e;
    throw new TikTokError(`download failed: ${(e as Error).message}`, "network");
  }
  await markCached(video.id, dest);
  return dest;
}

/** Stat a file safely. */
async function fileSize(p: string): Promise<number> {
  try {
    const s = await fs.stat(p);
    return s.size;
  } catch {
    return 0;
  }
}

/**
 * Stream a local file with HTTP Range support (so the <video> element can
 * seek). Returns a Next.js Response.
 */
export async function streamLocalFile(
  filePath: string,
  req: NextRequest,
  opts: { asAttachment?: boolean; filename?: string; mime?: string } = {},
): Promise<Response> {
  const size = await fileSize(filePath);
  const mime = opts.mime || "video/mp4";
  const rangeHeader = req.headers.get("range");

  const baseHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Cache-Control": "private, no-store",
  };
  if (opts.asAttachment && opts.filename) {
    baseHeaders["Content-Disposition"] = `attachment; filename="${opts.filename.replace(/"/g, "_")}"`;
  }

  if (rangeHeader) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : size - 1;
      const clampedEnd = Math.min(end, size - 1);
      const chunkSize = clampedEnd - start + 1;
      const fileHandle = await fs.open(filePath, "r");
      const stream = fileHandle.createReadStream({ start, end: clampedEnd });
      // Convert Node stream to Web ReadableStream.
      const webStream = new ReadableStream({
        start(controller) {
          stream.on("data", (d: Buffer) => controller.enqueue(new Uint8Array(d)));
          stream.on("end", () => {
            controller.close();
            fileHandle.close().catch(() => {});
          });
          stream.on("error", (err) => {
            controller.error(err);
            fileHandle.close().catch(() => {});
          });
        },
        cancel() {
          stream.destroy();
          fileHandle.close().catch(() => {});
        },
      });
      return new Response(webStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${clampedEnd}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
        },
      });
    }
  }

  // Full file.
  const fileHandle = await fs.open(filePath, "r");
  const stream = fileHandle.createReadStream();
  const webStream = new ReadableStream({
    start(controller) {
      stream.on("data", (d: Buffer) => controller.enqueue(new Uint8Array(d)));
      stream.on("end", () => {
        controller.close();
        fileHandle.close().catch(() => {});
      });
      stream.on("error", (err) => {
        controller.error(err);
        fileHandle.close().catch(() => {});
      });
    },
    cancel() {
      stream.destroy();
      fileHandle.close().catch(() => {});
    },
  });
  return new Response(webStream, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Accept-Ranges": "bytes",
      "Content-Length": String(size),
    },
  });
}

/** Build a safe filename for a video download. */
export function downloadFilename(video: {
  title: string | null;
  tiktokId: string;
  author?: { username: string } | null;
}): string {
  const authorPart = video.author?.username ?? "tiktok";
  const titlePart = (video.title ?? video.tiktokId)
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF\u00C0-\u024F\s-]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${authorPart}-${titlePart || video.tiktokId}.mp4`;
}
