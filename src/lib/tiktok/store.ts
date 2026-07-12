"use client";

import { create } from "zustand";
import { translate, type Lang } from "./i18n";

export type Tab = "feed" | "subscriptions" | "favorites" | "search" | "settings";

interface UIState {
  // navigation
  activeTab: Tab;
  selectedAuthor: string | null;
  openVideoId: string | null;
  searchQuery: string;
  searchKind: "all" | "author" | "video";
  // appearance (mirrored from DB setting + localStorage)
  lang: Lang;
  theme: string;
  accent: string;
  customCss: string;
  autoMarkSeen: boolean;
  dataMode: "local" | "client";
  setTab: (t: Tab) => void;
  openAuthor: (username: string) => void;
  closeAuthor: () => void;
  openVideo: (id: string) => void;
  closeVideo: () => void;
  setSearch: (q: string, kind?: "all" | "author" | "video") => void;
  setLang: (l: Lang) => void;
  setTheme: (t: string) => void;
  setAccent: (c: string) => void;
  setCustomCss: (c: string) => void;
  setAutoMarkSeen: (b: boolean) => void;
  setDataMode: (m: "local" | "client") => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export const useView = create<UIState>((set, get) => ({
  activeTab: "feed",
  selectedAuthor: null,
  openVideoId: null,
  searchQuery: "",
  searchKind: "all",
  lang: (typeof localStorage !== "undefined" && (localStorage.getItem("libcut.lang") as Lang)) || "en",
  theme: (typeof localStorage !== "undefined" && localStorage.getItem("libcut.theme")) || "default",
  accent: (typeof localStorage !== "undefined" && localStorage.getItem("libcut.accent")) || "#fe2c55",
  customCss: (typeof localStorage !== "undefined" && localStorage.getItem("libcut.css")) || "",
  autoMarkSeen: true,
  dataMode: "local",
  setTab: (t) => set({ activeTab: t, selectedAuthor: null }),
  openAuthor: (username) => set({ selectedAuthor: username }),
  closeAuthor: () => set({ selectedAuthor: null }),
  openVideo: (id) => set({ openVideoId: id }),
  closeVideo: () => set({ openVideoId: null }),
  setSearch: (q, kind) =>
    set((s) => ({ searchQuery: q, searchKind: kind ?? s.searchKind, activeTab: "search", selectedAuthor: null })),
  setLang: (l) => {
    if (typeof localStorage !== "undefined") localStorage.setItem("libcut.lang", l);
    set({ lang: l });
  },
  setTheme: (t) => {
    if (typeof localStorage !== "undefined") localStorage.setItem("libcut.theme", t);
    set({ theme: t });
  },
  setAccent: (c) => {
    if (typeof localStorage !== "undefined") localStorage.setItem("libcut.accent", c);
    set({ accent: c });
  },
  setCustomCss: (c) => {
    if (typeof localStorage !== "undefined") localStorage.setItem("libcut.css", c);
    set({ customCss: c });
  },
  setAutoMarkSeen: (b) => set({ autoMarkSeen: b }),
  setDataMode: (m) => set({ dataMode: m }),
  t: (key, vars) => translate(get().lang, key, vars),
}));
