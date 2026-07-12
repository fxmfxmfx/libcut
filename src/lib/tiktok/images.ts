/** Rewrite a remote image URL to go through the server-side image proxy. */

/**
 * TikTok's CDN blocks hotlinking (403 on <img> from other origins). Any remote
 * http(s) image is rewritten to /api/tiktok/proxy-image?url=... so it loads.
 * Data: URIs (inline SVGs used in demo mode) pass through untouched.
 */
export function proxyImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  return `/api/tiktok/proxy-image?url=${encodeURIComponent(url)}`;
}
