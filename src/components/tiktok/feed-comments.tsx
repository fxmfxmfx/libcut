"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MessageCircle, RefreshCw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useComments, type VideoInfo } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { useQueryClient } from "@tanstack/react-query";
import { CommentTree } from "./comment-tree";

type FeedCommentsProps = {
  video: VideoInfo;
  onClose: () => void;
  inline?: boolean;
};

export function FeedComments({ video, onClose, inline = false }: FeedCommentsProps) {
  const comments = useComments(video.id);
  const t = useView((state) => state.t);
  const lang = useView((state) => state.lang);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (inline) closeButtonRef.current?.focus();
  }, [inline]);

  function handlePanelKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  }

  async function refreshComments() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const queryKey = ["comments", video.id];
      await queryClient.cancelQueries({ queryKey });
      const response = await fetch(`/api/tiktok/videos/${video.id}/comments?refresh=1`);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      if (data?.error) throw new Error(data.error);
      if (!data || !Array.isArray(data.comments)) throw new Error("Invalid comments response");
      queryClient.setQueryData(queryKey, data);
    } catch (error) {
      setRefreshError((error as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  const errorMessage = refreshError || comments.error?.message || comments.data?.error;
  const hasComments = (comments.data?.comments?.length ?? 0) > 0;
  const isLoading = !hasComments && (comments.isLoading || refreshing);
  const videoDescription = video.title || video.description || "Comments for this feed video";

  const content = (
    <>
      <header className="flex shrink-0 items-start gap-3 border-b border-border/60 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] lg:pt-5">
        <div className="min-w-0 flex-1">
          {inline ? (
            <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold">
              <MessageCircle className="size-4 shrink-0 text-primary" />
              {t("player.comments")}
              {video.commentCount > 0 && (
                <span className="text-sm font-normal text-muted-foreground">({video.commentCount})</span>
              )}
            </h2>
          ) : (
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="size-4 shrink-0 text-primary" />
              {t("player.comments")}
              {video.commentCount > 0 && (
                <span className="text-sm font-normal text-muted-foreground">({video.commentCount})</span>
              )}
            </DialogTitle>
          )}
          {inline ? (
            <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{videoDescription}</p>
          ) : (
            <DialogDescription className="mt-1 line-clamp-2 break-words text-xs">
              {videoDescription}
            </DialogDescription>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Refresh comments"
            onClick={refreshComments}
            disabled={isLoading || comments.isFetching}
          >
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
          <Button
            ref={inline ? closeButtonRef : undefined}
            data-comments-close
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t("player.close")}
            onClick={onClose}
          >
            <X className="size-5" />
          </Button>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4"
        role="region"
        aria-label={t("player.comments")}
        aria-busy={isLoading}
      >
        {hasComments && errorMessage && <p role="status" className="mb-4 text-xs text-amber-500">{t("player.comments.fail", { err: errorMessage })}</p>}
        {hasComments && (refreshing || comments.isFetching) && <p role="status" className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />{t("player.comments.loading")}</p>}
        {isLoading ? (
          <div className="space-y-4" aria-live="polite">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              {t("player.comments.loading")}
            </div>
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex gap-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2 pt-1">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : errorMessage && !hasComments ? (
          <div className="grid min-h-40 place-items-center text-center" role="alert">
            <div className="max-w-sm space-y-3">
              <p className="text-sm text-destructive">
                {t("player.comments.fail", { err: errorMessage })}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={refreshComments} disabled={refreshing}>
                {refreshing && <Loader2 className="size-4 animate-spin" />}
                {t("common.retry")}
              </Button>
            </div>
          </div>
        ) : (comments.data?.comments?.length ?? 0) === 0 ? (
          <div className="grid min-h-40 place-items-center text-center text-sm text-muted-foreground">
            {t("player.comments.empty")}
          </div>
        ) : (
          <CommentTree comments={comments.data?.comments ?? []} lang={lang} videoId={video.id} />
        )}
      </div>
    </>
  );

  if (inline) {
    return (
      <section
        data-inline-comments
        aria-labelledby={titleId}
        onKeyDown={handlePanelKeyDown}
        className="flex h-full min-h-0 w-[clamp(300px,28vw,380px)] shrink-0 flex-col overflow-hidden border-l border-border bg-card"
      >
        {content}
      </section>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="!fixed !inset-x-0 !bottom-0 !left-0 !top-auto !z-50 !flex !h-[min(80dvh,720px)] !max-h-[calc(100dvh-env(safe-area-inset-top))] !w-full !max-w-none !translate-x-0 !translate-y-0 !flex-col !gap-0 !overflow-hidden !rounded-t-2xl !border !border-border !bg-card !p-0 !shadow-2xl sm:!max-w-none lg:!inset-y-0 lg:!right-0 lg:!left-auto lg:!top-0 lg:!h-dvh lg:!max-h-dvh lg:!w-[420px] lg:!rounded-none lg:!border-y-0 lg:!border-r-0 lg:!border-l"
      >{content}</DialogContent>
    </Dialog>
  );
}
