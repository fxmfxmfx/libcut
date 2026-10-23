"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Download, ExternalLink, Heart, Loader2, MessageCircle, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useVideo, useMarkSeen, useToggleFavorite, type VideoInfo } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { useAudio } from "@/lib/tiktok/audio";
import { useClientData } from "@/lib/tiktok/client-data";
import { mergeFeedQueue } from "@/lib/tiktok/feed-queue";
import { formatCount, timeAgo } from "@/lib/tiktok/format";
import { cn } from "@/lib/utils";
import { ExternalLinkButton } from "./external-link-button";
import { FeedComments } from "./feed-comments";
import { MobileVolumeControl } from "./mobile-volume-control";
import { PhotoCarousel } from "./photo-carousel";
import { useVideoWarmup } from "@/lib/tiktok/video-warmup";

const DESKTOP_QUERY = "(min-width: 1024px)";
function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

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
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_QUERY).matches, () => false);
  const { muted, volume, setVolume, toggleMute } = useAudio();
  const [comments, setComments] = useState<VideoInfo | null>(null);
  const [readyId, setReadyId] = useState<string | null>(null);
  const normalizeAudio = useAudio((s) => s.normalizeAudio);
  const viewport = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLDivElement>(null);
  const wheel = useRef({ delta: 0, last: 0, cooldown: 0 });
  const t = useView((s) => s.t);
  const modalOpen = useView((s) => !!s.openVideoId);
  const closeVideo = useView((s) => s.closeVideo);
  const setTab = useView((s) => s.setTab);
  useVideoWarmup(queue[active + 1], readyId === queue[active]?.tiktokId && (presentation === "dialog" || !modalOpen), normalizeAudio);

  useLayoutEffect(() => {
    const node = viewport.current;
    if (node) node.scrollTop = initialIndex * node.clientHeight;
  }, [initialIndex]);

  useEffect(() => {
    if (queue.length > 0 && active >= queue.length - 3 && hasMore && !loadingMore && !loadError) loadMore();
  }, [active, queue.length, hasMore, loadingMore, loadError, loadMore]);

  const navigate = useCallback((index: number) => {
    const node = viewport.current;
    if (!node) return;
    node.scrollTo({ top: Math.max(0, Math.min(queue.length, index)) * node.clientHeight,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [queue.length]);

  useEffect(() => {
    if (presentation === "feed" && modalOpen) return;
    function onWheel(event: WheelEvent) {
      const target = event.target;
      const node = viewport.current;
      if (!node || !(target instanceof Element) || !player.current?.contains(target)) return;
      if (event.ctrlKey || event.defaultPrevented || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
      const scroller = target.closest<HTMLElement>("[data-player-wheel-scroll]");
      if (scroller && scroller.scrollHeight > scroller.clientHeight) return;
      const excluded = target.closest("[data-player-wheel-ignore], [data-inline-comments], button, a, input, textarea, select, [role=slider], [contenteditable=true]");
      if (excluded) {
        // Panels must not pass wheel movement through to the video queue.
        if (node.contains(target)) {
          event.preventDefault();
        }
        return;
      }
      event.preventDefault();
      const now = performance.now();
      const gesture = wheel.current;
      if (now - gesture.last > 180) gesture.delta = 0;
      gesture.last = now;
      if (now < gesture.cooldown) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1);
      if (Math.sign(delta) !== Math.sign(gesture.delta)) gesture.delta = 0;
      gesture.delta += delta;
      if (Math.abs(gesture.delta) < 40) return;
      navigate(active + Math.sign(gesture.delta));
      gesture.delta = 0;
      gesture.cooldown = now + 400;
    }
    document.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => document.removeEventListener("wheel", onWheel, true);
  }, [active, modalOpen, navigate, presentation]);

  function closeComments() {
    setComments(null);
    if (desktop) viewport.current?.focus({ preventScroll: true });
  }

  // Keep the scroll extent, but mount only nearby pages. A profile can contain
  // hundreds of videos; full-screen DOM nodes for all of them burden phones.
  const windowStart = Math.max(0, active - 2);
  const windowEnd = Math.min(queue.length, active + 3);

  if (!queue.length) return <div className="grid h-full place-items-center overflow-y-auto p-4">{empty}</div>;

  return (
    <div ref={player} data-player-presentation={presentation} className="relative flex h-full min-h-0 flex-col bg-black text-white">
      <button onClick={() => presentation === "dialog" ? closeVideo() : setTab("subscriptions")} aria-label={t("player.close")}
        className="player-mobile-close absolute left-3 top-[max(12px,env(safe-area-inset-top))] z-30 grid size-11 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm md:hidden"><X className="size-5" /></button>
      <MobileVolumeControl key={active} />
      <header data-player-wheel-ignore className={cn("hidden md:block shrink-0 border-b border-white/10 bg-zinc-950 lg:border-0 lg:bg-black", presentation === "dialog" && "pt-[env(safe-area-inset-top)]")}>
        <div className="mx-auto flex w-full max-w-[720px] items-center gap-2 px-3 py-2 lg:max-w-none lg:px-7 lg:py-3">
          {presentation === "dialog" && <button onClick={closeVideo} aria-label={t("player.close")} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-white/10"><X className="size-5" /></button>}
          <p aria-live="polite" className="min-w-10 shrink-0 text-xs tabular-nums text-white/60">{Math.min(active + 1, queue.length)} / {queue.length}</p>
          <div className="flex items-center gap-1">
            <button className="grid size-9 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30" aria-label={t("feed.previous")} disabled={active === 0} onClick={() => navigate(active - 1)}><ArrowUp className="size-5" /></button>
            <button className="grid size-9 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30" aria-label={t("feed.next")} disabled={active >= queue.length} onClick={() => navigate(active + 1)}><ArrowDown className="size-5" /></button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button aria-label={muted ? t("feed.unmute") : t("feed.mute")} aria-pressed={!muted} onClick={toggleMute} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-white/10">
              {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </button>
            <Slider aria-label={t("player.volume")} value={[muted ? 0 : volume]} min={0} max={1} step={0.05}
              onValueChange={(value) => setVolume(value[0] ?? 1)} className="w-16 sm:w-24" />
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
      <div
        ref={viewport}
        role="region"
        aria-label="Video feed"
        tabIndex={0}
        className="feed-scroll min-h-0 min-w-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-y-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        style={{ overflowAnchor: "none" }}
        onScroll={(event) => {
          const node = event.currentTarget;
          if (!node.clientHeight) return;
          const next = Math.max(0, Math.min(queue.length, Math.round(node.scrollTop / node.clientHeight)));
          if (next !== active) setComments(null);
          setActive(next);
        }}
        onKeyDown={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea, select, [role=slider]")) return;
          if (event.code === "Space" || event.key.toLowerCase() === "k") {
            event.preventDefault();
            event.currentTarget.querySelector<HTMLButtonElement>('[data-active="true"] [data-player-toggle]')?.click();
            return;
          }
          if (["ArrowDown", "PageDown", "ArrowUp", "PageUp"].includes(event.key)) {
            event.preventDefault();
            navigate(active + (["ArrowDown", "PageDown"].includes(event.key) ? 1 : -1));
          }
        }}
      >
        {windowStart > 0 && <div aria-hidden="true" style={{ height: `${windowStart * 100}%` }} />}
        {queue.slice(windowStart, windowEnd).map((video, offset) => {
          const index = windowStart + offset;
          return (
          <article key={video.tiktokId} data-feed-video={video.tiktokId} data-active={active === index} inert={active !== index}
            aria-label={`${index + 1}. ${video.title || t("video.untitled")}`}
            className="relative h-full snap-start snap-always overflow-hidden">
            {active === index ? <FeedItem video={video} active={active === index && (!comments || desktop) && (presentation === "dialog" || !modalOpen)}
              muted={muted} volume={volume} onComments={setComments} onReady={() => setReadyId(video.tiktokId)} />
              : video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
                : <div className="h-full bg-black" />}
          </article>
          );
        })}
        {windowEnd < queue.length && <div aria-hidden="true" style={{ height: `${(queue.length - windowEnd) * 100}%` }} />}
        <div className="grid h-full snap-start snap-always place-items-center p-8 text-center">
          <div className="space-y-4">
            {loadingMore ? <Loader2 className="mx-auto size-8 animate-spin" /> : <CheckCircle2 className="mx-auto size-10 text-primary" />}
            <p className="font-semibold">{loadingMore ? t("feed.checking") : loadError || t("feed.sessionEnd")}</p>
            {(hasMore || loadError) && <button className="rounded-full border border-white/40 px-5 py-2" onClick={loadMore}>{t("common.retry")}</button>}
            <button className="block w-full text-sm text-white/70 underline" onClick={() => navigate(0)}>{t("feed.backToTop")}</button>
          </div>
        </div>
      </div>
      {comments && <FeedComments key={comments.tiktokId} video={comments} inline={desktop} onClose={closeComments} />}
      </div>
    </div>
  );
}

function FeedItem({ video: source, active, muted, volume, onComments, onReady }: {
  video: VideoInfo; active: boolean; muted: boolean; volume: number; onComments: (video: VideoInfo) => void; onReady: () => void;
}) {
  const details = useVideo(source.id, source);
  const video = details.data?.video ?? source;
  const author = details.data?.author ?? source.author;
  const { t, lang, dataMode, autoMarkSeen, openAuthor, closeVideo } = useView();
  const client = useClientData();
  const seenMutation = useMarkSeen();
  const favoriteMutation = useToggleFavorite();
  const seen = dataMode === "client" ? client.isSeen(video.id, video.tiktokId) : !!video.seen;
  const favorite = dataMode === "client" ? client.isFavorited(video.id, video.tiktokId) : !!video.isFavorited;
  const autoSeen = useRef(false);
  const [measuredAspect, setMeasuredAspect] = useState<number | null>(null);
  const aspect = measuredAspect ?? (video.width && video.height ? video.width / video.height : 9 / 16);

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
    <div data-portrait={aspect < 1} style={{ "--player-aspect": aspect } as CSSProperties} className="player-card mx-auto flex h-full min-h-0 w-full max-w-[720px] flex-col bg-black md:border-x md:border-white/10">
      <div className="player-media-row flex min-h-0 flex-1">
        <FeedMedia video={video} active={active} muted={muted} volume={volume} onWatched={watched} onAspectRatio={(ratio) => { setMeasuredAspect((current) => video.isGallery ? current ?? ratio : ratio); onReady(); }} />
        <aside data-player-wheel-scroll aria-label={t("player.video")} className="player-actions flex w-16 shrink-0 flex-col items-center gap-3 overflow-y-auto overscroll-contain border-l border-white/10 bg-zinc-950 px-2 py-3 sm:w-20 [&>*]:shrink-0 [&>:first-child]:mt-auto [&>:last-child]:mb-auto">
        <FeedAction label={favorite ? t("player.favorited") : t("player.favorite")} pressed={favorite} onClick={toggleFavorite} disabled={favoriteMutation.isPending}>
          <Heart className={cn("size-7", favorite && "fill-primary text-primary")} /><span>{formatCount(video.likeCount)}</span>
        </FeedAction>
        <FeedAction label={t("player.comments")} onClick={() => onComments(video)}><MessageCircle className="size-7" /><span>{formatCount(video.commentCount)}</span></FeedAction>
        <FeedAction label={seen ? t("player.markNew") : t("player.markWatched")} pressed={seen} onClick={() => markSeen(!seen)} disabled={seenMutation.isPending}><CheckCircle2 className={cn("size-6", seen && "text-primary")} /></FeedAction>
        <ExternalLinkButton href={video.url}><button aria-label={t("player.original")} title={t("player.original")} className="player-action grid size-11 place-items-center rounded-full bg-black/40"><ExternalLink className="size-5" /></button></ExternalLinkButton>
        {!video.isGallery && <a href={video.downloadSrc || `/api/tiktok/videos/${video.id}/download`} download aria-label={t("player.download")} className="player-action grid size-11 place-items-center rounded-full bg-black/40"><Download className="size-6" /></a>}
        </aside>
      </div>
      <footer data-player-wheel-ignore className="player-meta shrink-0 space-y-1 border-t border-white/10 bg-zinc-950 px-3 py-2 text-sm">
        {author && <button className="flex max-w-full items-center gap-2 text-left font-bold" onClick={() => { closeVideo(); openAuthor(author.username); }}>
          {author.avatarUrl && <img src={author.avatarUrl} alt="" className="size-7 rounded-full border border-white/30 object-cover" />}
          <span className="truncate">@{author.username}</span>
        </button>}
        <p className="line-clamp-2 break-words text-xs text-white/90">{video.title || video.description || t("video.untitled")}</p>
        <p className="text-[11px] text-white/50">{formatCount(video.viewCount)} {t("feed.views")}<span className="md:hidden">{video.publishedAt ? ` · ${timeAgo(video.publishedAt, lang)}` : ""}</span><span className="hidden md:inline">{seen ? ` · ${t("video.watched")}` : ""}</span></p>
        {details.isError && <div role="alert" className="flex items-center gap-2 text-xs text-red-300"><p className="line-clamp-2 flex-1">{details.error.message}</p><button className="shrink-0 rounded-full border px-3 py-1" onClick={() => { void details.refetch(); }}>{t("common.retry")}</button></div>}
        {(seenMutation.error || favoriteMutation.error) && <p role="alert" className="text-xs text-red-300">{(seenMutation.error || favoriteMutation.error)?.message}</p>}
      </footer>
    </div>
  );
}

function FeedAction({ label, pressed, onClick, disabled, children }: {
  label: string; pressed?: boolean; onClick: () => void; disabled?: boolean; children: ReactNode;
}) {
  return <button aria-label={label} aria-pressed={pressed} title={label} disabled={disabled} onClick={onClick}
    className="player-action flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-full bg-black/30 p-2 text-xs font-medium disabled:opacity-50">{children}</button>;
}

function FeedMedia({ video, active, muted, volume, onWatched, onAspectRatio }: { video: VideoInfo; active: boolean; muted: boolean; volume: number; onWatched: () => void; onAspectRatio: (ratio: number) => void }) {
  const element = useRef<HTMLMediaElement | null>(null);
  const setElement = useCallback((node: HTMLMediaElement | null) => { element.current = node; }, []);
  const [paused, setPaused] = useState(false);
  const pausedIntent = useRef(false);
  const playRequest = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [failedSource, setFailedSource] = useState<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(0);
  const t = useView((s) => s.t);
  const lang = useView((s) => s.lang);
  const normalizeAudio = useAudio((s) => s.normalizeAudio);
  const gallery = !!video.isGallery;
  const source = gallery ? video.audioSrc || `/api/tiktok/videos/${video.id}/audio` : normalizeAudio
    ? `${video.streamSrc || `/api/tiktok/videos/${video.id}/stream`}?normalize=1`
    : video.streamSrc || video.streamUrl || undefined;
  const images = video.isGallery ? video.images ?? [] : [];
  const failed = !!source && failedSource === source;
  const watchedCallback = useRef(onWatched);
  useEffect(() => { watchedCallback.current = onWatched; }, [onWatched]);

  // Pause alone leaves downloads and decoder buffers alive on some phones.
  // Release the old resource when changing videos, retrying, or closing.
  useEffect(() => {
    const media = element.current;
    if (media && source) media.src = source;
    return () => {
      if (!media) return;
      playRequest.current++;
      media.pause();
      media.removeAttribute("src");
      media.load();
    };
  }, [source, attempt, gallery]);

  const requestPlay = useCallback((media: HTMLMediaElement) => {
    const request = ++playRequest.current;
    void media.play().then(() => {
      if (request === playRequest.current && !pausedIntent.current) setBlocked(false);
    }).catch((error: DOMException) => {
      if (request === playRequest.current && !pausedIntent.current && error.name !== "AbortError") setBlocked(true);
    });
  }, []);

  useEffect(() => {
    const media = element.current;
    if (media) { media.volume = volume; media.muted = muted; }
  }, [source, attempt, gallery, muted, volume]);

  useEffect(() => {
    const media = element.current;
    if (!media) return;
    function synchronize() {
      if (!media) return;
      if (active && !pausedIntent.current && !document.hidden) requestPlay(media);
      else { playRequest.current++; media.pause(); }
    }
    synchronize();
    document.addEventListener("visibilitychange", synchronize);
    // User toggles control the element directly. Effect cleanup must not pause
    // a just-resumed track or restart playback after changing volume.
    return () => document.removeEventListener("visibilitychange", synchronize);
  }, [active, source, attempt, gallery, requestPlay]);

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
    if (!media) return;
    if (pausedIntent.current || media.paused) {
      pausedIntent.current = false;
      setPaused(false);
      setBlocked(false);
      media.muted = muted;
      media.volume = volume;
      requestPlay(media);
    } else {
      pausedIntent.current = true;
      playRequest.current++;
      media.pause();
      setPaused(true);
      setBlocked(false);
    }
  }

  return (
    <div className="player-media flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="player-media-frame relative min-h-0 flex-1 overflow-hidden">
      {gallery ? <>
        <audio key={attempt} ref={setElement} className="hidden" loop preload={active ? "auto" : "none"} muted={muted}
          onPlay={() => { setPlaying(true); setBlocked(false); }} onPause={() => setPlaying(false)}
          onError={() => setFailedSource(source)} />
        {images.length ? <PhotoCarousel images={images} title={video.title ?? ""} onAspectRatio={onAspectRatio}
          onTogglePlayback={togglePlayback} paused={paused || blocked} />
          : <div role="status" className="grid h-full place-items-center"><Loader2 className="size-7 animate-spin" /></div>}
        {failed && <div role="status" className="absolute inset-x-16 top-20 z-10 flex items-center justify-center gap-2 rounded-lg bg-black/60 p-2 text-center text-xs text-white/80">
          <span>Sound unavailable</span>
          <button type="button" className="min-h-9 underline" onClick={() => { setFailedSource(undefined); setAttempt((value) => value + 1); }}>{t("common.retry")}</button>
        </div>}
      </> : <>
        <video key={attempt} ref={setElement} poster={video.thumbnailUrl ?? undefined} muted={muted} playsInline loop preload={active ? "auto" : "metadata"}
          className={cn("h-full w-full object-contain", failed && "invisible")} onClick={togglePlayback} onError={() => setFailedSource(source)}
          onLoadStart={() => setBuffering(true)} onWaiting={() => setBuffering(true)}
          onCanPlay={() => setBuffering(false)} onPlaying={() => setBuffering(false)}
          onLoadedMetadata={(event) => { const media = event.currentTarget; if (media.videoWidth > 0 && media.videoHeight > 0) onAspectRatio(media.videoWidth / media.videoHeight); }}
          onPlay={() => { setPlaying(true); setBlocked(false); }} onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => {
            const media = event.currentTarget;
            if (Number.isFinite(media.duration) && media.duration > 0) {
              setProgress(media.currentTime / media.duration * 100);
              if (active && !media.paused && !document.hidden && media.currentTime >= Math.min(2, media.duration * 0.5)) watchedCallback.current();
            }
          }} />
        {active && buffering && !paused && !blocked && !failed ? <div role="status" className="player-buffering pointer-events-none absolute inset-0 grid place-items-center"><span className="rounded-full bg-black/30 p-3"><Loader2 className="size-7 animate-spin" /><span className="sr-only">{t("feed.loading")}</span></span></div>
          : (!playing || blocked) && <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center"><span className="rounded-full bg-black/50 p-5"><Play className="size-10 fill-white" /></span></div>}
      </>}
      {!gallery && (failed || !source) && <div className="absolute inset-0 z-10 grid place-items-center bg-black/70 px-16 text-center">
        <div className="space-y-3"><p>{failed ? t("player.failed") : t("feed.loading")}</p>
          {failed ? <button className="rounded-full border px-4 py-2" onClick={() => { setFailedSource(undefined); setAttempt(attempt + 1); }}>{t("common.retry")}</button> : <Loader2 className="mx-auto size-6 animate-spin" />}
        </div>
      </div>}
      </div>
      <div data-player-wheel-ignore className="player-transport flex h-11 shrink-0 items-center gap-2 border-t border-white/10 bg-zinc-950 px-2">
          <button data-player-toggle onClick={togglePlayback} aria-label={!playing || blocked ? t("feed.play") : t("feed.pause")} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-white/10">
            {!playing || blocked ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </button>
        {!gallery && <input type="range" aria-label={t("player.seek")} min={0} max={100} step={0.1} value={progress}
          onChange={(event) => {
            const media = element.current;
            if (media && Number.isFinite(media.duration) && media.duration > 0) {
              media.currentTime = Number(event.target.value) / 100 * media.duration;
              setProgress(Number(event.target.value));
            }
          }} style={{ "--seek-progress": `${progress}%` } as CSSProperties} className="player-seek h-6 min-w-0 flex-1 cursor-pointer accent-white" />}
      </div>
    </div>
  );
}
