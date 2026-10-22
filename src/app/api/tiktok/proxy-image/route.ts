import { NextRequest, NextResponse } from "next/server";
import { getEffectiveProxy, tiktokConfig } from "@/lib/tiktok/config";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { Agent } from "node:http";
import https from "node:https";
import http from "node:http";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function validateImageUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const expectedPort = url.protocol === "https:" ? "443" : "80";
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      (url.port && url.port !== expectedPort) ||
      !isAllowedHost(url.hostname.toLowerCase())
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/**
 * GET /api/tiktok/proxy-image?url=<remote image url>
 * Fetch only TikTok CDN images and cap both transfer size and request time.
 */
export async function GET(req: NextRequest) {
  const value = req.nextUrl.searchParams.get("url");
  if (!value) return errorResponse("url required", 400);
  const url = validateImageUrl(value);
  if (!url) return errorResponse("invalid or disallowed image URL", 403);

  const proxy = await getEffectiveProxy();
  let agent: Agent | undefined;
  if (proxy) {
    if (/^socks5h?:\/\//i.test(proxy)) {
      try {
        agent = new SocksProxyAgent(proxy) as unknown as Agent;
      } catch {
        return errorResponse("configured proxy is invalid", 502);
      }
    } else if (/^https?:\/\//i.test(proxy)) {
      try { agent = new HttpsProxyAgent(proxy) as unknown as Agent; }
      catch { return errorResponse("configured proxy is invalid", 502); }
    } else {
      return errorResponse("configured proxy scheme is unsupported", 502);
    }
  }

  const headers = {
    "User-Agent": tiktokConfig.userAgent,
    Referer: "https://www.tiktok.com/",
    Accept: "image/*",
  };
  const client = url.protocol === "https:" ? https : http;

  return new Promise<Response>((resolve) => {
    let settled = false;
    let upstream: import("node:http").IncomingMessage | null = null;
    let reqObj: import("node:http").ClientRequest | null = null;
    let timer: NodeJS.Timeout;
    const finish = (response: Response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response);
    };
    timer = setTimeout(() => {
      upstream?.destroy();
      reqObj?.destroy();
      finish(errorResponse("image request timed out", 504));
    }, REQUEST_TIMEOUT_MS);

    try {
      reqObj = client.get(url, { headers, agent }, (response) => {
        upstream = response;
        response.on("error", () => {
          finish(errorResponse("image upstream read failed", 502));
        });
        if (response.statusCode !== 200) {
          response.resume();
          finish(errorResponse(`image upstream returned HTTP ${response.statusCode ?? 0}`, 502));
          return;
        }

        const contentType = String(response.headers["content-type"] ?? "")
          .split(";", 1)[0]
          .trim()
          .toLowerCase();
        if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
          response.destroy();
          finish(errorResponse("upstream did not return a supported image", 502));
          return;
        }

        const contentLength = Number(response.headers["content-length"]);
        if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
          response.destroy();
          finish(errorResponse("image exceeds the 10 MB limit", 413));
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > MAX_IMAGE_BYTES) {
            response.destroy();
            finish(errorResponse("image exceeds the 10 MB limit", 413));
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => {
          const body = Buffer.concat(chunks, size);
          finish(new NextResponse(new Uint8Array(body), {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400, immutable",
              "Content-Length": String(body.length),
              "X-Content-Type-Options": "nosniff",
            },
          }));
        });
      });
      reqObj.on("error", () => {
        finish(errorResponse("image upstream request failed", 502));
      });
    } catch {
      finish(errorResponse("image upstream request failed", 502));
    }
  });
}
