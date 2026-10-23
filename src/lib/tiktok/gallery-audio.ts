import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { withUpstreamSlot } from "./library";
import { getEffectiveProxy, tiktokConfig } from "./config";

const execFileAsync = promisify(execFile);
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
const pending = new Map<string, Promise<string>>();

/** Restrict soundtrack URLs to TikTok-owned media CDNs. */
export function isAllowedGalleryAudioUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ["tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "tiktokcdn-sg.com", "byteoversea.com", "muscdn.com", "ibytedtos.com"].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch { return false; }
}

export function galleryAudioMime(url: string): string {
  const path = new URL(url).pathname.toLowerCase();
  if (path.endsWith(".wav")) return "audio/wav";
  if (path.endsWith(".ogg")) return "audio/ogg";
  if (path.endsWith(".aac")) return "audio/aac";
  if (path.endsWith(".m4a")) return "audio/mp4";
  return "audio/mpeg";
}

async function cachedAudioMime(file: string, url: string): Promise<string> {
  const handle = await fs.open(file, "r");
  try {
    const header = Buffer.alloc(16);
    await handle.read(header, 0, header.length, 0);
    if (header.toString("ascii", 4, 8) === "ftyp") return "audio/mp4";
    if (header.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
    if (header.toString("ascii", 0, 4) === "RIFF") return "audio/wav";
    if (header[0] === 0xff && (header[1] & 0xf6) === 0xf0) return "audio/aac";
    return galleryAudioMime(url);
  } finally { await handle.close(); }
}

/** Download a validated soundtrack to the configured media cache, coalescing concurrent requests. */
export async function ensureGalleryAudio(videoId: string, url: string): Promise<{ path: string; mime: string }> {
  if (!/^[a-z0-9_-]{1,128}$/i.test(videoId)) throw new Error("Invalid video identifier");
  if (!isAllowedGalleryAudioUrl(url)) throw new Error("TikTok returned an unsupported soundtrack URL");
  const key = `${videoId}:${url}`;
  let task = pending.get(key);
  if (!task) {
    task = withUpstreamSlot(async () => {
      const cacheDir = tiktokConfig.cacheDir;
      await fs.mkdir(cacheDir, { recursive: true });
      const destination = `${cacheDir}/${videoId}.audio`;
      try {
        const cached = await fs.stat(destination);
        if (cached.isFile() && cached.size > 0 && cached.size <= MAX_AUDIO_BYTES && Date.now() - cached.mtimeMs < tiktokConfig.cacheTtlMs) return destination;
      } catch { /* cache miss */ }
      const temporary = `${destination}.${randomUUID()}.tmp`;
      try {
        const proxy = await getEffectiveProxy();
        const args = ["-fsS", "--write-out", "%{http_code} %{content_type}", "--proto", "=https", "--proto-redir", "=https", "--max-redirs", "0", "--max-time", "45", "--max-filesize", String(MAX_AUDIO_BYTES), "-A", tiktokConfig.userAgent, "-o", temporary];
        if (proxy) args.push("--proxy", proxy);
        args.push(url);
        const { stdout } = await execFileAsync("curl", args, { timeout: 50_000, maxBuffer: 64 * 1024 });
        if (!/^200 (?:audio\/|video\/mp4|application\/octet-stream)/i.test(stdout.trim())) throw new Error("Soundtrack response was not audio");
        const stat = await fs.stat(temporary);
        if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_AUDIO_BYTES) throw new Error("Soundtrack download exceeded its size limit");
        await fs.rename(temporary, destination);
        return destination;
      } catch (error) {
        await fs.unlink(temporary).catch(() => {});
        throw error;
      }
    });
    pending.set(key, task);
  }
  try { const path = await task; return { path, mime: await cachedAudioMime(path, url) }; }
  finally { if (pending.get(key) === task) pending.delete(key); }
}
