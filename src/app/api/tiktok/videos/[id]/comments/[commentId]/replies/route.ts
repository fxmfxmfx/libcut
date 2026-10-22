import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { getEffectiveProxy, tiktokConfig } from "@/lib/tiktok/config";
import { proxyImage } from "@/lib/tiktok/images";

export const dynamic = "force-dynamic";

function serializeReply(reply: {
  id: string; tiktokCid?: string | null; authorName: string; authorAvatar: string | null;
  text: string; likeCount: number; postedAt: string | Date | null; replyCount: number;
}, parentId: string) {
  const date = reply.postedAt ? new Date(reply.postedAt) : null;
  return {
    id: reply.id, tiktokCid: reply.tiktokCid ?? reply.id, parentId,
    authorName: String(reply.authorName || "TikTok user"),
    authorAvatar: proxyImage(typeof reply.authorAvatar === "string" ? reply.authorAvatar : null),
    text: String(reply.text ?? ""),
    likeCount: Number.isSafeInteger(reply.likeCount) && reply.likeCount > 0 ? reply.likeCount : 0,
    postedAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
    replyCount: 0,
  };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await ctx.params;
  const cursor = req.nextUrl.searchParams.get("cursor") ?? "0";
  if (!/^\d{1,10}$/.test(cursor) || commentId.length > 80) return errorJson("Invalid comment or cursor", 400);
  await ensureInitialized();
  const parent = await db.comment.findFirst({
    where: { videoId: id, tiktokCid: commentId, parentId: null },
    select: { video: { select: { url: true } } },
  });
  if (!parent) return errorJson("Comment not found", 404);

  if (tiktokConfig.demoMode) {
    const replies = await db.comment.findMany({ where: { videoId: id, parentId: commentId }, orderBy: { likeCount: "desc" } });
    const offset = Number(cursor);
    const page = replies.slice(offset, offset + 20);
    const hasMore = offset + page.length < replies.length;
    return json({ comments: page.map((reply) => serializeReply(reply, commentId)), hasMore, nextCursor: hasMore ? String(offset + page.length) : null });
  }
  if (!/^\d{1,30}$/.test(commentId)) return errorJson("Invalid TikTok comment ID", 400);
  try {
    const serviceUrl = new URL("http://127.0.0.1:3040/replies");
    serviceUrl.searchParams.set("videoUrl", parent.video.url);
    serviceUrl.searchParams.set("commentId", commentId);
    serviceUrl.searchParams.set("cursor", cursor);
    const response = await fetch(serviceUrl, {
      headers: { "x-libcut-proxy": (await getEffectiveProxy()) ?? "" },
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(45_000)]),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) return errorJson(data?.error || "Replies could not be loaded", response.status === 503 ? 503 : 502);
    if (!data || !Array.isArray(data.comments)) return errorJson("Invalid replies response", 502);
    const hasMore = data.hasMore === true;
    if (hasMore && (typeof data.nextCursor !== "string" || !/^\d{1,10}$/.test(data.nextCursor) || Number(data.nextCursor) <= Number(cursor))) {
      return errorJson("Invalid replies pagination", 502);
    }
    return json({
      comments: data.comments.filter((reply: { id?: unknown }) => typeof reply?.id === "string" && /^\d{1,30}$/.test(reply.id))
        .map((reply: Parameters<typeof serializeReply>[0]) => serializeReply(reply, commentId)),
      hasMore, nextCursor: hasMore ? data.nextCursor : null,
    });
  } catch {
    return errorJson("Replies could not be loaded; try again", 502);
  }
}
