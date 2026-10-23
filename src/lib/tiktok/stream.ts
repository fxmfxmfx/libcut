/**
 * Helpers for serving video files: range-aware local streaming + on-demand
 * caching via the provider.
 */

import { randomUUID } from "node:crypto";
import { promises as fs, createReadStream } from "node:fs";
import type { NextRequest } from "next/server";
import { tiktokConfig } from "./config";
import { tiktokProvider } from "./index";
import { cachePathFor, markCached } from "./cache";
import { TikTokError } from "./types";

type Video = { id: string; url: string; cachedPath: string | null };

const pendingDownloads = new Map<string, Promise<string | null>>();

/**
 * Make sure a local playable file exists for the video. Concurrent requests
 * for the same video share one download, which is important for video clients
 * that issue parallel range requests when playback starts.
 */
export async function ensureLocalFile(video: Video): Promise<string | null> {
  if (video.cachedPath) {
    try {
      const stat = await fs.stat(video.cachedPath);
      if (stat.isFile() && stat.size > 0) return video.cachedPath;
    } catch {
      // The cache entry can outlive its file; download it again below.
    }
  }
  if (tiktokConfig.demoMode) return null;

  const existing = pendingDownloads.get(video.id);
  if (existing) return existing;

  const download = (async () => {
    const dest = cachePathFor(video.id, "mp4");
    const temporary = `${dest}.${randomUUID()}.mp4`;
    try {
      await tiktokProvider.downloadVideo(video.url, temporary);
      const stat = await fs.stat(temporary);
      if (!stat.isFile() || stat.size === 0) throw new Error("Video download is empty");
      await fs.rename(temporary, dest);
      try { await markCached(video.id, dest); }
      catch (error) { await fs.unlink(dest).catch(() => {}); throw error; }
      return dest;
    } catch (e) {
      await fs.unlink(temporary).catch(() => {});
      if (e instanceof TikTokError) throw e;
      throw new TikTokError(`download failed: ${(e as Error).message}`, "network");
    }
  })();
  pendingDownloads.set(video.id, download);
  try {
    return await download;
  } finally {
    if (pendingDownloads.get(video.id) === download) pendingDownloads.delete(video.id);
  }
}

/** Stat a file safely. */
async function fileSize(p: string): Promise<number> {
  const s = await fs.stat(p);
  return s.size;
}

function contentDisposition(filename: string): string {
  const safe = filename.replace(/[\r\n"\\]/g, "_");
  const fallback = safe.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(safe).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function rangeNotSatisfiable(size: number, headers: Record<string, string>): Response {
  return new Response(null, {
    status: 416,
    headers: { ...headers, "Content-Range": `bytes */${size}`, "Content-Length": "0" },
  });
}

/** Parse one byte range, including the suffix form `bytes=-N`. */
function parseRange(value: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;

  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) {
    return null;
  }

  if (first === null) {
    if (last === null || last <= 0) return null;
    return { start: Math.max(0, size - last), end: size - 1 };
  }
  if (first >= size || (last !== null && last < first)) return null;
  return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}

async function streamFile(
  filePath: string,
  start?: number,
  end?: number,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const file = createReadStream(filePath, {
    start, end, highWaterMark: 64 * 1024, autoClose: true,
  });
  const chunks = file[Symbol.asyncIterator]();
  let stopped = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  function stop() {
    stopped = true;
    signal?.removeEventListener("abort", abort);
    file.destroy();
  }
  function abort() {
    if (stopped) return;
    stop();
    controller.close();
  }
  // Keep reads bounded and close the descriptor on disconnect, even when the
  // HTTP adapter does not propagate cancellation to the response body.
  return new ReadableStream<Uint8Array>({
    start(output) {
      controller = output;
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    },
    async pull(output) {
      if (stopped) return;
      try {
        const chunk = await chunks.next();
        if (stopped) return;
        if (chunk.done) {
          stop();
          output.close();
        } else {
          output.enqueue(chunk.value);
        }
      } catch (error) {
        if (!stopped) {
          stop();
          output.error(error);
        }
      }
    },
    cancel() { stop(); },
  });
}

/**
 * Stream a local file with HTTP Range support (so the <video> element can
 * seek). Invalid and unsatisfiable single ranges return 416.
 */
export async function streamLocalFile(
  filePath: string,
  req: NextRequest,
  opts: { asAttachment?: boolean; filename?: string; mime?: string } = {},
): Promise<Response> {
  let size: number;
  try {
    size = await fileSize(filePath);
  } catch {
    return new Response(null, { status: 404 });
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": opts.mime || "video/mp4",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  };
  if (opts.asAttachment && opts.filename) {
    baseHeaders["Content-Disposition"] = contentDisposition(opts.filename);
  }

  const rangeHeader = req.headers.get("range");
  if (rangeHeader !== null) {
    const range = parseRange(rangeHeader, size);
    if (!range) return rangeNotSatisfiable(size, baseHeaders);
    const length = range.end - range.start + 1;
    return new Response(req.method === "HEAD" ? null : await streamFile(filePath, range.start, range.end, req.signal), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(length),
      },
    });
  }

  return new Response(req.method === "HEAD" ? null : await streamFile(filePath, undefined, undefined, req.signal), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}

/** Build a safe filename for a video download. */
export function downloadFilename(video: {
  title: string | null;
  tiktokId: string;
  author?: { username: string } | null;
}): string {
  const authorPart = (video.author?.username ?? "tiktok").replace(/[^a-z0-9._-]/gi, "_");
  const titlePart = (video.title ?? video.tiktokId)
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF\u00C0-\u024F\s-]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  const idPart = video.tiktokId.replace(/[^a-z0-9_-]/gi, "_");
  return `${authorPart}-${titlePart || idPart || "video"}.mp4`;
}
