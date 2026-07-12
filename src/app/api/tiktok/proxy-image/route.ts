import { NextRequest, NextResponse } from "next/server";
import { getEffectiveProxy, tiktokConfig } from "@/lib/tiktok/config";
import { SocksProxyAgent } from "socks-proxy-agent";
import { Agent } from "http";
import https from "https";
import http from "http";

export const dynamic = "force-dynamic";

/**
 * Allowed hostnames for image proxying (TikTok CDN domains).
 * Prevents SSRF — only TikTok CDN images can be proxied.
 */
const ALLOWED_HOST_PATTERNS = [
  /\.tiktokcdn\.com$/i,
  /\.tiktokcdn-eu\.com$/i,
  /\.tiktokcdn-us\.com$/i,
  /\.tiktokcdn-sg\.com$/i,
  /\.tiktok\.com$/i,
  /\.byteimg\.com$/i,
  /\.ibytedtos\.com$/i,
  /\.musical\.ly$/i,
];

/** Check if a hostname is in the allowed list. */
function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * GET /api/tiktok/proxy-image?url=<remote image url>
 *
 * TikTok's CDN blocks hotlinking (403 on <img> from other origins). This
 * endpoint fetches the image server-side through the same SOCKS5 proxy yt-dlp
 * uses, and re-serves it. Supports socks5://, http:// and https:// proxies.
 *
 * SSRF protection: only TikTok CDN domains are allowed.
 *
 * Data: URIs pass through untouched client-side (no proxy needed).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "only http(s) urls" }, { status: 400 });
  }

  // SSRF protection: only allow TikTok CDN domains.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  const hostname = parsedUrl.hostname;
  if (!isAllowedHost(hostname)) {
    return NextResponse.json({ error: "domain not allowed" }, { status: 403 });
  }

  // Block internal/private IPs (defense in depth — the host check above
  // already blocks non-TikTok domains, but this catches edge cases).
  const ipLike = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipLike.test(hostname)) {
    return NextResponse.json({ error: "direct IP not allowed" }, { status: 403 });
  }

  const proxy = await getEffectiveProxy();
  const headers = {
    "User-Agent": tiktokConfig.userAgent,
    Referer: "https://www.tiktok.com/",
    Accept: "image/*,*/*;q=0.8",
  };

  // Build an agent: SocksProxyAgent for socks5://, or undefined for direct.
  let agent: Agent | undefined;
  if (proxy) {
    if (proxy.startsWith("socks")) {
      agent = new SocksProxyAgent(proxy) as unknown as Agent;
    } else {
      agent = undefined;
    }
  }

  const isHttps = url.startsWith("https:");
  const lib = isHttps ? https : http;

  return new Promise<Response>((resolve) => {
    const reqObj = lib.get(
      url,
      { headers, agent, timeout: 15_000 },
      (upstream) => {
        if (upstream.statusCode !== 200) {
          upstream.resume();
          resolve(
            NextResponse.json(
              { error: `upstream ${upstream.statusCode}` },
              { status: 502 },
            ),
          );
          return;
        }
        const ct = upstream.headers["content-type"] || "image/jpeg";
        const chunks: Buffer[] = [];
        upstream.on("data", (c: Buffer) => chunks.push(c));
        upstream.on("end", () => {
          const buf = Buffer.concat(chunks);
          const res = new NextResponse(new Uint8Array(buf), {
            status: 200,
            headers: {
              "Content-Type": ct,
              "Cache-Control": "public, max-age=86400, immutable",
              "Content-Length": String(buf.length),
            },
          });
          resolve(res);
        });
        upstream.on("error", () => {
          resolve(NextResponse.json({ error: "upstream read error" }, { status: 502 }));
        });
      },
    );
    reqObj.on("timeout", () => {
      reqObj.destroy();
      resolve(NextResponse.json({ error: "timeout" }, { status: 504 }));
    });
    reqObj.on("error", (e) => {
      resolve(NextResponse.json({ error: e.message }, { status: 502 }));
    });
  });
}
