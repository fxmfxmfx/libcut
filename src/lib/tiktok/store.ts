"use client";

import { create } from "zustand";
import { translate, type Lang } from "./i18n";

export type Tab = "feed" | "subscriptions" | "favorites" | "search" | "settings";

const PREFERENCES_KEY = "libcut-preferences-v1";
export const preferencesStorageKey = PREFERENCES_KEY;
const STORAGE_ERROR_EVENT = "libcut:storage-error";
type StorageScope = "preferences" | "clientData";
const storageErrors: Partial<Record<StorageScope, string>> = {};
let storedPreferencesUnreadable = false;
let unreadablePreferencesRaw: string | null = null;

/** Shared storage status for both local preference and client-data persistence. */
export function reportLocalStorageError(scope: StorageScope, error: string | null) {
  if (error) storageErrors[scope] = error;
  else delete storageErrors[scope];
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: getLocalStorageError() }));
  }
}

export function getLocalStorageError(scope?: StorageScope) {
  if (scope) return storageErrors[scope] ?? null;
  return Object.values(storageErrors).join(" ") || null;
}

export function getUnreadablePreferencesRaw() {
  return unreadablePreferencesRaw;
}

export const localStorageErrorEvent = STORAGE_ERROR_EVENT;

export interface Preferences {
  lang: Lang;
  theme: string;
  accent: string;
  customCss: string;
  autoMarkSeen: boolean;
}

interface UIState extends Preferences {
  // navigation
  activeTab: Tab;
  selectedAuthor: string | null;
  openVideoId: string | null;
  openVideoSource: { url: string; tiktokId: string } | null;
  searchQuery: string;
  searchKind: "all" | "author" | "video";
  dataMode: "local" | "client";
  modeReady: boolean;
  preferencesReady: boolean;
  setTab: (t: Tab) => void;
  openAuthor: (username: string) => void;
  closeAuthor: () => void;
  openVideo: (id: string, source?: { url: string; tiktokId: string }) => void;
  closeVideo: () => void;
  setSearch: (q: string, kind?: "all" | "author" | "video") => void;
  setLang: (l: Lang) => void;
  setTheme: (t: string) => void;
  setAccent: (c: string) => void;
  setCustomCss: (c: string) => void;
  setAutoMarkSeen: (b: boolean) => void;
  setDataMode: (m: "local" | "client") => void;
  hydratePreferences: (force?: boolean) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const defaultPreferences: Preferences = {
  lang: "en",
  theme: "default",
  accent: "#fe2c55",
  customCss: "",
  autoMarkSeen: true,
};

function isLang(value: unknown): value is Lang {
  return value === "en" || value === "ru";
}

const themeNames = ["default", "gruvbox", "catppuccin", "nord", "dracula", "light"];

export function isSafeCustomCss(css: unknown): css is string {
  if (typeof css !== "string" || css.length > 50_000 || css.includes("\\")) return false;
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return !/@import\b|url\s*\(|expression\s*\(|-moz-binding|behavior\s*:/i.test(withoutComments);
}

export function isValidPreferenceSet(value: unknown): value is Preferences {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return isLang(v.lang) && typeof v.theme === "string" && themeNames.includes(v.theme) &&
    typeof v.accent === "string" && /^#[0-9a-f]{6}$/i.test(v.accent) &&
    isSafeCustomCss(v.customCss) && typeof v.autoMarkSeen === "boolean";
}

function parsePreferences(value: unknown): Partial<Preferences> {
  return isValidPreferenceSet(value) ? value : {};
}

function savePreferences(preferences: Preferences, replaceUnreadable = false) {
  if (typeof window === "undefined") return;
  if (storedPreferencesUnreadable && !replaceUnreadable) return;
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    storedPreferencesUnreadable = false;
    unreadablePreferencesRaw = null;
    reportLocalStorageError("preferences", null);
  } catch {
    reportLocalStorageError("preferences", "Browser storage is unavailable. Preferences may not survive a reload.");
  }
}

function updatePreference<K extends keyof Preferences>(key: K, value: Preferences[K], set: (v: Partial<UIState>) => void, get: () => UIState) {
  const current = get();
  const next: Preferences = {
    lang: current.lang,
    theme: current.theme,
    accent: current.accent,
    customCss: current.customCss,
    autoMarkSeen: current.autoMarkSeen,
    [key]: value,
  };
  if (!isValidPreferenceSet(next)) {
    reportLocalStorageError("preferences", "This preference value is not supported and was not applied.");
    return;
  }
  set({ [key]: value } as Partial<UIState>);
  savePreferences(next);
}

export const useView = create<UIState>((set, get) => ({
  activeTab: "feed",
  selectedAuthor: null,
  openVideoId: null,
  openVideoSource: null,
  searchQuery: "",
  searchKind: "all",
  ...defaultPreferences,
  dataMode: "local",
  modeReady: false,
  preferencesReady: false,
  setTab: (t) => set({ activeTab: t, selectedAuthor: null }),
  openAuthor: (username) => set({ selectedAuthor: username }),
  closeAuthor: () => set({ selectedAuthor: null }),
  openVideo: (id, source) => set({ openVideoId: id, openVideoSource: source ?? null }),
  closeVideo: () => set({ openVideoId: null, openVideoSource: null }),
  setSearch: (q, kind) =>
    set((s) => ({ searchQuery: q, searchKind: kind ?? s.searchKind, activeTab: "search", selectedAuthor: null })),
  setLang: (lang) => updatePreference("lang", lang, set, get),
  setTheme: (theme) => updatePreference("theme", theme, set, get),
  setAccent: (accent) => updatePreference("accent", accent, set, get),
  setCustomCss: (customCss) => updatePreference("customCss", customCss, set, get),
  setAutoMarkSeen: (autoMarkSeen) => updatePreference("autoMarkSeen", autoMarkSeen, set, get),
  setDataMode: (dataMode) => set({ dataMode, modeReady: true }),
  hydratePreferences: (force = false) => {
    if ((!force && get().preferencesReady) || typeof window === "undefined") return;
    let stored: Partial<Preferences> = {};
    let rawCurrent: string | null = null;
    let resetToDefaults = false;
    try {
      const current = rawCurrent = window.localStorage.getItem(PREFERENCES_KEY);
      if (current) {
        const parsed: unknown = JSON.parse(current);
        stored = parsePreferences(parsed);
        if (Object.keys(stored).length !== Object.keys(defaultPreferences).length) throw new Error("Invalid preferences format");
        storedPreferencesUnreadable = false;
        unreadablePreferencesRaw = null;
        reportLocalStorageError("preferences", null);
      } else if (force) {
        // A storage event means another tab changed or removed this record.
        // Do not revive stale legacy keys after an external removal.
        stored = { ...defaultPreferences };
        resetToDefaults = true;
        storedPreferencesUnreadable = false;
        unreadablePreferencesRaw = null;
        reportLocalStorageError("preferences", null);
      } else {
        // Migrate the old individual keys without removing them. If writing the
        // consolidated record fails, the old keys remain available next time.
        stored = {
          ...(isLang(window.localStorage.getItem("libcut.lang")) ? { lang: window.localStorage.getItem("libcut.lang") as Lang } : {}),
          ...(window.localStorage.getItem("libcut.theme") !== null ? { theme: window.localStorage.getItem("libcut.theme")! } : {}),
          ...(window.localStorage.getItem("libcut.accent") !== null ? { accent: window.localStorage.getItem("libcut.accent")! } : {}),
          ...(window.localStorage.getItem("libcut.css") !== null ? { customCss: window.localStorage.getItem("libcut.css")! } : {}),
          ...(window.localStorage.getItem("libcut.autoMarkSeen") === "true" || window.localStorage.getItem("libcut.autoMarkSeen") === "false"
            ? { autoMarkSeen: window.localStorage.getItem("libcut.autoMarkSeen") === "true" }
            : {}),
        };
        reportLocalStorageError("preferences", null);
        const migrated = { ...defaultPreferences, ...stored };
        if (!isValidPreferenceSet(migrated)) {
          unreadablePreferencesRaw = JSON.stringify({
            lang: window.localStorage.getItem("libcut.lang"),
            theme: window.localStorage.getItem("libcut.theme"),
            accent: window.localStorage.getItem("libcut.accent"),
            customCss: window.localStorage.getItem("libcut.css"),
            autoMarkSeen: window.localStorage.getItem("libcut.autoMarkSeen"),
          });
          throw new Error("Invalid legacy preferences");
        }
        storedPreferencesUnreadable = false;
        unreadablePreferencesRaw = null;
        if (Object.keys(stored).length > 0) savePreferences({ ...defaultPreferences, ...stored });
      }
    } catch {
      storedPreferencesUnreadable = true;
      unreadablePreferencesRaw ??= rawCurrent;
      stored = {};
      reportLocalStorageError("preferences", unreadablePreferencesRaw
        ? "Saved preferences are damaged or unsafe. They were preserved; export the recovery file before replacing them."
        : "Browser preferences could not be read. Existing values were preserved.");
    }
    set({ ...(resetToDefaults ? defaultPreferences : stored), preferencesReady: true });
  },
  t: (key, vars) => translate(get().lang, key, vars),
}));

/** Explicitly replaces damaged preferences after the user confirms a backup import. */
export function restorePreferences(preferences: Preferences) {
  if (!isValidPreferenceSet(preferences)) return;
  useView.setState(preferences);
  savePreferences(preferences, true);
}
