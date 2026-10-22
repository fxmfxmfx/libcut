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
import { useClientData } from "@/lib/tiktok/client-data";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatCount, formatDuration, timeAgo, fullDate } from "@/lib/tiktok/format";
import { cn } from "@/lib/utils";
import { ExternalLinkButton } from "./external-link-button";

export function VideoPlayer({ videoId }: { videoId: string }) {
  const { data, isLoading, isError, error } = useVideo(videoId);
  const [commentsEnabled, setCommentsEnabled] = useState(false);
  const [mobileComments, setMobileComments] = useState(false);
  const [refreshingComments, setRefreshingComments] = useState(false);
  const commentsId = data?.video.id ?? null;
  const comments = useComments(commentsId, commentsEnabled);
  const toggleFav = useToggleFavorite();
  const markSeen = useMarkSeen();
  const closeVideo = useView((s) => s.closeVideo);
  const openAuthor = useView((s) => s.openAuthor);
  const autoMarkSeen = useView((s) => s.autoMarkSeen);
  const dataMode = useView((s) => s.dataMode);
  const t = useView((s) => s.t);
  const lang = useView((s) => s.lang);
  const qc = useQueryClient();
  const { toast } = useToast();
  const seenRef = useRef(false);
  const clientMarkSeen = useClientData((s) => s.markSeen);
  const clientAddFav = useClientData((s) => s.addFavorite);
  const clientRemoveFav = useClientData((s) => s.removeFavorite);
  const clientFavs = useClientData((s) => s.favorites);
  const clientSeen = useClientData((s) => s.seenVideoIds);
  const clientMarkUnseen = useClientData((s) => s.markUnseen);

  useEffect(() => {
    if (!data || seenRef.current) return;
    if (autoMarkSeen) {
      seenRef.current = true;
      if (dataMode === "client") {
        clientMarkSeen(data.video.id, data.video.tiktokId);
      } else if (!data.video.seen) {
        markSeen.mutate({ id: data.video.id, seen: true });
      }
    } else {
      seenRef.current = true;
    }
  }, [data, videoId, markSeen, autoMarkSeen, dataMode, clientMarkSeen]);

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
    if (refreshingComments || !commentsId) return;
    setCommentsEnabled(true);
    setRefreshingComments(true);
    try {
      await qc.cancelQueries({ queryKey: ["comments", commentsId] });
      const r = await fetch(`/api/tiktok/videos/${commentsId}/comments?refresh=1`);
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || `HTTP ${r.status}`);
      qc.setQueryData(["comments", commentsId], result);
    } catch (e) {
      toast({ variant: "destructive", description: (e as Error).message });
    } finally { setRefreshingComments(false); }
  }

  const video = data?.video;
  const author = data?.author;
  const isFav = dataMode === "client"
    ? clientFavs.some((f) => f.videoId === video?.id || f.tiktokId === video?.tiktokId)
    : !!video?.isFavorited;
  const isSeen = dataMode === "client"
    ? clientSeen.includes(video?.id ?? "") || clientSeen.includes(video?.tiktokId ?? "")
    : !!video?.seen;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) closeVideo();
      }}
    >
      <DialogContent
        className="!flex !flex-col !top-1/2 !left-1/2 h-[100dvh] !max-w-none !w-screen !translate-x-[-50%] !translate-y-[-50%] gap-0 overflow-hidden border-0 bg-card p-0 !rounded-none [&>button]:hidden"
      >
        <span className="sr-only">
          <DialogTitle>{video?.title ?? t("nav.feed")}</DialogTitle>
          <DialogDescription>{t("player.comments")}</DialogDescription>
        </span>

        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-card p-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:hidden">
          <Button size="sm" variant={!mobileComments ? "default" : "ghost"} aria-pressed={!mobileComments} onClick={() => setMobileComments(false)}><Play className="size-4" />{t("player.video")}</Button>
          <Button size="sm" variant={mobileComments ? "default" : "ghost"} aria-pressed={mobileComments} onClick={() => { setMobileComments(true); setCommentsEnabled(true); }}><MessageCircle className="size-4" />{t("player.comments")}</Button>
          <Button size="icon" variant="ghost" className="ml-auto" aria-label={t("player.close")} onClick={closeVideo}><X className="size-5" /></Button>
        </div>

        {/* Scrollable container so on mobile the video + details + comments are all reachable.
            On desktop the layout is a side-by-side grid inside this scroll area. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
          {/* ---- Video / slides pane ---- */}
          <div className={cn("relative h-[48dvh] shrink-0 items-center justify-center bg-black lg:h-full lg:min-h-0 lg:flex", mobileComments ? "hidden" : "flex")}>
            {/* Close button (always visible, top-right of the media pane) */}
            <button
              onClick={closeVideo}
              className="absolute right-3 top-3 z-20 hidden lg:grid grid size-10 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80"
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
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-card lg:h-full lg:overflow-hidden">
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
                    {isSeen && (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <CheckCircle2 className="size-3" /> {t("video.watched")}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Scrollable details + comments (desktop) / inline (mobile) */}
                <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden">
                  <div className={cn("space-y-3 p-4 lg:block", mobileComments && "hidden")}>
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

                    {(toggleFav.error || markSeen.error) && <p role="alert" className="text-sm text-destructive">{(toggleFav.error || markSeen.error)?.message}</p>}
                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant={isFav ? "default" : "outline"}
                        className="gap-1.5"
                        onClick={() => {
                          if (dataMode === "client") {
                            if (isFav) {
                              clientRemoveFav(video.id, video.tiktokId);
                            } else if (video) {
                              clientAddFav({
                                videoId: video.id,
                                tiktokId: video.tiktokId,
                                url: video.url,
                                title: video.title,
                                thumbnailUrl: video.thumbnailUrl,
                                duration: video.duration,
                                description: video.description,
                                viewCount: video.viewCount, likeCount: video.likeCount, commentCount: video.commentCount,
                                publishedAt: video.publishedAt, isGallery: video.isGallery, images: video.images,
                                authorUsername: author?.username ?? "",
                                authorDisplayName: author?.displayName ?? null,
                                authorAvatarUrl: author?.avatarUrl ?? null,
                                favoritedAt: Date.now(),
                              });
                            }
                          } else {
                            toggleFav.mutate({ id: video.id, fav: !isFav });
                          }
                        }}
                        disabled={toggleFav.isPending}
                      >
                        <Heart className={cn("size-4", isFav && "fill-current")} />
                        {isFav ? t("player.favorited") : t("player.favorite")}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={handleDownload} disabled={video.isGallery}>
                        <Download className="size-4" /> {t("player.download")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => {
                          if (dataMode === "client") {
                            if (isSeen) clientMarkUnseen(video.id, video.tiktokId);
                            else clientMarkSeen(video.id, video.tiktokId);
                          } else markSeen.mutate({ id: video.id, seen: !isSeen });
                        }}
                        disabled={markSeen.isPending}
                      >
                        <CheckCircle2 className="size-4" />
                        {isSeen ? t("player.markNew") : t("player.markWatched")}
                      </Button>
                      <ExternalLinkButton href={video.url}>
                        <Button size="sm" variant="ghost" className="gap-1.5">
                          <ExternalLink className="size-4" /> {t("player.original")}
                        </Button>
                      </ExternalLinkButton>
                    </div>
                  </div>

                  {/* Comments */}
                  <div className="flex flex-col border-t border-border/60 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
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
                        disabled={comments.isFetching || refreshingComments}
                      >
                        {comments.isFetching || refreshingComments ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3.5" />
                        )}
                        {t("player.comments.refresh")}
                      </Button>
                    </div>

                    <div className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                      {!commentsEnabled ? (
                        <div className="grid place-items-center py-8 text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => setCommentsEnabled(true)}
                          >
                            <MessageCircle className="size-4" />
                            {t("player.comments.load")}
                          </Button>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {t("player.comments.slow")}
                          </p>
                        </div>
                      ) : comments.isLoading || refreshingComments ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin text-primary" />
                            {t("player.comments.loading")}
                          </div>
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
                      ) : comments.error || (comments.data?.error && !comments.data.comments?.length) ? (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
                          {t("player.comments.fail", { err: comments.error?.message ?? comments.data?.error ?? "" })}
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
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

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
      {failed && <div role="alert" className="absolute z-10 rounded-lg bg-black/85 p-5 text-center text-white"><p>{t("player.failed")}</p><Button className="mt-3" variant="secondary" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>{t("common.retry")}</Button></div>}
      <video
        key={attempt}
        onError={() => setFailed(true)}
        ref={ref}
        src={src ?? undefined}
        poster={poster}
        controls
        autoPlay
        loop
        muted={muted}
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
  const touchStart = useRef<number | null>(null);
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
    <div className="relative flex h-full max-h-[100dvh] w-full items-center justify-center"
      onTouchStart={(e) => { touchStart.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        if (touchStart.current === null) return;
        const delta = (e.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
        if (Math.abs(delta) > 45) { if (delta < 0) next(); else prev(); }
        touchStart.current = null;
      }}>
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
        <p className="whitespace-pre-wrap break-words text-sm leading-snug text-foreground/90">
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
