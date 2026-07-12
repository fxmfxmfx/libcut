/**
 * tiktok-comments mini-service.
 *
 * TikTok's comment API requires:
 * 1. GDPR consent accepted (for EEA proxy regions — TikTok shows a consent
 *    banner that blocks comments until accepted).
 * 2. The comment icon clicked (triggers the signed a_bogus API request).
 *
 * This service uses a headless Chromium (puppeteer + stealth) to load the
 * video page, accept consent, click the comment icon, and capture the comment
 * API responses.
 *
 * Port: 3040 (hardcoded). The Next.js app calls this via localhost.
 */

import { createServer } from "http";
import { URL } from "url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const PORT = 3040;

let browserPromise: Promise<any> | null = null;
async function getBrowser() {
  if (browserPromise) {
    try {
      return await browserPromise;
    } catch {
      // Previous launch failed — retry.
      browserPromise = null;
    }
  }
  const proxy = process.env.TIKTOK_PROXY || process.env.HTTPS_PROXY || "";
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-blink-features=AutomationControlled",
  ];
  if (proxy) {
    // Chromium's --proxy-server doesn't support inline auth (user:pass@host).
    // For socks5 proxies with auth, we skip the proxy for the headless browser
    // and rely on the app-level proxy for the actual API calls. For proxies
    // without auth (socks5://host:port), we pass it directly.
    if (!proxy.includes("@") || proxy.startsWith("socks5://") && !proxy.includes("@")) {
      args.push(`--proxy-server=${proxy}`);
    }
  }
  browserPromise = puppeteer.launch({ headless: true, args });
  return browserPromise;
}

interface Comment {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  text: string;
  likeCount: number;
  postedAt: string | null;
}

/** Accept TikTok's GDPR consent banner (required for EEA proxy regions). */
async function acceptConsent(page: any) {
  // Set consent cookies directly.
  await page.evaluate(() => {
    const opts = "path=/; domain=.tiktok.com; max-age=31536000; SameSite=None; Secure";
    document.cookie = `tiktok_web_cookie_consent=1; ${opts}`;
    document.cookie = `cookie-consent=1; ${opts}`;
    document.cookie = `EU_COOKIE_CONSENT=1; ${opts}`;
  });
  // Also try clicking the "Accept all" / "Agree" button if present.
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button, a, div"));
    const agree = btns.find((b) => {
      const t = (b.textContent || "").trim().toLowerCase();
      return (
        t === "accept all" ||
        t === "agree" ||
        t === "got it" ||
        t === "accept" ||
        t === "i agree" ||
        t === "agree all" ||
        t === "allow all" ||
        t === "разрешить все" ||
        t === "принять все"
      );
    });
    if (agree) (agree as HTMLElement).click();
  });
  await new Promise((r) => setTimeout(r, 1500));
}

/** Extract comments for a TikTok video URL using a headless browser. */
async function fetchComments(videoUrl: string, limit = 50): Promise<Comment[]> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const comments: Comment[] = [];
  const seenIds = new Set<string>();

  page.on("response", async (res: any) => {
    const u = res.url();
    if (u.includes("/api/comment/list")) {
      try {
        const text = await res.text();
        if (!text) return;
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          return;
        }
        const cs = json?.comments ?? [];
        for (const c of cs) {
          const id = String(c.cid ?? c.id ?? c.comment_id ?? "");
          if (!id || seenIds.has(id)) continue;
          seenIds.add(id);
          comments.push({
            id,
            authorName: c.user?.nickname ?? c.user?.unique_id ?? c.nickname ?? "TikTok user",
            authorAvatar: c.user?.avatar_thumb?.url_list?.[0] ?? c.avatar_thumb?.[0] ?? null,
            text: c.text ?? "",
            likeCount: c.digg_count ?? c.like_count ?? 0,
            postedAt: c.create_time ? new Date(c.create_time * 1000).toISOString() : null,
          });
        }
      } catch {
        // response read error
      }
    }
  });

  try {
    await page.goto(videoUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await new Promise((r) => setTimeout(r, 1500));

    // Accept GDPR consent (EEA proxy regions show a banner that blocks comments).
    await acceptConsent(page);
    // Reload to apply consent cookies.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
    await new Promise((r) => setTimeout(r, 2000));

    // Click the comment icon — TikTok fires the signed comment API request.
    const commentSelectors = [
      '[data-e2e="comment-icon"]',
      '[data-e2e="feed-active-comment"]',
      '[class*="CommentButton"]',
      'button[aria-label*="comment" i]',
    ];
    let clicked = false;
    for (const sel of commentSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.evaluate((e: any) => e.scrollIntoView({ block: "center" }));
          await new Promise((r) => setTimeout(r, 200));
          await el.click({ delay: 50 });
          clicked = true;
          break;
        }
      } catch {
        // try next
      }
    }
    if (!clicked) {
      await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[data-e2e="comment-icon"]'));
        const btn = els.find((e) => (e as HTMLElement).offsetParent !== null) as HTMLElement | undefined;
        if (btn) btn.click();
      });
    }

    // Wait for the first batch of comments (up to 8s).
    for (let i = 0; i < 8 && comments.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Scroll the comment panel to load more (fewer iterations for speed).
    for (let i = 0; i < 5 && comments.length < limit; i++) {
      await page.evaluate(() => {
        const containers = document.querySelectorAll(
          '[class*="CommentListContainer"], [class*="comment-list"], [data-e2e="comment-list"]',
        );
        if (containers.length > 0) {
          containers.forEach((c) => (c as HTMLElement).scrollBy(0, 1200));
        }
      });
      await new Promise((r) => setTimeout(r, 1200));
    }
  } finally {
    await page.close();
  }

  return comments.slice(0, limit);
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  if (!req.url) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: "no url" }));
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/health") {
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true }));
  }
  if (url.pathname === "/comments") {
    const videoUrl = url.searchParams.get("videoUrl");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
    if (!videoUrl) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "videoUrl required" }));
    }
    try {
      const comments = await fetchComments(videoUrl, limit);
      res.writeHead(200);
      return res.end(JSON.stringify({ comments }));
    } catch (e: any) {
      res.writeHead(502);
      return res.end(JSON.stringify({ error: e?.message ?? "failed", comments: [] }));
    }
  }
  res.writeHead(404);
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`tiktok-comments service on http://localhost:${PORT}`);
});
