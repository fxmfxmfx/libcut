/**
 * Proxy + runtime configuration for the TikTok parser.
 *
 * The SOCKS5 proxy is configurable at runtime via the settings panel (stored in
 * the DB `Setting` table). Env var TIKTOK_PROXY is used as a fallback/default.
 * `proxyEnabled` defaults to true so that a configured proxy is actually used.
 *
 *   TIKTOK_PROXY=socks5://user:pass@1.2.3.4:1080
 */

export interface TikTokConfig {
  ytdlpPath: string;
  socketTimeout: number;
  retries: number;
  cacheDir: string;
  cacheTtlMs: number;
  demoMode: boolean;
  userAgent: string;
  defaultProxy: string | null;
  /** Data storage mode: "local" = SQLite on server, "client" = browser localStorage. */
  dataMode: "local" | "client";
}

function envBool(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return def;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function envInt(name: string, def: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

export const tiktokConfig: TikTokConfig = {
  ytdlpPath: process.env.YTDLP_PATH || "yt-dlp",
  socketTimeout: envInt("TIKTOK_SOCKET_TIMEOUT", 30),
  retries: envInt("TIKTOK_RETRIES", 3),
  cacheDir: process.env.TIKTOK_CACHE_DIR || "/home/z/my-project/cache/videos",
  cacheTtlMs: envInt("TIKTOK_CACHE_TTL_MIN", 10) * 60 * 1000,
  demoMode: envBool("DEMO_MODE", true),
  userAgent:
    process.env.TIKTOK_UA ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  defaultProxy: process.env.TIKTOK_PROXY && process.env.TIKTOK_PROXY.trim() !== "" ? process.env.TIKTOK_PROXY.trim() : null,
  dataMode: (process.env.DATA_MODE === "client" ? "client" : "local") as "local" | "client",
};

/**
 * Resolve the effective proxy URL at request time.
 * Reads from the DB `Setting` table (proxyEnabled + proxy), falling back to env.
 * Returns null when proxy is disabled or no proxy is configured.
 */
export async function getEffectiveProxy(): Promise<string | null> {
  // Lazy import to avoid circular deps at module load.
  const { db } = await import("@/lib/db");
  try {
    const enabled = await db.setting.findUnique({ where: { key: "proxyEnabled" } });
    const url = await db.setting.findUnique({ where: { key: "proxyUrl" } });
    // If explicitly disabled in settings, return null.
    if (enabled && enabled.value === "false") return null;
    // If a URL is set in settings, use it.
    if (url && url.value.trim() !== "") return url.value.trim();
    // Otherwise fall through to env default (TIKTOK_PROXY).
  } catch {
    // DB not ready yet (e.g. during init) — fall through to env default.
  }
  return tiktokConfig.defaultProxy;
}

/**
 * Build the common yt-dlp args. Proxy is resolved per-call so runtime settings
 * apply immediately. Pass the resolved proxy explicitly to avoid re-querying.
 */
export function ytdlpCommonArgs(proxy: string | null): string[] {
  const args: string[] = [
    "--no-playlist-reverse",
    "--no-warnings",
    "--no-check-certificate",
    `--socket-timeout=${tiktokConfig.socketTimeout}`,
    `--retries=${tiktokConfig.retries}`,
    `--user-agent=${tiktokConfig.userAgent}`,
    // Prefer h264 progressive MP4 (browser-playable). TikTok serves both h264
    // and h265 (bytevc1) — h265 is NOT playable in Chrome/Firefox/Safari, so we
    // must explicitly request h264. The "download" format is watermarked, skip.
    "-f",
    "best[vcodec^=h264][ext=mp4]/best[vcodec^=avc1][ext=mp4]/best[ext=mp4]/best",
  ];
  if (proxy) {
    args.push(`--proxy=${proxy}`);
  }
  return args;
}
