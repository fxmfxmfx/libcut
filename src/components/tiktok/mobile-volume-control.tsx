"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useAudio } from "@/lib/tiktok/audio";
import { useView } from "@/lib/tiktok/store";

export function MobileVolumeControl() {
  const { muted, volume, setVolume, toggleMute } = useAudio();
  const t = useView((state) => state.t);
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={root} className="player-mobile-volume md:hidden" data-player-wheel-ignore onKeyDown={(event) => {
      if (event.key === "Escape") setOpen(false);
    }}>
      <button
        type="button"
        aria-label={t("player.volume")}
        data-mobile-volume-close={open ? "" : undefined}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="grid size-10 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm"
      >
        {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
      </button>
      {open && (
        <div id={id} data-mobile-volume-open className="absolute right-0 bottom-12 flex w-[180px] items-center gap-2 rounded-full bg-black/60 p-3 text-white backdrop-blur-md">
          <button
            type="button"
            aria-label={muted ? t("feed.unmute") : t("feed.mute")}
            aria-pressed={!muted}
            onClick={toggleMute}
            className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/10"
          >
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
          <Slider
            aria-label={t("player.volume")}
            value={[muted ? 0 : volume]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={(value) => setVolume(value[0] ?? 1)}
          />
        </div>
      )}
    </div>
  );
}
