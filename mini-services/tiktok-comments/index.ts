/**
 * tiktok-comments mini-service.
 *
 * Extracts TikTok comments using a headless Chromium (puppeteer + stealth).
 * Accepts GDPR consent, clicks the comment icon, captures the signed comment
 * API responses. Captures BOTH top-level comments AND reply threads.
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
  if (proxy && !proxy.includes("@")) {
    args.push(`--proxy-server=${proxy}`);
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
  parentId: string | null;
  replyCount: number;
}

/** Accept TikTok's GDPR consent banner (required for EEA proxy regions). */
async function acceptConsent(page: any) {
  await page.evaluate(() => {
    const opts = "path=/; domain=.tiktok.com; max-age=31536000; SameSite=None; Secure";
    document.cookie = `tiktok_web_cookie_consent=1; ${opts}`;
    document.cookie = `cookie-consent=1; ${opts}`;
    document.cookie = `EU_COOKIE_CONSENT=1; ${opts}`;
  });
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button, a, div"));
    const agree = btns.find((b) => {
      const t = (b.textContent || "").trim().toLowerCase();
      return ["accept all", "agree", "got it", "accept", "i agree", "agree all", "allow all", "разрешить все", "принять все"].includes(t);
    });
    if (agree) (agree as HTMLElement).click();
  });
  await new Promise((r) => setTimeout(r, 1500));
}

/** Parse a TikTok comment object from the API response. */
function parseComment(c: any, parentId: string | null = null): Comment | null {
  const id = String(c.cid ?? c.id ?? c.comment_id ?? "");
  if (!id) return null;
  return {
    id,
    authorName: c.user?.nickname ?? c.user?.unique_id ?? c.nickname ?? "TikTok user",
    authorAvatar: c.user?.avatar_thumb?.url_list?.[0] ?? c.avatar_thumb?.[0] ?? null,
    text: c.text ?? "",
    likeCount: c.digg_count ?? c.like_count ?? 0,
    postedAt: c.create_time ? new Date(c.create_time * 1000).toISOString() : null,
    parentId,
    replyCount: c.reply_comment ?? c.reply_count ?? 0,
  };
}

/** Extract comments for a TikTok video URL using a headless browser. */
async function fetchComments(videoUrl: string, limit = 30): Promise<Comment[]> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const allComments: Comment[] = [];
  const seenIds = new Set<string>();
  // Map of top-level comment id -> its replies (for threading)
  const repliesMap = new Map<string, Comment[]>();

  // Intercept BOTH top-level comment API and reply API responses.
  page.on("response", async (res: any) => {
    const u = res.url();
    if (u.includes("/api/comment/list") || u.includes("/api/comment/list/reply")) {
      try {
        const text = await res.text();
        if (!text) return;
        let json: any;
        try { json = JSON.parse(text); } catch { return; }
        const isReply = u.includes("/reply");
        const cs = json?.comments ?? [];
        for (const c of cs) {
          const parsed = parseComment(c, isReply ? null : null);
          if (!parsed || seenIds.has(parsed.id)) continue;
          seenIds.add(parsed.id);
          if (isReply) {
            // Reply — try to find its parent from the reply_comment field
            const parentCid = c.reply_comment ? String(c.reply_comment) : null;
            parsed.parentId = parentCid;
            if (parentCid && repliesMap.has(parentCid)) {
              repliesMap.get(parentCid)!.push(parsed);
            } else {
              // Orphan reply — add to top level
              allComments.push(parsed);
            }
          } else {
            allComments.push(parsed);
            if (parsed.replyCount > 0) {
              repliesMap.set(parsed.id, []);
            }
          }
        }
      } catch {
        // response read error
      }
    }
  });

  try {
    await page.goto(videoUrl, { waitUntil: "networkidle2", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 2000));

    // Accept GDPR consent (EEA proxy regions show a banner that blocks comments).
    await acceptConsent(page);
    // Reload to apply consent cookies.
    await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 3000));

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
      } catch { /* try next */ }
    }
    if (!clicked) {
      await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[data-e2e="comment-icon"]'));
        const btn = els.find((e) => (e as HTMLElement).offsetParent !== null) as HTMLElement | undefined;
        if (btn) btn.click();
      });
    }

    // Wait for the first batch of comments (up to 8s).
    for (let i = 0; i < 8 && allComments.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Click "View N replies" buttons to load reply threads for top comments.
    // TikTok loads replies via a separate API call when you click this.
    try {
      const viewReplyBtns = await page.$$('[data-e2e="view-more-reply"], [class*="ViewMoreReply"], [data-e2e*="reply" i]');
      for (let i = 0; i < Math.min(viewReplyBtns.length, 5); i++) {
        try {
          await viewReplyBtns[i].click({ delay: 50 });
          await new Promise((r) => setTimeout(r, 800));
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

    // Sort top-level comments by likes (popularity) descending.
    allComments.sort((a, b) => b.likeCount - a.likeCount);

    // Build the final list: top-level + their replies (threaded).
    const result: Comment[] = [];
    for (const top of allComments.slice(0, limit)) {
      result.push(top);
      const replies = repliesMap.get(top.id) ?? [];
      // Sort replies by likes too
      replies.sort((a, b) => b.likeCount - a.likeCount);
      result.push(...replies.slice(0, 10)); // max 10 replies per top comment
    }

    await page.close();
    return result;
  } catch (e: any) {
    await page.close().catch(() => {});
    throw e;
  }
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
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 30) || 30, 100);
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
