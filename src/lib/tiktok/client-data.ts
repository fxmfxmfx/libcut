"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Client-side data store for "client" mode (public instances).
 * Stores subscriptions, favorites, and seen-state in localStorage.
 * Used when dataMode === "client" — no server-side persistence.
 */

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
}

interface ClientDataState {
  subscriptions: ClientSubscription[];
  favorites: ClientFavorite[];
  seenVideoIds: string[];
  // Actions
  subscribe: (sub: ClientSubscription) => void;
  unsubscribe: (username: string) => void;
  isSubscribed: (username: string) => boolean;
  addFavorite: (fav: ClientFavorite) => void;
  removeFavorite: (videoId: string) => void;
  isFavorited: (videoId: string) => boolean;
  markSeen: (videoId: string) => void;
  markUnseen: (videoId: string) => void;
  isSeen: (videoId: string) => boolean;
  clearAll: () => void;
}

export const useClientData = create<ClientDataState>()(
  persist(
    (set, get) => ({
      subscriptions: [],
      favorites: [],
      seenVideoIds: [],

      subscribe: (sub) =>
        set((s) => {
          if (s.subscriptions.find((x) => x.username === sub.username)) return s;
          return { subscriptions: [...s.subscriptions, sub] };
        }),

      unsubscribe: (username) =>
        set((s) => ({
          subscriptions: s.subscriptions.filter((x) => x.username !== username),
        })),

      isSubscribed: (username) => get().subscriptions.some((x) => x.username === username),

      addFavorite: (fav) =>
        set((s) => {
          if (s.favorites.find((x) => x.videoId === fav.videoId)) return s;
          return { favorites: [fav, ...s.favorites] };
        }),

      removeFavorite: (videoId) =>
        set((s) => ({
          favorites: s.favorites.filter((x) => x.videoId !== videoId),
        })),

      isFavorited: (videoId) => get().favorites.some((x) => x.videoId === videoId),

      markSeen: (videoId) =>
        set((s) => {
          if (s.seenVideoIds.includes(videoId)) return s;
          return { seenVideoIds: [...s.seenVideoIds, videoId] };
        }),

      markUnseen: (videoId) =>
        set((s) => ({
          seenVideoIds: s.seenVideoIds.filter((x) => x !== videoId),
        })),

      isSeen: (videoId) => get().seenVideoIds.includes(videoId),

      clearAll: () => set({ subscriptions: [], favorites: [], seenVideoIds: [] }),
    }),
    { name: "libcut-client-data" },
  ),
);
