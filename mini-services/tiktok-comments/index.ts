/**
 * tiktok-comments mini-service.
 *
 * Fetches public TikTok comments via curl_cffi, with Chromium as a fallback.
 * - Accepts GDPR consent (required for EEA proxy regions).
 * - Clicks the comment icon to trigger the signed comment API request.
 * - Captures the first comment batch and included reply previews.
 * - Sorts by popularity (likes descending).
 *
 * Port: 3040. The Next.js app calls this via localhost.
 */

import { createServer } from "http";
import { URL } from "url";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Server as ProxyServer } from "proxy-chain";
import { collectSearchResults, MAX_SEARCH_RESULTS, type SearchKind, type SearchResult } from "./search-parsing";

puppeteer.use(StealthPlugin());

const PORT = 3040;
const HOST = "127.0.0.1";
const MAX_TOP_LEVEL_COMMENTS = 100;
const MAX_CONCURRENT_SCRAPES = 2;
const MAX_QUEUED_SCRAPES = 40;
const MAX_QUEUE_WAIT_MS = 30_000;
const MAX_RESULT_CACHE_ENTRIES = 500;
const SEARCH_CACHE_TTL_MS = 45_000;
const SCRAPE_TIMEOUT_MS = 50_000;
const NAVIGATION_TIMEOUT_MS = 20_000;
const SEARCH_TIMEOUT_MS = 35_000;
const MAX_SEARCH_QUERY_LENGTH = 200;
let activeScrapes = 0;
let activeProxyKey: string | null | undefined;

interface ScrapeJob<T = unknown> {
  proxyKey: string | null;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

const scrapeQueue: ScrapeJob[] = [];
const inFlightScrapes = new Map<string, Promise<unknown>>();
const resultCache = new Map<string, { expiresAt: number; value: unknown }>();

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

function effectiveProxy(proxyOverride?: string | null): string | null {
  return configuredProxy(
    proxyOverride === undefined
      ? (process.env.TIKTOK_PROXY || process.env.HTTPS_PROXY || null)
      : proxyOverride,
  );
}

function workKey(kind: string, proxyKey: string | null, value: string): string {
  return createHash("sha256")
    .update(`${kind}\0${proxyKey ?? "direct"}\0${value}`)
    .digest("hex");
}

function pruneResultCache() {
  const now = Date.now();
  for (const [key, entry] of resultCache) {
    if (entry.expiresAt <= now) resultCache.delete(key);
  }
  if (resultCache.size >= MAX_RESULT_CACHE_ENTRIES) {
    resultCache.delete(resultCache.keys().next().value!);
  }
}

function runQueued<T>(proxyKey: string | null, run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (scrapeQueue.length >= MAX_QUEUED_SCRAPES) {
      reject(new ScrapeBusyError("TikTok service queue is full; retry shortly."));
      return;
    }

    const job: ScrapeJob<T> = { proxyKey, run, resolve, reject, timer: null };
    job.timer = setTimeout(() => {
      const index = scrapeQueue.indexOf(job);
      if (index < 0) return;
      scrapeQueue.splice(index, 1);
      reject(new ScrapeBusyError("TikTok service is still busy; retry shortly."));
      drainScrapeQueue();
    }, MAX_QUEUE_WAIT_MS);
    scrapeQueue.push(job);
    drainScrapeQueue();
  });
}

function drainScrapeQueue() {
  while (activeScrapes < MAX_CONCURRENT_SCRAPES && scrapeQueue.length > 0) {
    // Chromium can serve concurrent tabs only through one proxy at a time.
    // Let same-proxy work share the browser, and switch routes only when idle.
    const index = activeScrapes === 0
      ? 0
      : scrapeQueue.findIndex((job) => job.proxyKey === activeProxyKey);
    if (index < 0) return;

    if (activeScrapes > 0 && browserProxyKey !== activeProxyKey) return;

    const job = scrapeQueue.splice(index, 1)[0];
    if (job.timer) clearTimeout(job.timer);
    if (activeScrapes === 0) activeProxyKey = job.proxyKey;
    activeScrapes++;
    void Promise.resolve()
      .then(job.run)
      .then(job.resolve, job.reject)
      .finally(() => {
        activeScrapes--;
        if (activeScrapes === 0) activeProxyKey = undefined;
        drainScrapeQueue();
      });
  }
}

function cachedScrape<T>(
  key: string,
  proxyKey: string | null,
  cacheTtlMs: number,
  run: () => Promise<T>,
): Promise<T> {
  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value as T);
  if (cached) resultCache.delete(key);

  const pending = inFlightScrapes.get(key);
  if (pending) return pending as Promise<T>;

  const task = runQueued(proxyKey, run).then((value) => {
    if (cacheTtlMs > 0) {
      pruneResultCache();
      resultCache.set(key, { expiresAt: Date.now() + cacheTtlMs, value });
    }
    return value;
  }).finally(() => {
    if (inFlightScrapes.get(key) === task) inFlightScrapes.delete(key);
  });
  inFlightScrapes.set(key, task);
  return task;
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
  const proxy = effectiveProxy(proxyOverride);
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
    } catch (error) {
      console.error("[tiktok-browser] Chromium launch failed:", publicError(error, proxy));
      if (browserPromise === launchPromise) {
        browserPromise = null;
        browserProxyKey = undefined;
      }
      if (browserProxyServer === localProxy) browserProxyServer = null;
      if (localProxy) await localProxy.close(true).catch(() => {});
      throw new Error("TikTok browser could not start. Check the browser service configuration.");
    }
  })();
  browserPromise = launchPromise;
  browserProxyKey = proxyKey;
  queueMicrotask(drainScrapeQueue);
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
  if (!c || typeof c !== "object") return null;
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
  const resultWaiters = new Set<() => void>();
  const deadline = Date.now() + SEARCH_TIMEOUT_MS - 1000;
  // TikTok can emit a zero-byte HTTP 200 before its signed search response.
  // Wait for parsed results rather than assuming the page is ready after a sleep.
  const waitForResults = (ready: () => boolean, timeoutMs: number) => {
    if (ready() || Date.now() >= deadline) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const finish = () => { clearTimeout(timer); resultWaiters.delete(check); resolve(); };
      const check = () => { if (ready()) finish(); };
      timer = setTimeout(finish, Math.min(timeoutMs, Math.max(0, deadline - Date.now())));
      resultWaiters.add(check);
      check();
    });
  };
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
    for (const notify of resultWaiters) notify();
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
    await waitForResults(() => results.length > 0, 12_000);

    const hasAuthors = () => results.some((result) => result.kind === "author");
    if (kind === "author" || (kind === "all" && !hasAuthors())) {
      await page.evaluate(() => {
        const controls = Array.from(document.querySelectorAll("button,[role=tab]"));
        const usersTab = controls.find((element) => /^(users?|accounts?|creators?)$/i.test((element.textContent || "").trim()));
        (usersTab as HTMLElement | undefined)?.click();
      }).catch(() => {});
      await waitForResults(hasAuthors, 5_000);
    }
    if (kind === "video" && results.length === 0) {
      await page.evaluate(() => {
        const controls = Array.from(document.querySelectorAll("button,[role=tab]"));
        const videosTab = controls.find((element) => /^videos?$/i.test((element.textContent || "").trim()));
        (videosTab as HTMLElement | undefined)?.click();
      }).catch(() => {});
      await waitForResults(() => results.length > 0, 5_000);
    }
    if (responseTasks.size) await Promise.allSettled([...responseTasks]);

    if (results.length === 0) {
      const pageText = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      if (/captcha|verify to continue|unusual traffic|access denied|temporarily blocked|drag the slider|fit the puzzle/i.test(pageText)) {
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

function limitCommentThreads(comments: Comment[], limit: number): Comment[] {
  const sorted = [...comments].sort((a, b) => b.likeCount - a.likeCount);
  const top = sorted.filter((comment) => !comment.parentId).slice(0, limit);
  return top.flatMap((comment) => [comment, ...sorted.filter((reply) => reply.parentId === comment.id).slice(0, 10)]);
}

const execFileAsync = promisify(execFile);
const COMMENTS_HTTP_SCRIPT = String.raw`
import json, os
from urllib.parse import urlparse
from curl_cffi import requests
video_url = os.environ["LIBCUT_COMMENT_VIDEO_URL"]
video_id = urlparse(video_url).path.rstrip("/").split("/")[-1]
proxy = os.environ.get("LIBCUT_COMMENT_PROXY") or None
comment_id = os.environ.get("LIBCUT_COMMENT_PARENT")
params = {"aid": "1988", "count": os.environ["LIBCUT_COMMENT_LIMIT"], "cursor": os.environ.get("LIBCUT_COMMENT_CURSOR", "0")}
if comment_id:
    endpoint = "https://www.tiktok.com/api/comment/list/reply/"
    params.update({"item_id": video_id, "comment_id": comment_id})
else:
    endpoint = "https://www.tiktok.com/api/comment/list/"
    params["aweme_id"] = video_id
response = requests.get(
    endpoint,
    params=params,
    proxy=proxy, impersonate="chrome", headers={"Referer": video_url},
    timeout=6, allow_redirects=False,
)
response.raise_for_status()
print(json.dumps(response.json(), ensure_ascii=False))
`;

async function loadHttpCommentData(videoUrl: string, limit: number, proxyOverride?: string | null, commentId = "", cursor = "0") {
  const env = { ...process.env };
  // Explicit direct mode must not inherit a different route from shell settings.
  for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) delete env[name];
  env.LIBCUT_COMMENT_VIDEO_URL = videoUrl;
  env.LIBCUT_COMMENT_PROXY = effectiveProxy(proxyOverride) ?? "";
  env.LIBCUT_COMMENT_LIMIT = String(Math.min(limit, 30));
  env.LIBCUT_COMMENT_PARENT = commentId;
  env.LIBCUT_COMMENT_CURSOR = cursor;
  const { stdout } = await execFileAsync("python3", ["-c", COMMENTS_HTTP_SCRIPT], {
      env, timeout: 7000, maxBuffer: 2 * 1024 * 1024, encoding: "utf8",
  });
  return JSON.parse(stdout);
}

/** Public JSON is often available even when the web player presents a CAPTCHA. */
async function fetchHttpComments(videoUrl: string, limit: number, proxyOverride?: string | null): Promise<Comment[] | null> {
  try {
    const data = await loadHttpCommentData(videoUrl, limit, proxyOverride);
    if (!data || Number(data.status_code) !== 0 || (!Array.isArray(data.comments) && data.comments !== null)) return null;
    if (!data.comments?.length && Number(data.has_more) === 1) return null;
    const comments = new Map<string, Comment>();
    for (const raw of data.comments ?? []) {
      const comment = parseComment(raw);
      if (!comment) continue;
      comments.set(comment.id, comment);
      for (const reply of Array.isArray(raw.reply_comment) ? raw.reply_comment : []) {
        const parsed = parseComment(reply);
        if (parsed) comments.set(parsed.id, { ...parsed, parentId: comment.id });
      }
    }
    if (data.comments?.length && !comments.size) return null;
    return limitCommentThreads([...comments.values()], limit);
  } catch {
    // Missing optional Python support, empty bootstrap bodies, and upstream
    // failures fall back to the browser without exposing proxy credentials.
    return null;
  }
}

async function fetchReplies(videoUrl: string, commentId: string, cursor: string, proxyOverride?: string | null) {
  let data;
  try {
    data = await loadHttpCommentData(videoUrl, 20, proxyOverride, commentId, cursor);
  } catch {
    throw new Error("TikTok replies could not be loaded; retry shortly.");
  }
  if (!data || Number(data.status_code) !== 0 || (!Array.isArray(data.comments) && data.comments !== null)) {
    throw new Error("TikTok returned an invalid replies response; retry shortly.");
  }
  const comments = new Map<string, Comment>();
  for (const raw of data.comments ?? []) {
    const reply = parseComment(raw);
    if (reply) comments.set(reply.id, { ...reply, parentId: commentId });
  }
  const hasMore = data.has_more === true || Number(data.has_more) === 1;
  const nextCursor = String(data.cursor ?? "");
  if (hasMore && (!comments.size || !/^\d{1,10}$/.test(nextCursor) || Number(nextCursor) <= Number(cursor))) {
    throw new Error("TikTok replies pagination is temporarily unavailable; retry shortly.");
  }
  return { comments: [...comments.values()], hasMore, nextCursor: hasMore ? nextCursor : null };
}

/** Prefer the public endpoint, then fall back to the hydrated TikTok player. */
async function fetchComments(videoUrl: string, limit = 30, proxyOverride?: string | null): Promise<Comment[]> {
  const direct = await fetchHttpComments(videoUrl, limit, proxyOverride);
  if (direct !== null) return direct;
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
  let signalCommentResponse!: () => void;
  const commentResponseReady = new Promise<void>((resolve) => { signalCommentResponse = resolve; });
  const responseTasks = new Set<Promise<void>>();
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
    page.on("response", (res: any) => {
      const u = res.url();
      if (u.includes("/api/comment/list")) {
        commentResponseCaptured = true;
        const task = (async () => {
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
              // TikTok can include reply previews in the first response.
              for (const reply of Array.isArray(c.reply_comment) ? c.reply_comment : []) {
                const parsedReply = parseComment(reply);
                if (!parsedReply || seenIds.has(parsedReply.id)) continue;
                seenIds.add(parsedReply.id);
                allComments.push({ ...parsedReply, parentId: parsed.id });
              }
            }
            // An empty first batch may still have more pages; don't mistake it
            // for a complete empty result when TikTok explicitly says more exist.
            if (cs.length > 0 || json.has_more === false || Number(json.has_more) === 0 || json.has_more == null) {
              signalCommentResponse();
            }
          } catch {
            // response read error
          }
        })();
        responseTasks.add(task);
        void task.finally(() => responseTasks.delete(task));
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

    // Consent must be present on the initial request. Reloading immediately
    // after DOMContentLoaded interrupts TikTok's still-hydrating application.
    await browser.setCookie(...["tiktok_web_cookie_consent", "cookie-consent", "EU_COOKIE_CONSENT"].map((name) => ({
      name, value: "1", domain: ".tiktok.com", path: "/", secure: true,
      sameSite: "None", expires: Math.floor(Date.now() / 1000) + 31536000,
    })));

    const remaining = (maximum: number) => {
      checkDeadline();
      return Math.max(1, Math.min(maximum, deadline - Date.now() - 250));
    };
    const openComments = async () => {
      if (commentResponseValid) return;
      // DOMContentLoaded precedes React hydration. A one-shot page.$ silently
      // misses the icon and never triggers TikTok's signed comment request.
      const control = await Promise.race([
        page.waitForSelector('[data-e2e="comment-icon"], [data-e2e="browse-comment-icon"]', {
          visible: true, timeout: remaining(20_000),
        }).catch(() => null),
        commentResponseReady.then(() => null),
      ]);
      if (!commentResponseValid && control) {
        await control.evaluate((element: any) => element.scrollIntoView({ block: "center" }));
        await control.click({ delay: 50 });
      }
      if (!commentResponseValid) await Promise.race([commentResponseReady, pause(7000)]);
      await Promise.allSettled([...responseTasks]);
    };

    await page.goto(videoUrl, { waitUntil: "domcontentloaded", timeout: remaining(NAVIGATION_TIMEOUT_MS) });
    await openComments();
    if (!commentResponseValid && deadline - Date.now() > 12_000) {
      // Recover once from an incomplete bootstrap; keep the first successful
      // response fast and avoid clicking again when comments already arrived.
      await page.reload({ waitUntil: "domcontentloaded", timeout: remaining(NAVIGATION_TIMEOUT_MS) });
      await openComments();
    }
    checkDeadline();
    if (!commentResponseValid) {
      const pageText = await page.evaluate(() => document.body?.innerText ?? "");
      if (/video (?:is )?(?:currently )?unavailable|couldn.t find this video|video has been (?:removed|deleted)/i.test(pageText)) {
        throw new Error("This video is unavailable on TikTok in the server's region or has been removed.");
      }
      if (/captcha|verify to continue|unusual traffic|access denied|temporarily blocked|drag the slider|fit the puzzle/i.test(pageText)) {
        throw new Error("TikTok blocked comments. Try again later or check the configured proxy.");
      }
    }

    // Deliver the first available batch and included reply previews immediately.
    // Extra scrolling and clicking every reply kept the viewer waiting even
    // after useful comments had arrived.
    await Promise.allSettled([...responseTasks]);

    checkDeadline();
    if (!commentResponseCaptured) {
      throw new Error("TikTok returned no comment API response; comments may be unavailable or blocked.");
    }
    if (!commentResponseValid) {
      throw new Error("TikTok returned an invalid comment API response; try again later.");
    }

    return limitCommentThreads(allComments, limit);
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
  if (url.pathname === "/replies") {
    if (req.method !== "GET") {
      res.writeHead(405);
      return res.end(JSON.stringify({ error: "method not allowed" }));
    }
    const videoUrl = validateVideoUrl(url.searchParams.get("videoUrl") ?? "");
    const commentId = url.searchParams.get("commentId") ?? "";
    const cursor = url.searchParams.get("cursor") ?? "0";
    if (!videoUrl || !/^\d{1,30}$/.test(commentId) || !/^\d{1,10}$/.test(cursor)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "Invalid video, comment, or cursor" }));
    }
    let proxyOverride: string | null | undefined;
    try { proxyOverride = requestProxyOverride(req); }
    catch {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "Invalid proxy configuration" }));
    }
    try {
      const proxyKey = effectiveProxy(proxyOverride);
      const key = workKey("replies", proxyKey, `${videoUrl}\0${commentId}\0${cursor}`);
      const result = await cachedScrape(key, proxyKey, 30_000, () => fetchReplies(videoUrl, commentId, cursor, proxyOverride));
      res.writeHead(200);
      return res.end(JSON.stringify(result));
    } catch (error) {
      if (error instanceof ScrapeBusyError) res.setHeader("Retry-After", "3");
      res.writeHead(error instanceof ScrapeBusyError ? 503 : 502);
      return res.end(JSON.stringify({ error: publicError(error, proxyOverride) }));
    }
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
    let proxyOverride: string | null | undefined;
    try {
      proxyOverride = requestProxyOverride(req);
    } catch (e: any) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: e?.message ?? "invalid proxy configuration" }));
    }
    try {
      const proxyKey = effectiveProxy(proxyOverride);
      const key = workKey("comments", proxyKey, `${validatedUrl}\0${limit}`);
      const comments = await cachedScrape(key, proxyKey, 0, () => fetchComments(validatedUrl, limit, proxyOverride));
      res.writeHead(200);
      return res.end(JSON.stringify({ comments }));
    } catch (e: any) {
      if (e instanceof ScrapeBusyError) res.setHeader("Retry-After", "3");
      res.writeHead(e instanceof ScrapeBusyError ? 503 : 502);
      return res.end(JSON.stringify({ error: publicError(e, proxyOverride), comments: [] }));
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
    let proxyOverride: string | null | undefined;
    try {
      proxyOverride = requestProxyOverride(req);
    } catch (e: any) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: e?.message ?? "invalid proxy configuration", results: [] }));
    }
    try {
      const proxyKey = effectiveProxy(proxyOverride);
      const key = workKey("search", proxyKey, `${kindParam}\0${query.toLowerCase()}`);
      const results = await cachedScrape(key, proxyKey, SEARCH_CACHE_TTL_MS, () => fetchSearchResults(query, kindParam, proxyOverride));
      res.writeHead(200);
      return res.end(JSON.stringify({ results }));
    } catch (e: any) {
      if (e instanceof ScrapeBusyError) res.setHeader("Retry-After", "3");
      res.writeHead(e instanceof ScrapeBusyError ? 503 : 502);
      return res.end(JSON.stringify({ error: publicError(e, proxyOverride), results: [] }));
    }
  }
  res.writeHead(404);
  res.end(JSON.stringify({ error: "not found" }));
});

// Close Chromium explicitly: Puppeteer's signal handlers otherwise keep the
// HTTP server alive until the service manager's stop timeout expires.
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  server.close();
  server.closeAllConnections();
  try {
    await closeCurrentBrowser();
  } finally {
    clearTimeout(forceExit);
    process.exit(0);
  }
}
process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });

server.listen(PORT, HOST, () => {
  console.log(`tiktok-comments service on http://${HOST}:${PORT}`);
});
