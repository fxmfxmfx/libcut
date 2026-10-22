"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, CheckCircle2, Download, ExternalLink, Heart, Loader2, MessageCircle, Play, Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useVideo, useMarkSeen, useToggleFavorite, type VideoInfo } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { useAudio } from "@/lib/tiktok/audio";
import { useClientData } from "@/lib/tiktok/client-data";
import { mergeFeedQueue } from "@/lib/tiktok/feed-queue";
import { formatCount } from "@/lib/tiktok/format";
import { cn } from "@/lib/utils";
import { ExternalLinkButton } from "./external-link-button";
import { FeedComments } from "./feed-comments";

interface Props {
  videos: VideoInfo[];
  initialIndex?: number;
  presentation?: "feed" | "dialog";
  empty: ReactNode;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  loadError?: string;
}

export function SwipeFeed({ videos, empty, hasMore, loadingMore, loadMore, loadError, initialIndex = 0, presentation = "feed" }: Props) {
  const [previous, setPrevious] = useState(videos);
  const [queue, setQueue] = useState(() => mergeFeedQueue([], videos));
  // Seen mutations remove videos from the unread source. Keep their position in
  // this session so viewers can swipe back and the current video never jumps.
  if (previous !== videos) {
    setPrevious(videos);
    setQueue((current) => mergeFeedQueue(current, videos));
  }
  const [active, setActive] = useState(initialIndex);
  const { muted, volume, setVolume, toggleMute } = useAudio();
  const [comments, setComments] = useState<VideoInfo | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const t = useView((s) => s.t);
  const modalOpen = useView((s) => !!s.openVideoId);

  useEffect(() => {
    const node = viewport.current;
    if (node) node.scrollTop = initialIndex * node.clientHeight;
  }, [initialIndex]);

  useEffect(() => {
    if (queue.length > 0 && active >= queue.length - 3 && hasMore && !loadingMore && !loadError) loadMore();
  }, [active, queue.length, hasMore, loadingMore, loadError, loadMore]);

  function navigate(index: number) {
    const node = viewport.current;
    if (!node) return;
    node.scrollTo({ top: Math.max(0, Math.min(queue.length, index)) * node.clientHeight,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  if (!queue.length) return <div className="grid h-full place-items-center overflow-y-auto p-4">{empty}</div>;

  return (
    <div className="relative h-full min-h-0 bg-black text-white">
      <div
        ref={viewport}
        role="region"
        aria-label="Video feed"
        tabIndex={0}
        className="feed-scroll h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        onScroll={(event) => {
          const node = event.currentTarget;
          setActive(Math.min(queue.length, Math.round(node.scrollTop / node.clientHeight)));
        }}
        onKeyDown={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea, select, [role=slider]")) return;
          if (["ArrowDown", "PageDown", "ArrowUp", "PageUp"].includes(event.key)) {
            event.preventDefault();
            navigate(active + (["ArrowDown", "PageDown"].includes(event.key) ? 1 : -1));
          }
        }}
      >
        {queue.map((video, index) => (
          <article key={video.tiktokId} data-feed-video={video.tiktokId} data-active={active === index} inert={active !== index}
            aria-label={`${index + 1}. ${video.title || t("video.untitled")}`}
            className="relative h-full snap-start snap-always overflow-hidden">
            {Math.abs(active - index) <= 1 ? <FeedItem video={video} active={active === index && !comments && (presentation === "dialog" || !modalOpen)}
              muted={muted} volume={volume} onVolumeChange={setVolume}
              onMute={toggleMute} onComments={setComments} />
              : <div className="h-full bg-black" />}
          </article>
        ))}
        <div className="grid h-full snap-start snap-always place-items-center p-8 text-center">
          <div className="space-y-4">
            {loadingMore ? <Loader2 className="mx-auto size-8 animate-spin" /> : <CheckCircle2 className="mx-auto size-10 text-primary" />}
            <p className="font-semibold">{loadingMore ? t("feed.checking") : loadError || t("feed.sessionEnd")}</p>
            {(hasMore || loadError) && <button className="rounded-full border border-white/40 px-5 py-2" onClick={loadMore}>{t("common.retry")}</button>}
            <button className="block w-full text-sm text-white/70 underline" onClick={() => navigate(0)}>{t("feed.backToTop")}</button>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-3 md:flex">
        <button className="pointer-events-auto grid size-11 place-items-center rounded-full bg-white/15 disabled:opacity-20" aria-label={t("feed.previous")} disabled={active === 0} onClick={() => navigate(active - 1)}><ArrowUp /></button>
        <button className="pointer-events-auto grid size-11 place-items-center rounded-full bg-white/15 disabled:opacity-20" aria-label={t("feed.next")} disabled={active >= queue.length} onClick={() => navigate(active + 1)}><ArrowDown /></button>
      </div>
      <p aria-live="polite" className={cn("pointer-events-none absolute left-4 z-10 text-xs text-white/60", presentation === "dialog" ? "top-20" : "top-14")}>{Math.min(active + 1, queue.length)} / {queue.length}</p>
      {comments && <FeedComments key={comments.tiktokId} video={comments} onClose={() => setComments(null)} />}
    </div>
  );
}

function FeedItem({ video: source, active, muted, volume, onVolumeChange, onMute, onComments }: {
  video: VideoInfo; active: boolean; muted: boolean; volume: number; onVolumeChange: (volume: number) => void;
  onMute: () => void; onComments: (video: VideoInfo) => void;
}) {
  const details = useVideo(source.id, source);
  const video = details.data?.video ?? source;
  const author = details.data?.author ?? source.author;
  const { t, dataMode, autoMarkSeen, openAuthor, closeVideo } = useView();
  const client = useClientData();
  const seenMutation = useMarkSeen();
  const favoriteMutation = useToggleFavorite();
  const seen = dataMode === "client" ? client.isSeen(video.id, video.tiktokId) : !!video.seen;
  const favorite = dataMode === "client" ? client.isFavorited(video.id, video.tiktokId) : !!video.isFavorited;
  const autoSeen = useRef(false);

  function markSeen(next: boolean) {
    if (dataMode === "client") {
      if (next) client.markSeen(video.id, video.tiktokId);
      else client.markUnseen(video.id, video.tiktokId);
    } else seenMutation.mutate({ id: video.id, seen: next });
  }
  function watched() {
    if (!autoMarkSeen || autoSeen.current || seen) return;
    autoSeen.current = true;
    markSeen(true);
  }
  function toggleFavorite() {
    if (dataMode === "local") favoriteMutation.mutate({ id: video.id, fav: !favorite });
    else if (favorite) client.removeFavorite(video.id, video.tiktokId);
    else client.addFavorite({
      ...video, videoId: video.id, authorUsername: author?.username ?? "",
      authorDisplayName: author?.displayName ?? null, authorAvatarUrl: author?.avatarUrl ?? null,
      favoritedAt: Date.now(),
    });
  }

  return (
    <div className="relative mx-auto h-full w-full max-w-[560px] bg-black md:border-x md:border-white/10">
      <FeedMedia video={video} active={active} muted={muted} volume={volume} onWatched={watched} />
      {details.isError && <div role="alert" className="absolute inset-0 z-10 grid place-items-center bg-black/80 px-16 text-center"><div className="space-y-3"><p>{details.error.message}</p><button className="rounded-full border px-4 py-2" onClick={() => { void details.refetch(); }}>{t("common.retry")}</button></div></div>}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30" />
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full bg-black/45 px-3 py-2 backdrop-blur">
        <button aria-label={muted ? t("feed.unmute") : t("feed.mute")} aria-pressed={!muted} onClick={onMute}
          className="grid size-7 place-items-center text-white">
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
        <Slider aria-label={t("player.volume")} value={[muted ? 0 : volume]} min={0} max={1} step={0.05}
          onValueChange={(value) => onVolumeChange(value[0] ?? 1)} className="w-20 md:w-24" />
      </div>
      <div className="absolute bottom-10 left-4 right-20 z-10 space-y-2 text-sm [text-shadow:0_1px_3px_#000]">
        {author && <button className="flex max-w-full items-center gap-2 text-left font-bold" onClick={() => { closeVideo(); openAuthor(author.username); }}>
          {author.avatarUrl && <img src={author.avatarUrl} alt="" className="size-9 rounded-full border border-white/40 object-cover" />}
          <span className="truncate">@{author.username}</span>
        </button>}
        <p className="line-clamp-3 break-words">{video.title || video.description || t("video.untitled")}</p>
        <p className="text-xs text-white/60">{formatCount(video.viewCount)} {t("feed.views")}{seen ? ` · ${t("video.watched")}` : ""}</p>
        {(seenMutation.error || favoriteMutation.error) && <p role="alert" className="text-xs text-red-300">{(seenMutation.error || favoriteMutation.error)?.message}</p>}
      </div>
      <div className="absolute bottom-10 right-3 z-20 flex flex-col items-center gap-4">
        <FeedAction label={favorite ? t("player.favorited") : t("player.favorite")} pressed={favorite} onClick={toggleFavorite} disabled={favoriteMutation.isPending}>
          <Heart className={cn("size-7", favorite && "fill-primary text-primary")} /><span>{formatCount(video.likeCount)}</span>
        </FeedAction>
        <FeedAction label={t("player.comments")} onClick={() => onComments(video)}><MessageCircle className="size-7" /><span>{formatCount(video.commentCount)}</span></FeedAction>
        <FeedAction label={seen ? t("player.markNew") : t("player.markWatched")} pressed={seen} onClick={() => markSeen(!seen)} disabled={seenMutation.isPending}><CheckCircle2 className={cn("size-6", seen && "text-primary")} /></FeedAction>
        <ExternalLinkButton href={video.url}><button aria-label={t("player.original")} title={t("player.original")} className="grid size-11 place-items-center rounded-full bg-black/40"><ExternalLink className="size-5" /></button></ExternalLinkButton>
        {!video.isGallery && <a href={video.downloadSrc || `/api/tiktok/videos/${video.id}/download`} download aria-label={t("player.download")} className="grid size-11 place-items-center rounded-full bg-black/40"><Download className="size-6" /></a>}
      </div>
    </div>
  );
}

function FeedAction({ label, pressed, onClick, disabled, children }: {
  label: string; pressed?: boolean; onClick: () => void; disabled?: boolean; children: ReactNode;
}) {
  return <button aria-label={label} aria-pressed={pressed} title={label} disabled={disabled} onClick={onClick}
    className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-full bg-black/30 p-2 text-xs font-medium disabled:opacity-50">{children}</button>;
}

function FeedMedia({ video, active, muted, volume, onWatched }: { video: VideoInfo; active: boolean; muted: boolean; volume: number; onWatched: () => void }) {
  const element = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [slide, setSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const t = useView((s) => s.t);
  const source = video.streamUrl || video.streamSrc;
  const images = video.isGallery ? video.images ?? [] : [];
  const touchStart = useRef<number | null>(null);
  const watchedCallback = useRef(onWatched);
  useEffect(() => { watchedCallback.current = onWatched; }, [onWatched]);

  useEffect(() => {
    const media = element.current;
    if (!media) return;
    let disposed = false;
    function synchronize() {
      if (!media) return;
      media.volume = volume;
      media.muted = muted;
      if (active && !paused && !document.hidden) {
        void media.play().then(() => { if (!disposed) setBlocked(false); }).catch((error: DOMException) => {
          if (!disposed && error.name !== "AbortError") setBlocked(true);
        });
      } else media.pause();
    }
    synchronize();
    document.addEventListener("visibilitychange", synchronize);
    return () => { disposed = true; document.removeEventListener("visibilitychange", synchronize); media.pause(); };
  }, [active, paused, source, muted, volume, attempt]);

  useEffect(() => {
    if (!active || !images.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function synchronize() {
      clearTimeout(timer);
      if (!document.hidden) timer = setTimeout(() => watchedCallback.current(), 2000);
    }
    synchronize();
    document.addEventListener("visibilitychange", synchronize);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", synchronize); };
  }, [active, images.length]);

  function togglePlayback() {
    const media = element.current;
    if (paused || blocked) {
      if (!media) return;
      media.muted = muted;
      media.volume = volume;
      void media.play().then(() => { setBlocked(false); setPaused(false); }).catch(() => setBlocked(true));
    } else {
      media?.pause();
      setPaused(true);
    }
  }

  return (
    <>
      {images.length ? <div className="relative h-full [touch-action:pan-y_pinch-zoom]" onTouchStart={(e) => { touchStart.current = e.touches[0].clientX; }} onTouchEnd={(e) => {
        if (touchStart.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStart.current;
        if (Math.abs(delta) > 45) setSlide((current) => Math.max(0, Math.min(images.length - 1, current + (delta < 0 ? 1 : -1))));
        touchStart.current = null;
      }}>
        <img src={images[slide]} alt={`${video.title ?? ""} (${slide + 1}/${images.length})`} className="h-full w-full object-contain" />
        <div className="absolute inset-x-0 top-20 z-20 flex items-center justify-center gap-3">
          <button disabled={slide === 0} aria-label={t("feed.previousPhoto")} onClick={() => setSlide(slide - 1)} className="grid size-11 place-items-center rounded-full bg-black/60 disabled:opacity-30"><ChevronLeft /></button>
          <span className="rounded-full bg-black/60 px-3 py-1 text-xs">{slide + 1} / {images.length}</span>
          <button disabled={slide === images.length - 1} aria-label={t("feed.nextPhoto")} onClick={() => setSlide(slide + 1)} className="grid size-11 place-items-center rounded-full bg-black/60 disabled:opacity-30"><ChevronRight /></button>
        </div>
      </div> : <>
        <video key={attempt} ref={element} src={source} poster={video.thumbnailUrl ?? undefined} muted={muted} playsInline loop preload={active ? "auto" : "metadata"}
          className="h-full w-full object-contain" onError={() => setFailed(true)}
          onTimeUpdate={(event) => {
            const media = event.currentTarget;
            if (Number.isFinite(media.duration) && media.duration > 0) {
              setProgress(media.currentTime / media.duration * 100);
              if (active && !media.paused && !document.hidden && media.currentTime >= Math.min(2, media.duration * 0.5)) watchedCallback.current();
            }
          }} />
        <button onClick={togglePlayback} aria-label={paused || blocked ? t("feed.play") : t("feed.pause")} className="absolute inset-0 z-[1] grid place-items-center focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
          {(paused || blocked) && <span className="rounded-full bg-black/50 p-5"><Play className="size-10 fill-white" /></span>}
        </button>
        <input type="range" aria-label={t("player.seek")} min={0} max={100} step={0.1} value={progress}
          onChange={(event) => {
            const media = element.current;
            if (media && Number.isFinite(media.duration) && media.duration > 0) {
              media.currentTime = Number(event.target.value) / 100 * media.duration;
              setProgress(Number(event.target.value));
            }
          }} className="absolute inset-x-4 bottom-2 z-20 h-5 w-[calc(100%-2rem)] cursor-pointer accent-white" />
      </>}
      {(failed || (!source && !images.length)) && <div className="absolute inset-0 z-10 grid place-items-center bg-black/70 px-16 text-center">
        <div className="space-y-3"><p>{failed ? t("player.failed") : t("feed.loading")}</p>
          {failed ? <button className="rounded-full border px-4 py-2" onClick={() => { setFailed(false); setAttempt(attempt + 1); }}>{t("common.retry")}</button> : <Loader2 className="mx-auto size-6 animate-spin" />}
        </div>
      </div>}
    </>
  );
}
