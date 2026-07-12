"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  X,
  Heart,
  Download,
  Eye,
  MessageCircle,
  Share2,
  RefreshCw,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Volume2,
  VolumeX,
  Play,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  useVideo,
  useComments,
  useToggleFavorite,
  useMarkSeen,
  type CommentInfo,
} from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import type { Lang } from "@/lib/tiktok/i18n";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatCount, formatDuration, timeAgo, fullDate } from "@/lib/tiktok/format";
import { cn } from "@/lib/utils";
import { ExternalLinkButton } from "./external-link-button";

export function VideoPlayer({ videoId }: { videoId: string }) {
  const { data, isLoading, isError, error } = useVideo(videoId);
  const comments = useComments(videoId);
  const toggleFav = useToggleFavorite();
  const markSeen = useMarkSeen();
  const closeVideo = useView((s) => s.closeVideo);
  const openAuthor = useView((s) => s.openAuthor);
  const autoMarkSeen = useView((s) => s.autoMarkSeen);
  const t = useView((s) => s.t);
  const lang = useView((s) => s.lang);
  const qc = useQueryClient();
  const { toast } = useToast();
  const seenRef = useRef(false);

  useEffect(() => {
    if (!data || seenRef.current) return;
    if (autoMarkSeen && !data.video.seen) {
      seenRef.current = true;
      markSeen.mutate({ id: videoId, seen: true });
    } else {
      seenRef.current = true;
    }
  }, [data, videoId, markSeen, autoMarkSeen]);

  function handleDownload() {
    if (!data) return;
    const a = document.createElement("a");
    a.href = data.video.downloadSrc!;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast({ title: t("player.download.start"), description: t("player.download.desc") });
  }

  async function handleRefreshComments() {
    await qc.invalidateQueries({ queryKey: ["comments", videoId] });
    try {
      const r = await fetch(`/api/tiktok/videos/${videoId}/comments?refresh=1`);
      if (r.ok) qc.invalidateQueries({ queryKey: ["comments", videoId] });
    } catch {
      // ignore
    }
  }

  const video = data?.video;
  const author = data?.author;
  const isFav = !!video?.isFavorited;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) closeVideo();
      }}
    >
      <DialogContent
        className="!top-1/2 !left-1/2 h-[100dvh] !max-w-none !w-screen !translate-x-[-50%] !translate-y-[-50%] gap-0 overflow-hidden border-0 bg-card p-0 !rounded-none [&>button]:hidden"
      >
        <span className="sr-only">
          <DialogTitle>{video?.title ?? t("nav.feed")}</DialogTitle>
          <DialogDescription>{t("player.comments")}</DialogDescription>
        </span>

        {/* Scrollable container so on mobile the video + details + comments are all reachable.
            On desktop the layout is a side-by-side grid inside this scroll area. */}
        <div className="flex h-full flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
          {/* ---- Video / slides pane ---- */}
          <div className="relative flex h-[60vh] shrink-0 items-center justify-center bg-black lg:h-full lg:min-h-0">
            {/* Close button (always visible, top-right of the media pane) */}
            <button
              onClick={closeVideo}
              className="absolute right-3 top-3 z-20 grid size-10 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80"
              aria-label={t("player.close")}
            >
              <X className="size-5" />
            </button>

            {isLoading ? (
              <Skeleton className="aspect-[9/16] h-full max-h-[70vh] w-auto rounded-none lg:max-h-full" />
            ) : isError ? (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
                <div>
                  <p className="mb-2 font-medium text-foreground">{t("player.failed")}</p>
                  <p className="text-xs">{(error as Error)?.message}</p>
                </div>
              </div>
            ) : video ? (
              video.isGallery && video.images && video.images.length > 0 ? (
                <SlidesViewer images={video.images} title={video.title ?? ""} t={t} />
              ) : (
                <VideoElement
                  src={video.streamUrl || video.streamSrc}
                  poster={video.thumbnailUrl ?? undefined}
                  t={t}
                />
              )
            ) : null}
          </div>

          {/* ---- Details + comments pane ---- */}
          <div className="flex min-h-0 flex-col bg-card lg:h-full lg:overflow-hidden">
            {isLoading ? (
              <div className="space-y-4 p-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : video && author ? (
              <>
                {/* Author row */}
                <div className="flex items-center gap-3 border-b border-border/60 p-4">
                  <button
                    onClick={() => {
                      closeVideo();
                      openAuthor(author.username);
                    }}
                    className="flex items-center gap-3 text-left"
                  >
                    <Avatar className="size-10 border border-border/50">
                      <AvatarImage src={author.avatarUrl ?? undefined} />
                      <AvatarFallback>
                        {(author.displayName ?? author.username).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-semibold leading-tight">
                        {author.displayName ?? author.username}
                      </div>
                      <div className="text-xs text-muted-foreground">@{author.username}</div>
                    </div>
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    {video.seen && (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <CheckCircle2 className="size-3" /> {t("video.watched")}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Scrollable details + comments (desktop) / inline (mobile) */}
                <div className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">
                  <div className="space-y-3 p-4">
                    {video.title && (
                      <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground">
                        {video.title}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="size-3.5" /> {formatCount(video.viewCount)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Heart className="size-3.5" /> {formatCount(video.likeCount)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="size-3.5" /> {formatCount(video.commentCount)}
                      </span>
                      {video.shareCount ? (
                        <span className="inline-flex items-center gap-1">
                          <Share2 className="size-3.5" /> {formatCount(video.shareCount)}
                        </span>
                      ) : null}
                      {video.publishedAt && (
                        <span title={fullDate(video.publishedAt)}>
                          {timeAgo(video.publishedAt, lang)}
                        </span>
                      )}
                      {video.duration ? <span>· {formatDuration(video.duration)}</span> : null}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant={isFav ? "default" : "outline"}
                        className="gap-1.5"
                        onClick={() => toggleFav.mutate({ id: videoId, fav: !isFav })}
                        disabled={toggleFav.isPending}
                      >
                        <Heart className={cn("size-4", isFav && "fill-current")} />
                        {isFav ? t("player.favorited") : t("player.favorite")}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={handleDownload}>
                        <Download className="size-4" /> {t("player.download")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => markSeen.mutate({ id: videoId, seen: !video.seen })}
                      >
                        <CheckCircle2 className="size-4" />
                        {video.seen ? t("player.markNew") : t("player.markWatched")}
                      </Button>
                      <ExternalLinkButton href={video.url}>
                        <Button size="sm" variant="ghost" className="gap-1.5">
                          <ExternalLink className="size-4" /> {t("player.original")}
                        </Button>
                      </ExternalLinkButton>
                    </div>
                  </div>

                  {/* Comments */}
                  <div className="flex min-h-0 flex-1 flex-col border-t border-border/60 lg:overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3">
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <MessageCircle className="size-4" />
                        {t("player.comments")}
                        {comments.data?.comments?.length ? (
                          <span className="text-muted-foreground">
                            ({comments.data.comments.length})
                          </span>
                        ) : null}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={handleRefreshComments}
                        disabled={comments.isFetching}
                      >
                        {comments.isFetching ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3.5" />
                        )}
                        {t("player.comments.refresh")}
                      </Button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-20 lg:pb-4">
                      {comments.isLoading ? (
                        <div className="space-y-3">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex gap-3">
                              <Skeleton className="size-8 rounded-full" />
                              <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-3 w-24" />
                                <Skeleton className="h-3 w-full" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : comments.data?.error && !comments.data.comments?.length ? (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
                          {t("player.comments.fail", { err: comments.data.error })}
                        </div>
                      ) : (comments.data?.comments?.length ?? 0) === 0 ? (
                        <div className="grid place-items-center py-8 text-center text-sm text-muted-foreground">
                          {t("player.comments.empty")}
                        </div>
                      ) : (
                        <CommentTree comments={comments.data?.comments ?? []} lang={lang} />
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Video element — always shows controls, autoplays (muted for iOS), unmute on user gesture. */
function VideoElement({ src, poster, t }: { src: string | null | undefined; poster?: string; t: (k: string) => string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [showVolume, setShowVolume] = useState(false);

  // Always show controls. Try muted autoplay (allowed on all browsers including iOS).
  function toggleMute() {
    const v = ref.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setMuted(next);
    if (!next && v.volume === 0) {
      v.volume = 1;
      setVolume(1);
    }
  }

  function onVolumeChange(val: number[]) {
    const v = ref.current;
    if (!v) return;
    const vol = val[0] ?? 1;
    v.volume = vol;
    v.muted = vol === 0;
    setVolume(vol);
    setMuted(vol === 0);
  }

  return (
    <div
      className="relative flex h-full w-full items-center justify-center"
      onMouseEnter={() => setShowVolume(true)}
      onMouseLeave={() => setShowVolume(false)}
    >
      <video
        ref={ref}
        src={src ?? undefined}
        poster={poster}
        controls
        autoPlay
        loop
        muted
        playsInline
        onVolumeChange={(e) => {
          const v = e.currentTarget;
          setMuted(v.muted);
          setVolume(v.volume);
        }}
        className="h-full w-auto max-w-full object-contain"
        style={{ aspectRatio: "9 / 16" }}
      />
      {/* Volume control (bottom-right, appears on hover) */}
      <div className="absolute bottom-16 right-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-2 backdrop-blur transition-opacity md:bottom-20"
           style={{ opacity: showVolume ? 1 : 0.4 }}>
        <button onClick={toggleMute} className="text-white" aria-label={t("player.volume")}>
          {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
        <Slider
          value={[muted ? 0 : volume]}
          min={0}
          max={1}
          step={0.05}
          onValueChange={onVolumeChange}
          className="w-20 md:w-24"
        />
      </div>
    </div>
  );
}

/** Swipeable image carousel for TikTok photo posts. */
function SlidesViewer({
  images,
  title,
  t,
}: {
  images: string[];
  title: string;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const [idx, setIdx] = useState(0);
  const total = images.length;

  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);

  // Keyboard navigation.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [total]);

  return (
    <div className="relative flex h-full max-h-[100dvh] w-full items-center justify-center">
      <img
        src={images[idx]}
        alt={`${title} — ${t("player.slides", { n: idx + 1, total })}`}
        className="h-full max-h-[100dvh] w-auto max-w-full object-contain"
      />

      {total > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70"
            aria-label={t("player.prev")}
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70"
            aria-label={t("player.next")}
          >
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === idx ? "w-5 bg-white" : "w-1.5 bg-white/50",
                )}
                aria-label={t("player.slides", { n: i + 1, total })}
              />
            ))}
          </div>
          <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur">
            {t("player.slides", { n: idx + 1, total })}
          </div>
        </>
      )}
    </div>
  );
}

/** Threaded comment tree — top-level comments sorted by likes, replies indented. */
function CommentTree({ comments, lang }: { comments: CommentInfo[]; lang: Lang }) {
  const topLevel = comments.filter((c) => !c.parentId);
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
        const replies = (repliesByParent.get(c.id) ?? []).sort((a, b) => b.likeCount - a.likeCount);
        return (
          <li key={c.id}>
            <CommentItem c={c} lang={lang} />
            {replies.length > 0 && (
              <ul className="mt-2 space-y-2 border-l-2 border-border/40 pl-4">
                {replies.map((r) => (
                  <li key={r.id}>
                    <CommentItem c={r} lang={lang} isReply />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Single comment item. */
function CommentItem({ c, lang, isReply }: { c: CommentInfo; lang: Lang; isReply?: boolean }) {
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
        <p className="break-words text-sm leading-snug text-foreground/90">
          {c.text}
        </p>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Heart className="size-3" /> {formatCount(c.likeCount)}
          {!isReply && c.replyCount > 0 && (
            <span className="ml-2">↳ {c.replyCount}</span>
          )}
        </div>
      </div>
    </div>
  );
}
