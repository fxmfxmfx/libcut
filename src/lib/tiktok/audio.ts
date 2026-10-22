"use client";

import { create } from "zustand";
import { reportLocalStorageError } from "./store";

export const audioStorageKey = "libcut-audio-v1";
interface AudioPreferences { volume: number; muted: boolean }
interface AudioState extends AudioPreferences {
  ready: boolean;
  hydrate: (force?: boolean) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setAudio: (volume: number, muted: boolean) => void;
}
const defaults: AudioPreferences = { volume: 1, muted: false };

function valid(value: unknown): value is AudioPreferences {
  if (!value || typeof value !== "object") return false;
  const audio = value as AudioPreferences;
  return typeof audio.volume === "number" && Number.isFinite(audio.volume) &&
    audio.volume >= 0 && audio.volume <= 1 && typeof audio.muted === "boolean";
}

export const useAudio = create<AudioState>((set, get) => {
  function update(volume: number, muted: boolean) {
    if (!Number.isFinite(volume)) return;
    volume = Math.min(1, Math.max(0, volume));
    muted = muted || volume === 0;
    if (get().volume === volume && get().muted === muted) return;
    set({ volume, muted });
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(audioStorageKey, JSON.stringify({ volume, muted }));
      reportLocalStorageError("audio", null);
    } catch {
      reportLocalStorageError("audio", "Browser storage is unavailable. Volume may not survive a reload.");
    }
  }
  return {
    ...defaults, ready: false,
    hydrate: (force = false) => {
      if (typeof window === "undefined" || (get().ready && !force)) return;
      try {
        const raw = window.localStorage.getItem(audioStorageKey);
        const audio: unknown = raw === null ? defaults : JSON.parse(raw);
        if (!valid(audio)) throw new Error("Invalid audio preferences");
        set({ volume: audio.volume, muted: audio.muted || audio.volume === 0, ready: true });
        reportLocalStorageError("audio", null);
      } catch {
        set({ ready: true });
        reportLocalStorageError("audio", "Saved volume could not be read. Adjust the volume to save a new value.");
      }
    },
    setVolume: (volume) => update(volume, volume === 0),
    toggleMute: () => {
      const { volume, muted } = get();
      update(muted && volume === 0 ? 1 : volume, !muted);
    },
    setAudio: update,
  };
});
