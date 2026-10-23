"use client";

import { useEffect } from "react";
import type { VideoInfo } from "./queries";

const warmed = new Map<string, number>();

/** Warm one server cache entry after the current media is ready, without a decoder. */
export function useVideoWarmup(video: VideoInfo | undefined, ready: boolean, normalizeAudio: boolean) {
  const id = video?.id;
  const isGallery = video?.isGallery;
  useEffect(() => {
    if (!ready || !id || isGallery) return;
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return;
    const url = `/api/tiktok/videos/${encodeURIComponent(id)}/stream${normalizeAudio ? "?normalize=1" : ""}`;
    if ((warmed.get(url) ?? 0) > Date.now()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (document.hidden) return;
      void fetch(url, { headers: { Range: "bytes=0-0" }, signal: controller.signal }).then(async (response) => {
        if (response.status !== 206) {
          await response.body?.cancel();
          return;
        }
        await response.arrayBuffer();
        if (warmed.size >= 100) warmed.delete(warmed.keys().next().value!);
        warmed.set(url, Date.now() + 60_000);
      }).catch(() => { /* Warming must not surface errors or block navigation. */ });
    }, 750);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [id, isGallery, ready, normalizeAudio]);
}
