"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Heart, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useView } from "@/lib/tiktok/store";
import { Button } from "@/components/ui/button";
import type { CommentInfo } from "@/lib/tiktok/queries";
import type { Lang } from "@/lib/tiktok/i18n";
import { formatCount, timeAgo } from "@/lib/tiktok/format";

/** Threaded comment tree — top-level comments sorted by likes, replies indented. */
export function CommentTree({ comments, lang, videoId }: { comments: CommentInfo[]; lang: Lang; videoId: string }) {
  // Build tree: top-level comments (parentId=null) with their replies.
  // Match replies to parents using tiktokCid (TikTok's comment cid), since
  // parentId from the API is a TikTok cid, not our DB cuid.
  const parentIds = new Set(comments.map((c) => c.tiktokCid));
  const topLevel = comments.filter((c) => !c.parentId || !parentIds.has(c.parentId));
  const repliesByParent = new Map<string, CommentInfo[]>();
  for (const c of comments) {
    if (c.parentId) {
      const arr = repliesByParent.get(c.parentId) ?? [];
      arr.push(c);
      repliesByParent.set(c.parentId, arr);
    }
  }
  return (
    <ul className="space-y-3">
      {topLevel.map((c) => {
        // Match replies by the parent's tiktokCid.
        const replies = (repliesByParent.get(c.tiktokCid ?? "") ?? []).sort((a, b) => b.likeCount - a.likeCount);
        return (
          <li key={c.id}>
            {c.replyCount > 0 && c.tiktokCid ? (
              <ReplyLoader key={`${videoId}:${c.tiktokCid}`} videoId={videoId} comment={c} initialReplies={replies} lang={lang} />
            ) : <>
              <CommentItem c={c} lang={lang} />
              {replies.length > 0 && <ul className="mt-2 space-y-2 border-l-2 border-border/40 pl-4">
                {replies.map((reply) => <li key={reply.id}><CommentItem c={reply} lang={lang} isReply /></li>)}
              </ul>}
            </>}
          </li>
        );
      })}
    </ul>
  );
}

function ReplyLoader({ videoId, comment, initialReplies, lang }: {
  videoId: string;
  comment: CommentInfo;
  initialReplies: CommentInfo[];
  lang: Lang;
}) {
  const t = useView((state) => state.t);
  const [loaded, setLoaded] = useState<CommentInfo[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(initialReplies.length >= comment.replyCount ? null : "0");
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const merged = new Map<string, CommentInfo>();
  for (const reply of [...initialReplies, ...loaded]) {
    merged.set(reply.tiktokCid || reply.id, reply);
  }
  const replies = [...merged.values()].sort((a, b) => b.likeCount - a.likeCount);

  async function loadReplies() {
    if (controllerRef.current || loading || nextCursor === null) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const url = `/api/tiktok/videos/${encodeURIComponent(videoId)}/comments/${encodeURIComponent(comment.tiktokCid!)}/replies?cursor=${encodeURIComponent(nextCursor)}`;
      const response = await fetch(url, { signal: controller.signal });
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      const data = await response.json().catch(() => null);
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      if (!data || !Array.isArray(data.comments)) throw new Error("Invalid replies response");
      setLoaded((current) => {
        const byId = new Map(current.map((reply) => [reply.tiktokCid || reply.id, reply]));
        for (const reply of data.comments as CommentInfo[]) byId.set(reply.tiktokCid || reply.id, reply);
        return [...byId.values()];
      });
      setNextCursor(data.hasMore ? (data.nextCursor ?? null) : null);
    } catch (cause) {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        setError((cause as Error).message);
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }

  const toggleReplies = () => {
    setExpanded(!expanded);
    if (!expanded && !loaded.length && nextCursor !== null) void loadReplies();
  };

  return (
    <>
      <CommentItem c={comment} lang={lang} repliesAction={
        <button type="button" onClick={toggleReplies} disabled={loading} aria-expanded={expanded}
          className="ml-2 inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-primary hover:bg-primary/10 hover:underline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60">
          {loading && <Loader2 className="size-3 animate-spin" />}
          {expanded ? t("player.replies.hide") : t("player.replies.view", { n: comment.replyCount })}
        </button>
      } />
      {expanded && <div className="ml-11 mt-2 space-y-2">
        {replies.length > 0 && <ul className="space-y-2 border-l-2 border-border/40 pl-4">
          {replies.map((reply) => <li key={reply.tiktokCid || reply.id}><CommentItem c={reply} lang={lang} isReply /></li>)}
        </ul>}
        {!loading && nextCursor === null && replies.length === 0 && <p className="text-xs text-muted-foreground">{t("player.replies.empty")}</p>}
        {error && <p role="alert" className="text-xs text-destructive">{t("player.replies.fail", { err: error })}</p>}
        {loading && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />{t("player.comments.loading")}</p>}
        {nextCursor !== null && !loading && <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={loadReplies}>
          {error ? t("player.replies.retry") : t("player.replies.more")}
        </Button>}
      </div>}
    </>
  );
}

/** Single comment item. */
function CommentItem({ c, lang, isReply, repliesAction }: { c: CommentInfo; lang: Lang; isReply?: boolean; repliesAction?: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Avatar className={cn("border border-border/40", isReply ? "size-6" : "size-8")}>
        <AvatarImage src={c.authorAvatar ?? undefined} />
        <AvatarFallback className="text-[10px]">
          {c.authorName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-semibold">{c.authorName}</span>
          {c.postedAt && (
            <span className="text-[10px] text-muted-foreground">
              {timeAgo(c.postedAt, lang)}
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-snug text-foreground/90">
          {c.text}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          <Heart className="size-3" /> {formatCount(c.likeCount)}
          {repliesAction}
          {!isReply && !repliesAction && c.replyCount > 0 && (
            <span className="ml-2">↳ {c.replyCount}</span>
          )}
        </div>
      </div>
    </div>
  );
}
