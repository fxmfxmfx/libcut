"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useView } from "@/lib/tiktok/store";

interface PhotoCarouselProps {
  images: string[];
  title: string;
  onAspectRatio: (ratio: number) => void;
  active?: boolean;
  onTogglePlayback?: () => void;
  paused?: boolean;
}

export function PhotoCarousel({ images, title, onAspectRatio, active = true, onTogglePlayback, paused = false }: PhotoCarouselProps) {
  const t = useView((state) => state.t);
  const viewportRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef(0);
  const suppressClick = useRef(false);
  const tap = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const targetRef = useRef<number | null>(null);
  const resizeFrame = useRef<number | null>(null);
  const ratios = useRef(new Map<string, number>());
  const callbackRef = useRef(onAspectRatio);
  const [current, setCurrent] = useState(0);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [retries, setRetries] = useState<Record<string, number>>({});

  useEffect(() => { callbackRef.current = onAspectRatio; }, [onAspectRatio]);

  const setIndex = useCallback((index: number) => {
    const next = Math.max(0, Math.min(images.length - 1, index));
    currentRef.current = next;
    setCurrent((previous) => previous === next ? previous : next);
    const cachedRatio = ratios.current.get(images[next]);
    if (cachedRatio) callbackRef.current(cachedRatio);
  }, [images]);

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = Math.max(0, Math.min(images.length - 1, index));
    // Scroll the carousel element itself; do not invoke scrollIntoView, which
    // can also move the document or the vertically scrolling feed.
    targetRef.current = next;
    viewport.scrollTo({ left: next * viewport.clientWidth, behavior: behavior === "smooth" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : behavior });
  }, [images.length]);

  useLayoutEffect(() => {
    const index = Math.max(0, Math.min(images.length - 1, currentRef.current));
    currentRef.current = index;
    setCurrent(index);
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollLeft = index * viewport.clientWidth;
    const cachedRatio = ratios.current.get(images[index]);
    if (cachedRatio) callbackRef.current(cachedRatio);
  }, [images.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (resizeFrame.current !== null) cancelAnimationFrame(resizeFrame.current);
      resizeFrame.current = requestAnimationFrame(() => {
        resizeFrame.current = null;
        const node = viewportRef.current;
        targetRef.current = null;
        if (node) node.scrollTo({ left: currentRef.current * node.clientWidth, behavior: "instant" });
      });
    });
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      if (resizeFrame.current !== null) cancelAnimationFrame(resizeFrame.current);
    };
  }, []);

  function handleScroll() {
    const viewport = viewportRef.current;
    if (!viewport || !viewport.clientWidth) return;
    if (tap.current) tap.current.moved = true;
    const next = Math.max(0, Math.min(images.length - 1, Math.round(viewport.scrollLeft / viewport.clientWidth)));
    if (targetRef.current !== null && Math.abs(viewport.scrollLeft - targetRef.current * viewport.clientWidth) < 1) targetRef.current = null;
    if (next !== currentRef.current) setIndex(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea, select")) return;
    if ((event.code === "Space" || event.key.toLowerCase() === "k") && onTogglePlayback) {
      event.preventDefault();
      event.stopPropagation();
      onTogglePlayback();
      return;
    }
    const index = targetRef.current ?? currentRef.current;
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      scrollToIndex(index - 1);
    } else if (event.key === "ArrowRight" && index < images.length - 1) {
      event.preventDefault();
      scrollToIndex(index + 1);
    }
  }

  function onImageLoad(src: string, event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    if (!image.naturalWidth || !image.naturalHeight) return;
    setLoaded((previous) => previous[src] ? previous : { ...previous, [src]: true });
    const ratio = image.naturalWidth / image.naturalHeight;
    ratios.current.set(src, ratio);
    if (images[currentRef.current] === src) callbackRef.current(ratio);
  }

  const errorText = "Couldn't load photo";
  const altTitle = title.trim();

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-black" onKeyDown={handleKeyDown}>
      <div
        ref={viewportRef}
        role="region"
        aria-label="Photo gallery"
        aria-roledescription="carousel"
        tabIndex={0}
        onScroll={handleScroll}
        onPointerDown={(event) => {
          targetRef.current = null;
          suppressClick.current = false;
          tap.current = { x: event.clientX, y: event.clientY, moved: false };
        }}
        onPointerMove={(event) => {
          if (tap.current && Math.hypot(event.clientX - tap.current.x, event.clientY - tap.current.y) > 10) tap.current.moved = true;
        }}
        onPointerCancel={() => { if (tap.current) tap.current.moved = true; }}
        onPointerUp={(event) => {
          if (event.pointerType === "mouse" || !event.isPrimary || !tap.current || tap.current.moved) return;
          if (Math.hypot(event.clientX - tap.current.x, event.clientY - tap.current.y) > 10) return;
          if (event.target instanceof Element && event.target.closest("button, a, input")) return;
          suppressClick.current = true;
          onTogglePlayback?.();
        }}
        onClick={(event) => {
          if (event.detail !== 0 && suppressClick.current) { suppressClick.current = false; return; }
          if (event.target instanceof Element && event.target.closest("button, a, input")) return;
          if (tap.current?.moved) return;
          onTogglePlayback?.();
        }}
        onWheel={() => { targetRef.current = null; }}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 [touch-action:pan-x_pan-y_pinch-zoom]"
      >
        {images.map((src, index) => {
          const shouldLoad = active && Math.abs(index - current) <= 1;
          const isFailed = !!failed[src];
          return (
            <div
              key={`${index}:${src}`}
              role="group"
              aria-label={`Photo ${index + 1} of ${images.length}`}
              className="relative flex h-full w-full shrink-0 snap-start snap-always items-center justify-center overflow-hidden"
            >
              {shouldLoad && !isFailed && <>
                {!loaded[src] && <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-900 via-zinc-800/70 to-zinc-900" />}
                <img
                  key={`${src}:${retries[src] ?? 0}`}
                  src={src}
                  alt={altTitle ? `${altTitle} (${index + 1}/${images.length})` : `${index + 1}/${images.length}`}
                  loading="eager"
                  fetchPriority={index === current ? "high" : "low"}
                  decoding="async"
                  onLoad={(event) => onImageLoad(src, event)}
                  onError={() => setFailed((previous) => ({ ...previous, [src]: true }))}
                  className="relative z-[1] h-full w-full object-contain"
                />
              </>}
              {shouldLoad && isFailed && <div role="alert" className="relative z-[1] flex flex-col items-center gap-3 px-5 text-center text-sm text-white/80">
                <p>{errorText}</p>
                <button
                  type="button"
                  onClick={() => {
                    setLoaded((previous) => ({ ...previous, [src]: false }));
                    setFailed((previous) => ({ ...previous, [src]: false }));
                    setRetries((previous) => ({ ...previous, [src]: (previous[src] ?? 0) + 1 }));
                  }}
                  className="min-h-11 rounded-full border border-white/40 px-5 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                >{t("common.retry")}</button>
              </div>}
              {!shouldLoad && <div aria-hidden="true" className="h-full w-full bg-black" />}
            </div>
          );
        })}
      </div>

      {paused && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[2] grid place-items-center"><span className="rounded-full bg-black/40 p-5"><svg viewBox="0 0 24 24" className="size-10 fill-white"><path d="M7 3v18l15-9z" /></svg></span></div>}

      {images.length > 1 && <>
        <button
          type="button"
          aria-label={t("feed.previousPhoto")}
          disabled={current === 0}
          onClick={() => scrollToIndex((targetRef.current ?? currentRef.current) - 1)}
          className="absolute left-2 top-1/2 z-10 hidden size-11 md:grid -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        ><ChevronLeft aria-hidden="true" className="size-6" /></button>
        <button
          type="button"
          aria-label={t("feed.nextPhoto")}
          disabled={current === images.length - 1}
          onClick={() => scrollToIndex((targetRef.current ?? currentRef.current) + 1)}
          className="absolute right-2 top-1/2 z-10 hidden size-11 md:grid -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        ><ChevronRight aria-hidden="true" className="size-6" /></button>
      </>}

      <div className="pointer-events-none absolute inset-x-14 top-[max(16px,env(safe-area-inset-top))] z-10 flex flex-col items-center gap-2">
        <span aria-live="polite" aria-atomic="true" className="rounded-full bg-black/60 px-3 py-1 text-xs tabular-nums text-white">
          {current + 1} / {images.length}
        </span>
        {images.length > 1 && <div className="flex max-w-[85%] items-center justify-center gap-1.5 overflow-hidden" aria-hidden="true">
          {images.map((_, index) => Math.abs(index - current) <= 3 && <span key={index} className={`size-1.5 shrink-0 rounded-full ${index === current ? "bg-white" : "bg-white/45"}`} />)}
        </div>}
      </div>
    </div>
  );
}
