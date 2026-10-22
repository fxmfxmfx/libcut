/**
 * tiktok-comments mini-service.
 *
 * Extracts TikTok comments using a headless Chromium (puppeteer + stealth).
 * - Accepts GDPR consent (required for EEA proxy regions).
 * - Clicks the comment icon to trigger the signed comment API request.
 * - Captures top-level comments AND reply threads (clicks "View replies").
 * - Sorts by popularity (likes descending).
 *
 * Port: 3040. The Next.js app calls this via localhost.
 */

import { createServer } from "http";
import { URL } from "url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Server as ProxyServer } from "proxy-chain";
import { collectSearchResults, MAX_SEARCH_RESULTS, type SearchKind, type SearchResult } from "./search-parsing";

puppeteer.use(StealthPlugin());

const PORT = 3040;
const HOST = "127.0.0.1";
const MAX_TOP_LEVEL_COMMENTS = 100;
const MAX_CONCURRENT_SCRAPES = 2;
const SCRAPE_TIMEOUT_MS = 75_000;
const NAVIGATION_TIMEOUT_MS = 25_000;
const SEARCH_TIMEOUT_MS = 35_000;
const MAX_SEARCH_QUERY_LENGTH = 200;
let activeScrapes = 0;

function validateVideoUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isTikTokHost = hostname === "tiktok.com" || hostname === "www.tiktok.com" || hostname === "m.tiktok.com";
    if (
      url.protocol !== "https:" ||
      !isTikTokHost ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      !/^\/@[a-z0-9._-]+\/video\/\d+\/?$/i.test(url.pathname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

let browserPromise: Promise<any> | null = null;
let browserProxyServer: ProxyServer | null = null;
let browserProxyKey: string | null | undefined;

class ScrapeBusyError extends Error {}

function publicError(error: unknown, proxyOverride?: string | null): string {
  const message = error instanceof Error ? error.message : "TikTok request failed";
  const proxy = proxyOverride === undefined
    ? (process.env.TIKTOK_PROXY || process.env.HTTPS_PROXY || "")
    : proxyOverride ?? "";
  return message
    .split(proxy).join(proxy ? "[configured proxy]" : "")
    .replace(/((?:socks5h?|https?):\/\/)[^/\s]*@/gi, "$1[redacted]@");
}

function configuredProxy(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:", "socks5:", "socks5h:"].includes(parsed.protocol) ||
      !parsed.hostname || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/")
    ) {
      throw new Error("unsupported proxy URL");
    }
    return parsed.toString();
  } catch {
    throw new Error("TikTok proxy configuration is invalid or unsupported.");
  }
}

async function closeCurrentBrowser() {
  const browserTask = browserPromise;
  const proxyServer = browserProxyServer;
  browserPromise = null;
  browserProxyServer = null;
  browserProxyKey = undefined;
  try {
    const browser = browserTask ? await browserTask : null;
    if (browser?.isConnected()) await browser.close();
  } catch {
    // Close any remaining bridge below; browser launch/close errors stay generic.
  }
  if (proxyServer) await proxyServer.close(true).catch(() => {});
}

async function getBrowser(proxyOverride?: string | null) {
  const proxy = configuredProxy(
    proxyOverride === undefined
      ? (process.env.TIKTOK_PROXY || process.env.HTTPS_PROXY || null)
      : proxyOverride,
  );
  const proxyKey = proxy;

  if (browserPromise && browserProxyKey !== proxyKey) {
    if (activeScrapes > 1) {
      throw new ScrapeBusyError("Proxy settings changed while another scrape is active; retry shortly.");
    }
    await closeCurrentBrowser();
  }
  if (browserPromise) return browserPromise;

  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-blink-features=AutomationControlled",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  ];
  const launchPromise = (async () => {
    let localProxy: ProxyServer | null = null;
    if (proxy) {
      localProxy = new ProxyServer({
        host: "127.0.0.1",
        port: 0,
        prepareRequestFunction: () => ({ upstreamProxyUrl: proxy }),
      });
      try {
        await localProxy.listen();
      } catch {
        await localProxy.close(true).catch(() => {});
        throw new Error("TikTok proxy bridge could not start.");
      }
      browserProxyServer = localProxy;
      args.push(`--proxy-server=http://127.0.0.1:${localProxy.port}`);
    }

    try {
      const browser = await puppeteer.launch({ headless: true, args });
      browser.on("disconnected", () => {
        if (browserPromise === launchPromise) {
          browserPromise = null;
          browserProxyKey = undefined;
        }
        if (browserProxyServer === localProxy) browserProxyServer = null;
        if (localProxy) void localProxy.close(true).catch(() => {});
      });
      return browser;
    } catch {
      if (browserPromise === launchPromise) {
        browserPromise = null;
        browserProxyKey = undefined;
      }
      if (browserProxyServer === localProxy) browserProxyServer = null;
      if (localProxy) await localProxy.close(true).catch(() => {});
      throw new Error("TikTok browser could not start with the configured network route.");
    }
  })();
  browserPromise = launchPromise;
  browserProxyKey = proxyKey;
  return launchPromise;
}

interface Comment {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  text: string;
  likeCount: number;
  postedAt: string | null;
  parentId: string | null;
  replyCount: number;
}

/** Parse a TikTok comment object from the API response. */
function parseComment(c: any): Comment | null {
  const id = String(c.cid ?? c.id ?? c.comment_id ?? "");
  if (!id) return null;
  // Top-level comments: reply_comment is the parent object (if this is a reply).
  // Reply comments (from reply API): reply_id is the parent comment id (reply_comment is null).
  // reply_id can be 0, "0", or a real id — use Number() to normalize.
  const replyIdNum = Number(c.reply_id);
  const parentId = c.reply_comment?.cid
    ? String(c.reply_comment.cid)
    : replyIdNum > 0
      ? String(c.reply_id)
      : null;
  return {
    id,
    authorName: c.user?.nickname ?? c.user?.unique_id ?? c.nickname ?? "TikTok user",
    authorAvatar: c.user?.avatar_thumb?.url_list?.[0] ?? c.avatar_thumb?.[0] ?? null,
    text: c.text ?? "",
    likeCount: c.digg_count ?? c.like_count ?? 0,
    postedAt: c.create_time ? new Date(c.create_time * 1000).toISOString() : null,
    parentId,
    replyCount: c.reply_comment_total ?? 0,
  };
}

function isValidSearchKind(value: string | null): value is SearchKind {
  return value === "all" || value === "author" || value === "video";
}

function requestProxyOverride(req: import("http").IncomingMessage): string | null | undefined {
  const header = req.headers["x-libcut-proxy"];
  if (header === undefined) return undefined;
  if (typeof header !== "string") throw new Error("Invalid proxy override header.");
  return header.trim() ? configuredProxy(header) : null;
}

async function fetchSearchResults(query: string, kind: SearchKind, proxyOverride?: string | null): Promise<SearchResult[]> {
  const browser = await getBrowser(proxyOverride);
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(15_000);
  page.setDefaultTimeout(8_000);
  const hardTimeout = setTimeout(() => page.close().catch(() => {}), SEARCH_TIMEOUT_MS);
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  const responseTasks = new Set<Promise<void>>();
  let lastEndpoint: "general" | "item" | "user" | null = null;

  const merge = (found: SearchResult[]) => {
    for (const result of found) {
      if (results.length >= MAX_SEARCH_RESULTS) break;
      const key = result.kind === "author"
        ? `author:${result.username.toLowerCase()}`
        : `video:${result.tiktokId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(result);
    }
  };

  try {
    await page.setViewport({ width: 1440, height: 900 });
    page.on("response", (response: any) => {
      const match = response.url().match(/\/api\/search\/(general|item|user)\/full/i);
      if (!match) return;
      const endpointKind = match[1].toLowerCase() as "general" | "item" | "user";
      lastEndpoint = endpointKind;
      const task = (async () => {
        try {
          const payload = await response.json();
          merge(collectSearchResults(payload, endpointKind, kind));
        } catch {
          // TikTok may return an empty or non-JSON search response.
        }
      })();
      responseTasks.add(task);
      void task.finally(() => responseTasks.delete(task));
    });

    await page.setRequestInterception(true);
    page.on("request", (request: any) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        try {
          const target = new URL(request.url());
          const host = target.hostname.toLowerCase();
          const isTikTokHost = host === "tiktok.com" || host.endsWith(".tiktok.com");
          const validVideo = isTikTokHost && validateVideoUrl(target.toString()) !== null;
          const fixedSearch = target.origin === "https://www.tiktok.com" && target.pathname === "/search";
          if (target.protocol !== "https:" || (!validVideo && !fixedSearch)) {
            void request.abort().catch(() => {});
            return;
          }
        } catch {
          void request.abort().catch(() => {});
          return;
        }
      }
      void request.continue().catch(() => {});
    });

    const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.evaluate(() => {
      const opts = "path=/; domain=.tiktok.com; max-age=31536000; SameSite=None; Secure";
      document.cookie = `tiktok_web_cookie_consent=1; ${opts}`;
      document.cookie = `cookie-consent=1; ${opts}`;
      document.cookie = `EU_COOKIE_CONSENT=1; ${opts}`;
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 8_000 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 5_000));

    const hasAuthors = () => results.some((result) => result.kind === "author");
    if (kind === "author" || (kind === "all" && !hasAuthors())) {
      await page.evaluate(() => {
        const controls = Array.from(document.querySelectorAll("button,[role=tab]"));
        const usersTab = controls.find((element) => /^(users?|accounts?|creators?)$/i.test((element.textContent || "").trim()));
        (usersTab as HTMLElement | undefined)?.click();
      }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    if (kind === "video" && results.length === 0) {
      await page.evaluate(() => {
        const controls = Array.from(document.querySelectorAll("button,[role=tab]"));
        const videosTab = controls.find((element) => /^videos?$/i.test((element.textContent || "").trim()));
        (videosTab as HTMLElement | undefined)?.click();
      }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    if (responseTasks.size) await Promise.allSettled([...responseTasks]);

    if (results.length === 0) {
      const pageText = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      if (/captcha|verify to continue|unusual traffic|access denied|temporarily blocked/i.test(pageText)) {
        throw new Error("TikTok blocked search. Check the configured proxy or try again later.");
      }
      // Retain endpoint evidence for diagnostics without returning browser content.
      if (!lastEndpoint) throw new Error("TikTok search returned no usable response; the search may be blocked.");
      throw new Error(`TikTok ${lastEndpoint} search returned no results; the search may be blocked or unavailable.`);
    }
    return results.slice(0, MAX_SEARCH_RESULTS);
  } finally {
    clearTimeout(hardTimeout);
    await page.close().catch(() => {});
  }
}

/** Extract comments for a TikTok video URL using a headless browser. */
async function fetchComments(videoUrl: string, limit = 30, proxyOverride?: string | null): Promise<Comment[]> {
  const browser = await getBrowser(proxyOverride);
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  page.setDefaultTimeout(10_000);
  const hardTimeout = setTimeout(() => {
    page.close().catch(() => {});
  }, SCRAPE_TIMEOUT_MS);

  const allComments: Comment[] = [];
  const seenIds = new Set<string>();
  let commentResponseCaptured = false;
  let commentResponseValid = false;
  const deadline = Date.now() + SCRAPE_TIMEOUT_MS;
  const checkDeadline = () => {
    if (Date.now() >= deadline) throw new Error("TikTok comments timed out; try again later.");
  };
  const pause = async (durationMs: number) => {
    checkDeadline();
    await new Promise((resolve) => setTimeout(resolve, Math.min(durationMs, Math.max(1, deadline - Date.now()))));
    checkDeadline();
  };

  try {
    await page.setViewport({ width: 1440, height: 900 });

    // Intercept BOTH top-level and reply comment API responses.
    page.on("response", async (res: any) => {
      const u = res.url();
      if (u.includes("/api/comment/list")) {
        commentResponseCaptured = true;
        try {
          const text = await res.text();
          if (!text) return;
          let json: any;
          try { json = JSON.parse(text); } catch { return; }
          if (!json || typeof json !== "object" || (json.status_code !== undefined && Number(json.status_code) !== 0) || (!Array.isArray(json.comments) && json.comments !== null)) return;
          commentResponseValid = true;
          const cs = json?.comments ?? [];
          for (const c of cs) {
            const parsed = parseComment(c);
            if (!parsed || seenIds.has(parsed.id)) continue;
            seenIds.add(parsed.id);
            allComments.push(parsed);
          }
        } catch {
          // response read error
        }
      }
    });

    // TikTok may redirect the canonical URL. Keep top-level navigations within
    // HTTPS TikTok hosts so the browser cannot be redirected to local services.
    await page.setRequestInterception(true);
    page.on("request", (request: any) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        try {
          const target = new URL(request.url());
          const host = target.hostname.toLowerCase();
          const isTikTokHost = host === "tiktok.com" || host.endsWith(".tiktok.com");
          if (target.protocol !== "https:" || !isTikTokHost) {
            void request.abort().catch(() => {});
            return;
          }
        } catch {
          void request.abort().catch(() => {});
          return;
        }
      }
      void request.continue().catch(() => {});
    });

    // networkidle2 ensures the SPA is fully rendered (required for consent + comment icon).
    checkDeadline();
    await page.goto(videoUrl, { waitUntil: "networkidle2", timeout: 60_000 });
    checkDeadline();
    const initialText = await page.evaluate(() => document.body?.innerText ?? "");
    if (/video (?:is )?(?:currently )?unavailable|couldn.t find this video|video has been (?:removed|deleted)/i.test(initialText)) {
      throw new Error("This video is unavailable on TikTok in the server's region or has been removed.");
    }

    // Accept GDPR consent by setting cookies, then reload to apply them.
    // Reload with networkidle2 is required — without it, consent wall blocks the comment click.
    await page.evaluate(() => {
      const opts = "path=/; domain=.tiktok.com; max-age=31536000; SameSite=None; Secure";
      document.cookie = `tiktok_web_cookie_consent=1; ${opts}`;
      document.cookie = `cookie-consent=1; ${opts}`;
      document.cookie = `EU_COOKIE_CONSENT=1; ${opts}`;
    });
    await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
    checkDeadline();

    // Click the comment icon — TikTok fires the signed comment API request.
    const el = await page.$('[data-e2e="comment-icon"]');
    if (el) {
      await el.evaluate((e: any) => e.scrollIntoView({ block: "center" }));
      await new Promise((r) => setTimeout(r, 200));
      await el.click({ delay: 50 });
    }

    // Wait for the first batch of comments (up to 10s — be generous to avoid races).
    for (let i = 0; i < 10 && allComments.length === 0; i++) {
      await pause(1000);
    }
    // Extra settle time for async response handlers to finish parsing.
    await pause(1500);

    // Scroll the comment panel to render all comments + their "View replies" buttons.
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const c = document.querySelector('[class*="CommentListContainer"], [data-e2e="comment-list"]');
        if (c) (c as HTMLElement).scrollBy(0, 1500);
      });
      checkDeadline();
      await pause(400);
    }
    await pause(500);

    // Click "View N replies" buttons by text content (TikTok has no data-e2e attr for these).
    try {
      const clicked = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll("div, span, p, button"));
        const replyBtns = all.filter((e) => {
          const t = (e.textContent || "").trim().toLowerCase();
          return /^(view\s+)?\d+\s+repl(y|ies)/.test(t) || t === "view replies";
        });
        let count = 0;
        for (const b of replyBtns) {
          try { (b as HTMLElement).click(); count++; } catch {}
        }
        return count;
      });
      // Wait for reply API responses.
      await pause(2500);
    } catch { /* ignore */ }

    checkDeadline();
    if (!commentResponseCaptured) {
      throw new Error("TikTok returned no comment API response; comments may be unavailable or blocked.");
    }
    if (!commentResponseValid) {
      throw new Error("TikTok returned an invalid comment API response; try again later.");
    }

    // Sort top-level comments by likes (popularity) descending.
    const topLevel = allComments
      .filter((c) => !c.parentId)
      .sort((a, b) => b.likeCount - a.likeCount);
    const replies = allComments
      .filter((c) => c.parentId)
      .sort((a, b) => b.likeCount - a.likeCount);

    // Build threaded result: top comments + their replies.
    const result: Comment[] = [];
    for (const top of topLevel.slice(0, limit)) {
      result.push(top);
      const topReplies = replies.filter((r) => r.parentId === top.id);
      result.push(...topReplies.slice(0, 10));
    }

    return result;
  } catch (e: any) {
    throw e;
  } finally {
    clearTimeout(hardTimeout);
    await page.close().catch(() => {});
  }
}

const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (!req.url) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: "no url" }));
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/health") {
    if (req.method !== "GET") {
      res.writeHead(405);
      return res.end(JSON.stringify({ error: "method not allowed" }));
    }
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true }));
  }
  if (url.pathname === "/comments") {
    if (req.method !== "GET") {
      res.writeHead(405);
      return res.end(JSON.stringify({ error: "method not allowed" }));
    }
    const videoUrl = url.searchParams.get("videoUrl");
    if (!videoUrl) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "videoUrl required" }));
    }
    const validatedUrl = validateVideoUrl(videoUrl);
    if (!validatedUrl) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "videoUrl must be an HTTPS TikTok video URL" }));
    }
    const limitParam = url.searchParams.get("limit") ?? "30";
    if (!/^\d+$/.test(limitParam)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "limit must be an integer from 1 to 100" }));
    }
    const limit = Math.min(Number(limitParam), MAX_TOP_LEVEL_COMMENTS);
    if (limit < 1) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "limit must be an integer from 1 to 100" }));
    }
    if (activeScrapes >= MAX_CONCURRENT_SCRAPES) {
      res.writeHead(429);
      return res.end(JSON.stringify({ error: "comment service is busy; retry shortly" }));
    }
    let proxyOverride: string | null | undefined;
    try {
      proxyOverride = requestProxyOverride(req);
    } catch (e: any) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: e?.message ?? "invalid proxy configuration" }));
    }
    activeScrapes++;
    try {
      const comments = await fetchComments(validatedUrl, limit, proxyOverride);
      res.writeHead(200);
      return res.end(JSON.stringify({ comments }));
    } catch (e: any) {
      res.writeHead(e instanceof ScrapeBusyError ? 429 : 502);
      return res.end(JSON.stringify({ error: publicError(e, proxyOverride), comments: [] }));
    } finally {
      activeScrapes--;
    }
  }
  if (url.pathname === "/search") {
    if (req.method !== "GET") {
      res.writeHead(405);
      return res.end(JSON.stringify({ error: "method not allowed", results: [] }));
    }
    const query = url.searchParams.get("q")?.trim() ?? "";
    if (!query || query.length > MAX_SEARCH_QUERY_LENGTH) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: `q must contain 1 to ${MAX_SEARCH_QUERY_LENGTH} characters`, results: [] }));
    }
    const kindParam = url.searchParams.get("kind") ?? "all";
    if (!isValidSearchKind(kindParam)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "kind must be all, author, or video", results: [] }));
    }
    if (activeScrapes >= MAX_CONCURRENT_SCRAPES) {
      res.writeHead(429);
      return res.end(JSON.stringify({ error: "TikTok service is busy; retry shortly", results: [] }));
    }
    let proxyOverride: string | null | undefined;
    try {
      proxyOverride = requestProxyOverride(req);
    } catch (e: any) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: e?.message ?? "invalid proxy configuration", results: [] }));
    }
    activeScrapes++;
    try {
      const results = await fetchSearchResults(query, kindParam, proxyOverride);
      res.writeHead(200);
      return res.end(JSON.stringify({ results }));
    } catch (e: any) {
      res.writeHead(e instanceof ScrapeBusyError ? 429 : 502);
      return res.end(JSON.stringify({ error: publicError(e, proxyOverride), results: [] }));
    } finally {
      activeScrapes--;
    }
  }
  res.writeHead(404);
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, HOST, () => {
  console.log(`tiktok-comments service on http://${HOST}:${PORT}`);
});
