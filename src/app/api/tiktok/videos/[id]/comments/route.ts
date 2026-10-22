import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { getEffectiveProxy, tiktokConfig } from "@/lib/tiktok/config";
import { tiktokProvider } from "@/lib/tiktok";
import { proxyImage } from "@/lib/tiktok/images";

export const dynamic = "force-dynamic";

const COMMENT_SERVICE_TIMEOUT_MS = 90_000;
const COMMENT_CACHE_TTL_MS = 60_000;
const MAX_COMMENT_CACHE_ENTRIES = 1000;
const commentsLoads = new Map<string, Promise<string | null>>();
const commentsCache = new Map<string, number>();

type CommentInput = {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  text: string;
  likeCount: number;
  postedAt: Date | null;
  parentId: string | null;
  replyCount: number;
};

function toNonNegativeInt(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function normalizeComments(input: any[]): CommentInput[] {
  const unique = new Map<string, CommentInput>();
  for (const comment of input) {
    const id = String(comment?.id ?? comment?.tiktokCid ?? "").trim();
    if (!id || unique.has(id)) continue;
    const postedAt = comment?.postedAt ? new Date(comment.postedAt) : null;
    unique.set(id, {
      id,
      authorName: String(comment?.authorName ?? "TikTok user"),
      authorAvatar: typeof comment?.authorAvatar === "string" ? comment.authorAvatar : null,
      text: String(comment?.text ?? ""),
      likeCount: toNonNegativeInt(comment?.likeCount),
      postedAt: postedAt && Number.isFinite(postedAt.getTime()) ? postedAt : null,
      parentId: comment?.parentId == null ? null : String(comment.parentId),
      replyCount: toNonNegativeInt(comment?.replyCount),
    });
  }
  return [...unique.values()];
}

async function fetchComments(videoUrl: string): Promise<CommentInput[]> {
  if (tiktokConfig.demoMode) {
    return normalizeComments(await tiktokProvider.getComments(videoUrl));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMMENT_SERVICE_TIMEOUT_MS);
  try {
    const proxy = await getEffectiveProxy();
    const serviceUrl = new URL("http://127.0.0.1:3040/comments");
    serviceUrl.searchParams.set("videoUrl", videoUrl);
    serviceUrl.searchParams.set("limit", "100");
    const response = await fetch(serviceUrl, {
      signal: controller.signal,
      headers: { "x-libcut-proxy": proxy ?? "" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Comments service returned HTTP ${response.status}`);
    }
    if (!Array.isArray(data?.comments)) throw new Error("Comments service returned an invalid response");
    return normalizeComments(data.comments);
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("Comments timed out — the headless browser is slow. Try refreshing.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetch once per video in this process and replace comments atomically. */
async function refreshVideoComments(videoId: string, videoUrl: string, force = false): Promise<string | null> {
  const pending = commentsLoads.get(videoId);
  if (pending) return pending;
  const cachedUntil = commentsCache.get(videoId);
  if (!force && cachedUntil && cachedUntil > Date.now()) return null;
  if (cachedUntil) commentsCache.delete(videoId);

  const load = (async () => {
    try {
      const fetched = await fetchComments(videoUrl);
      await db.$transaction(async (tx) => {
        await tx.comment.deleteMany({ where: { videoId } });
        if (fetched.length) {
          await tx.comment.createMany({
            data: fetched.map(({ id, ...comment }) => ({
              videoId,
              ...comment,
              tiktokCid: id,
            })),
          });
        }
      });
      if (commentsCache.size >= MAX_COMMENT_CACHE_ENTRIES) {
        const now = Date.now();
        for (const [key, until] of commentsCache) {
          if (until <= now) commentsCache.delete(key);
        }
        if (commentsCache.size >= MAX_COMMENT_CACHE_ENTRIES) {
          commentsCache.delete(commentsCache.keys().next().value!);
        }
      }
      commentsCache.set(videoId, Date.now() + COMMENT_CACHE_TTL_MS);
      return null;
    } catch (error: any) {
      return error?.message || "Comments could not be loaded.";
    }
  })();
  commentsLoads.set(videoId, load);
  try {
    return await load;
  } finally {
    if (commentsLoads.get(videoId) === load) commentsLoads.delete(videoId);
  }
}

/**
 * GET /api/tiktok/videos/[id]/comments
 * Return stored comments; if none stored (or ?refresh=1), fetch via provider
 * and persist them.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureInitialized();
  const { id } = await ctx.params;
  const video = await db.video.findUnique({
    where: { id },
    select: { id: true, url: true, commentCount: true },
  });
  if (!video) return errorJson("video not found", 404);

  let stored = await db.comment.findMany({
    where: { videoId: id },
    orderBy: { postedAt: "desc" },
  });

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";
  if (forceRefresh || stored.length === 0) {
    const fetchError = await refreshVideoComments(video.id, video.url, forceRefresh);
    stored = await db.comment.findMany({
      where: { videoId: id },
      orderBy: [{ parentId: "asc" }, { likeCount: "desc" }],
    });
    if (stored.length === 0 && fetchError) {
      return json({ comments: [], error: fetchError, commentCount: video.commentCount });
    }
  }

  return json({
    comments: stored.map((comment) => ({
      id: comment.id,
      tiktokCid: comment.tiktokCid,
      authorName: comment.authorName,
      authorAvatar: proxyImage(comment.authorAvatar),
      text: comment.text,
      likeCount: comment.likeCount,
      postedAt: comment.postedAt,
      parentId: comment.parentId,
      replyCount: comment.replyCount,
    })),
    commentCount: video.commentCount,
  });
}
