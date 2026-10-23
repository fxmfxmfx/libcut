"use client";

import { create } from "zustand";
import { reportLocalStorageError } from "./store";

export const audioStorageKey = "libcut-audio-v1";
interface AudioPreferences { volume: number; muted: boolean; normalizeAudio: boolean; normalizationVersion?: number }
interface AudioState extends AudioPreferences {
  ready: boolean;
  hydrate: (force?: boolean) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setAudio: (volume: number, muted: boolean) => void;
  setNormalizeAudio: (enabled: boolean) => void;
}
const defaults: AudioPreferences = { volume: 1, muted: false, normalizeAudio: false };

function valid(value: unknown): value is AudioPreferences {
  if (!value || typeof value !== "object") return false;
  const audio = value as AudioPreferences;
  return typeof audio.volume === "number" && Number.isFinite(audio.volume) &&
    audio.volume >= 0 && audio.volume <= 1 && typeof audio.muted === "boolean" &&
    (audio.normalizeAudio === undefined || typeof audio.normalizeAudio === "boolean") &&
    (audio.normalizationVersion === undefined || audio.normalizationVersion === 2);
}

export const useAudio = create<AudioState>((set, get) => {
  function persist() {
    if (typeof window === "undefined") return;
    const { volume, muted, normalizeAudio } = get();
    try {
      window.localStorage.setItem(audioStorageKey, JSON.stringify({ volume, muted, normalizeAudio, normalizationVersion: 2 }));
      reportLocalStorageError("audio", null);
    } catch {
      reportLocalStorageError("audio", "Browser storage is unavailable. Audio preferences may not survive a reload.");
    }
  }
  function update(volume: number, muted: boolean) {
    if (!Number.isFinite(volume)) return;
    volume = Math.min(1, Math.max(0, volume));
    muted = muted || volume === 0;
    if (get().volume === volume && get().muted === muted) return;
    set({ volume, muted });
    persist();
  }
  return {
    ...defaults, ready: false,
    hydrate: (force = false) => {
      if (typeof window === "undefined" || (get().ready && !force)) return;
      try {
        const raw = window.localStorage.getItem(audioStorageKey);
        const audio: unknown = raw === null ? defaults : JSON.parse(raw);
        if (!valid(audio)) throw new Error("Invalid audio preferences");
        // The previous release enabled normalization implicitly. Require a new
        // explicit choice so existing browsers also adopt the disabled default.
        set({ volume: audio.volume, muted: audio.muted || audio.volume === 0, normalizeAudio: audio.normalizationVersion === 2 && audio.normalizeAudio === true, ready: true });
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
    setNormalizeAudio: (normalizeAudio) => {
      set({ normalizeAudio });
      persist();
    },
  };
});
