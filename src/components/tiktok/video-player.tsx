"use client";

import { useMemo } from "react";
import { X, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useVideo } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { SwipeFeed } from "./swipe-feed";

/** Every video entry point uses the same vertical, swipeable player. */
export function VideoPlayer({ videoId }: { videoId: string }) {
  const { data, isLoading, error, refetch } = useVideo(videoId);
  const { openVideoQueue, closeVideo, t } = useView();
  const videos = useMemo(() => openVideoQueue.length ? openVideoQueue : data ? [{ ...data.video, author: data.author }] : [], [openVideoQueue, data]);
  const initialIndex = Math.max(0, videos.findIndex((video) => video.id === videoId || video.tiktokId === videoId));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) closeVideo(); }}>
      <DialogContent showCloseButton={false}
        onEscapeKeyDown={(event) => {
          const volume = document.querySelector<HTMLElement>("[data-mobile-volume-open]");
          if (volume && volume.getClientRects().length > 0) {
            event.preventDefault();
            volume.parentElement?.querySelector<HTMLButtonElement>("[data-mobile-volume-close]")?.click();
            return;
          }
          // A desktop comment panel is part of this dialog, not a modal above it.
          const panel = document.querySelector<HTMLElement>("[data-inline-comments]");
          if (panel) {
            event.preventDefault();
            panel.querySelector<HTMLButtonElement>("[data-comments-close]")?.click();
          }
        }}
        className="!animate-none !fixed !inset-0 !flex !h-dvh !w-screen !max-w-none !translate-x-0 !translate-y-0 !flex-col !gap-0 !overflow-hidden !rounded-none !border-0 !bg-black !p-0">
        <div className="sr-only"><DialogTitle>{data?.video.title || t("nav.feed")}</DialogTitle><DialogDescription>{t("feed.next")}</DialogDescription></div>
        {!videos.length && <button onClick={closeVideo} aria-label={t("player.close")}
          className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-30 grid size-11 place-items-center rounded-full bg-black/60 text-white"><X /></button>}
        <div className="h-full min-h-0 flex-1">
          {videos.length ? <SwipeFeed videos={videos} initialIndex={initialIndex} presentation="dialog" empty={null} hasMore={false} loadingMore={false} loadMore={() => {}} />
            : <div className="grid h-full place-items-center p-8 text-center text-white">
              {isLoading ? <Loader2 className="size-8 animate-spin" /> : <div className="space-y-3"><p>{error?.message || t("player.failed")}</p><button onClick={() => { void refetch(); }} className="rounded-full border px-4 py-2">{t("common.retry")}</button></div>}
            </div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { CommentTree } from "./comment-tree";
