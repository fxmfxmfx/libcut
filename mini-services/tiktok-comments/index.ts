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

/** Extract comments for a TikTok video URL using a headless browser. */
async function fetchComments(videoUrl: string, limit = 30): Promise<Comment[]> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const allComments: Comment[] = [];
  const seenIds = new Set<string>();

  // Intercept BOTH top-level and reply comment API responses.
  page.on("response", async (res: any) => {
    const u = res.url();
    if (u.includes("/api/comment/list")) {
      try {
        const text = await res.text();
        if (!text) return;
        let json: any;
        try { json = JSON.parse(text); } catch { return; }
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

  try {
    // networkidle2 ensures the SPA is fully rendered (required for consent + comment icon).
    await page.goto(videoUrl, { waitUntil: "networkidle2", timeout: 60_000 });

    // Accept GDPR consent by setting cookies, then reload to apply them.
    // Reload with networkidle2 is required — without it, consent wall blocks the comment click.
    await page.evaluate(() => {
      const opts = "path=/; domain=.tiktok.com; max-age=31536000; SameSite=None; Secure";
      document.cookie = `tiktok_web_cookie_consent=1; ${opts}`;
      document.cookie = `cookie-consent=1; ${opts}`;
      document.cookie = `EU_COOKIE_CONSENT=1; ${opts}`;
    });
    await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });

    // Click the comment icon — TikTok fires the signed comment API request.
    const el = await page.$('[data-e2e="comment-icon"]');
    if (el) {
      await el.evaluate((e: any) => e.scrollIntoView({ block: "center" }));
      await new Promise((r) => setTimeout(r, 200));
      await el.click({ delay: 50 });
    }

    // Wait for the first batch of comments (up to 10s — be generous to avoid races).
    for (let i = 0; i < 10 && allComments.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    // Extra settle time for async response handlers to finish parsing.
    await new Promise((r) => setTimeout(r, 1500));

    // Scroll the comment panel to render all comments + their "View replies" buttons.
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const c = document.querySelector('[class*="CommentListContainer"], [data-e2e="comment-list"]');
        if (c) (c as HTMLElement).scrollBy(0, 1500);
      });
      await new Promise((r) => setTimeout(r, 400));
    }
    await new Promise((r) => setTimeout(r, 500));

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
      await new Promise((r) => setTimeout(r, 2500));
    } catch { /* ignore */ }

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
