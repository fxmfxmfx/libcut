"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { isSafeCustomCss, reportLocalStorageError } from "./store";

/** Client-side state for public instances. */
export interface ClientSubscription {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  description: string | null;
  followerCount: number;
  subscribedAt: number;
}

export interface ClientFavorite {
  videoId: string;
  tiktokId: string;
  url: string;
  title: string | null;
  thumbnailUrl: string | null;
  duration: number;
  authorUsername: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  favoritedAt: number;
  // Optional fields keep older saved favorites valid while preserving enough
  // data to reopen galleries and show full metadata offline.
  description?: string | null;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  publishedAt?: string | null;
  isGallery?: boolean;
  images?: string[] | null;
  width?: number;
  height?: number;
}

export interface ClientBackup {
  schemaVersion: 1;
  subscriptions: ClientSubscription[];
  favorites: ClientFavorite[];
  seenVideoIds: string[];
  preferences: {
    lang: "en" | "ru";
    theme: string;
    accent: string;
    customCss: string;
    autoMarkSeen: boolean;
  };
}

interface VideoIdentity {
  videoId: string;
  tiktokId?: string | null;
}

interface ClientDataState {
  subscriptions: ClientSubscription[];
  favorites: ClientFavorite[];
  seenVideoIds: string[];
  subscribe: (sub: ClientSubscription) => void;
  unsubscribe: (username: string) => void;
  isSubscribed: (username: string) => boolean;
  addFavorite: (fav: ClientFavorite) => void;
  removeFavorite: (videoId: string, tiktokId?: string | null) => void;
  isFavorited: (videoId: string, tiktokId?: string | null) => boolean;
  markSeen: (videoId: string, tiktokId?: string | null) => void;
  markSeenMany: (videos: VideoIdentity[]) => void;
  markUnseen: (videoId: string, tiktokId?: string | null) => void;
  isSeen: (videoId: string, tiktokId?: string | null) => boolean;
  replaceFromBackup: (backup: Pick<ClientBackup, "subscriptions" | "favorites" | "seenVideoIds">) => void;
  clearAll: () => void;
}

const STORAGE_KEY = "libcut-client-data";
export const clientDataStorageKey = STORAGE_KEY;
const defaults = { subscriptions: [], favorites: [], seenVideoIds: [] };
let storedClientDataUnreadable = false;
let unreadableClientDataRaw: string | null = null;
let syncingFromStorage = false;

function validNullableString(value: unknown) {
  return typeof value === "string" || value === null;
}

function validNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validImageSource(value: unknown) {
  if (typeof value !== "string") return false;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return true;
  if (value.startsWith("data:")) {
    if (value.length > 256 * 1024) return false;
    const match = /^data:image\/(svg\+xml|png|jpeg|gif|webp)(;base64)?,([\s\S]*)$/i.exec(value);
    if (!match) return false;
    const payload = match[3];
    if (match[2]) return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload);
    return !/[\u0000-\u0020\u007f<>"`\\]/.test(payload) && !/%(?![0-9a-f]{2})/i.test(payload);
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validTikTokVideoUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "www.tiktok.com" || url.hostname === "tiktok.com") &&
      !url.port && !url.username && !url.password &&
      /^\/@[a-z0-9._]{1,24}\/(?:video|photo)\/\d+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function validSubscription(value: unknown): value is ClientSubscription {
  if (!value || typeof value !== "object") return false;
  const sub = value as ClientSubscription;
  return typeof sub.username === "string" && /^[A-Za-z0-9._]{1,24}$/.test(sub.username) &&
    validNullableString(sub.displayName) && (sub.avatarUrl === null || validImageSource(sub.avatarUrl)) && validNullableString(sub.description) &&
    validNonNegativeNumber(sub.followerCount) && validNonNegativeNumber(sub.subscribedAt);
}

function validFavorite(value: unknown): value is ClientFavorite {
  if (!value || typeof value !== "object") return false;
  const favorite = value as ClientFavorite;
  return typeof favorite.videoId === "string" && favorite.videoId.length > 0 &&
    typeof favorite.tiktokId === "string" && favorite.tiktokId.length > 0 &&
    validTikTokVideoUrl(favorite.url) &&
    validNullableString(favorite.title) && (favorite.thumbnailUrl === null || validImageSource(favorite.thumbnailUrl)) &&
    validNonNegativeNumber(favorite.duration) && typeof favorite.authorUsername === "string" &&
    validNullableString(favorite.authorDisplayName) && (favorite.authorAvatarUrl === null || validImageSource(favorite.authorAvatarUrl)) &&
    validNonNegativeNumber(favorite.favoritedAt) &&
    (favorite.description === undefined || validNullableString(favorite.description)) &&
    [favorite.viewCount, favorite.likeCount, favorite.commentCount, favorite.shareCount]
      .every((count) => count === undefined || validNonNegativeNumber(count)) &&
    (favorite.publishedAt === undefined || favorite.publishedAt === null ||
      (typeof favorite.publishedAt === "string" && Number.isFinite(Date.parse(favorite.publishedAt)))) &&
    (favorite.isGallery === undefined || typeof favorite.isGallery === "boolean") &&
    (favorite.images === undefined || favorite.images === null ||
      (Array.isArray(favorite.images) && favorite.images.every(validImageSource))) &&
    [favorite.width, favorite.height].every((dimension) => dimension === undefined || validNonNegativeNumber(dimension));
}

export function getUnreadableClientDataRaw() {
  return unreadableClientDataRaw;
}

const safeStorage: StateStorage = {
  getItem: (name) => {
    let raw: string | null = null;
    try {
      const value = raw = window.localStorage.getItem(name);
      if (value !== null) {
        const envelope: unknown = JSON.parse(value);
        const persisted = envelope as { state?: unknown; version?: unknown } | null;
        const persistedState = persisted && typeof persisted === "object" && "state" in persisted
          ? persisted.state
          : null;
        const validState = !!persistedState && typeof persistedState === "object" &&
          Array.isArray((persistedState as Partial<ClientDataState>).subscriptions) &&
          (persistedState as Partial<ClientDataState>).subscriptions!.every(validSubscription) &&
          Array.isArray((persistedState as Partial<ClientDataState>).favorites) &&
          (persistedState as Partial<ClientDataState>).favorites!.every(validFavorite) &&
          Array.isArray((persistedState as Partial<ClientDataState>).seenVideoIds) &&
          (persistedState as Partial<ClientDataState>).seenVideoIds!.every((id) => typeof id === "string" && id.length > 0) &&
          (persisted?.version === 0 || persisted?.version === 1 || persisted?.version === 2);
        if (!validState) {
          storedClientDataUnreadable = true;
          unreadableClientDataRaw = value;
          reportLocalStorageError("clientData", "Saved browser data is damaged. It was preserved; export the recovery file before replacing it.");
          return null;
        }
      }
      storedClientDataUnreadable = false;
      unreadableClientDataRaw = null;
      reportLocalStorageError("clientData", null);
      return value;
    } catch {
      storedClientDataUnreadable = true;
      unreadableClientDataRaw = raw;
      reportLocalStorageError("clientData", raw
        ? "Saved browser data is damaged. It was preserved; export the recovery file before replacing it."
        : "Browser data could not be read. Existing data was preserved.");
      return null;
    }
  },
  setItem: (name, value) => {
    if (syncingFromStorage) return;
    if (storedClientDataUnreadable) return;
    try {
      window.localStorage.setItem(name, value);
      unreadableClientDataRaw = null;
      reportLocalStorageError("clientData", null);
    } catch {
      reportLocalStorageError("clientData", "Browser storage is unavailable or full. Client data may not survive a reload.");
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
      unreadableClientDataRaw = null;
      reportLocalStorageError("clientData", null);
    } catch {
      reportLocalStorageError("clientData", "Could not remove browser data. Existing data was preserved.");
    }
  },
};

function identityKeys(videoId: string, tiktokId?: string | null) {
  return [videoId, tiktokId].filter((v): v is string => Boolean(v));
}

function sameVideo(a: Pick<ClientFavorite, "videoId" | "tiktokId">, videoId: string, tiktokId?: string | null) {
  return a.videoId === videoId || (!!tiktokId && a.tiktokId === tiktokId);
}

export function validateClientBackup(value: unknown): value is ClientBackup {
  if (!value || typeof value !== "object") return false;
  const backup = value as Record<string, unknown>;
  if (backup.schemaVersion !== 1 || !Array.isArray(backup.subscriptions) || !Array.isArray(backup.favorites) || !Array.isArray(backup.seenVideoIds)) return false;
  if (!backup.subscriptions.every((x) => {
    if (!x || typeof x !== "object") return false;
    return validSubscription(x);
  })) return false;
  if (!backup.favorites.every((x) => {
    if (!x || typeof x !== "object") return false;
    return validFavorite(x);
  })) return false;
  if (!backup.seenVideoIds.every((id) => typeof id === "string" && id.length > 0)) return false;
  const p = backup.preferences;
  return !!p && typeof p === "object" &&
    ((p as ClientBackup["preferences"]).lang === "en" || (p as ClientBackup["preferences"]).lang === "ru") &&
    ["default", "gruvbox", "catppuccin", "nord", "dracula", "light"].includes((p as ClientBackup["preferences"]).theme) &&
    typeof (p as ClientBackup["preferences"]).accent === "string" && /^#[0-9a-f]{6}$/i.test((p as ClientBackup["preferences"]).accent) &&
    isSafeCustomCss((p as ClientBackup["preferences"]).customCss) &&
    typeof (p as ClientBackup["preferences"]).autoMarkSeen === "boolean";
}

export const useClientData = create<ClientDataState>()(
  persist(
    (set, get) => ({
      ...defaults,
      subscribe: (sub) => set((s) => s.subscriptions.some((x) => x.username.toLowerCase() === sub.username.toLowerCase())
        ? s
        : { subscriptions: [...s.subscriptions, sub] }),
      unsubscribe: (username) => set((s) => ({ subscriptions: s.subscriptions.filter((x) => x.username.toLowerCase() !== username.toLowerCase()) })),
      isSubscribed: (username) => get().subscriptions.some((x) => x.username.toLowerCase() === username.toLowerCase()),
      addFavorite: (fav) => set((s) => s.favorites.some((x) => sameVideo(x, fav.videoId, fav.tiktokId))
        ? s
        : { favorites: [fav, ...s.favorites] }),
      removeFavorite: (videoId, tiktokId) => set((s) => ({ favorites: s.favorites.filter((x) => !sameVideo(x, videoId, tiktokId)) })),
      isFavorited: (videoId, tiktokId) => get().favorites.some((x) => sameVideo(x, videoId, tiktokId)),
      markSeen: (videoId, tiktokId) => get().markSeenMany([{ videoId, tiktokId }]),
      markSeenMany: (videos) => set((s) => {
        const seen = new Set(s.seenVideoIds);
        for (const video of videos) for (const key of identityKeys(video.videoId, video.tiktokId)) seen.add(key);
        return seen.size === s.seenVideoIds.length ? s : { seenVideoIds: [...seen] };
      }),
      markUnseen: (videoId, tiktokId) => set((s) => {
        const keys = new Set(identityKeys(videoId, tiktokId));
        return { seenVideoIds: s.seenVideoIds.filter((id) => !keys.has(id)) };
      }),
      isSeen: (videoId, tiktokId) => identityKeys(videoId, tiktokId).some((id) => get().seenVideoIds.includes(id)),
      replaceFromBackup: (backup) => {
        // Called only after the user confirms a version-checked backup import.
        storedClientDataUnreadable = false;
        set({ subscriptions: backup.subscriptions, favorites: backup.favorites, seenVideoIds: backup.seenVideoIds });
      },
      clearAll: () => set(defaults),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
      partialize: (state) => ({ subscriptions: state.subscriptions, favorites: state.favorites, seenVideoIds: state.seenVideoIds }) as ClientDataState,
      migrate: (persisted) => ({ ...defaults, ...(persisted as Partial<ClientDataState>) }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) reportLocalStorageError("clientData", unreadableClientDataRaw
          ? "Saved browser data is damaged. It was preserved; export the recovery file before replacing it."
          : "Browser data could not be read. Existing data was preserved.");
      },
    },
  ),
);

/** Reset in-memory state after another tab removes this browser storage key. */
export function resetClientDataFromStorage() {
  storedClientDataUnreadable = false;
  unreadableClientDataRaw = null;
  syncingFromStorage = true;
  try {
    useClientData.setState(defaults);
  } finally {
    syncingFromStorage = false;
  }
  reportLocalStorageError("clientData", null);
}

export function exportClientBackup(preferences: ClientBackup["preferences"]): ClientBackup {
  const { subscriptions, favorites, seenVideoIds } = useClientData.getState();
  return { schemaVersion: 1, subscriptions, favorites, seenVideoIds, preferences };
}
