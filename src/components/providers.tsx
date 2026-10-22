"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { useState, type ReactNode } from "react";
import { useSettings, useStatus } from "@/lib/tiktok/queries";
import { useView, getLocalStorageError, localStorageErrorEvent, preferencesStorageKey, reportLocalStorageError } from "@/lib/tiktok/store";
import { clientDataStorageKey, resetClientDataFromStorage, useClientData } from "@/lib/tiktok/client-data";
import { audioStorageKey, useAudio } from "@/lib/tiktok/audio";
import type { Lang } from "@/lib/tiktok/i18n";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <SettingsSync />
      <StorageNotice />
      {children}
    </QueryClientProvider>
  );
}

/**
 * Pull server-side settings into the client store on load.
 * In client mode (DATA_MODE=client), appearance settings (language, theme,
 * accent, custom CSS) are NOT synced from the server DB — they stay in
 * localStorage only. This prevents settings from leaking between users on
 * public instances.
 */
function SettingsSync() {
  const { data: settingsData } = useSettings();
  const { data: statusData } = useStatus();
  const setLang = useView((s) => s.setLang);
  const setTheme = useView((s) => s.setTheme);
  const setAccent = useView((s) => s.setAccent);
  const setCustomCss = useView((s) => s.setCustomCss);
  const setAutoMarkSeen = useView((s) => s.setAutoMarkSeen);
  const setDataMode = useView((s) => s.setDataMode);
  const hydratePreferences = useView((s) => s.hydratePreferences);

  useEffect(() => {
    useAudio.getState().hydrate();
    hydratePreferences();
    void useClientData.persist.rehydrate();
  }, [hydratePreferences]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== preferencesStorageKey && event.key !== clientDataStorageKey && event.key !== audioStorageKey) return;
      if (event.url) {
        try {
          if (new URL(event.url).origin !== window.location.origin) return;
        } catch {
          return;
        }
      }
      try {
        const storage = window.localStorage;
        if (event.storageArea && event.storageArea !== storage) return;
      } catch {
        const message = "Browser storage is unavailable. Changes from other tabs could not be synchronized.";
        reportLocalStorageError("preferences", message);
        reportLocalStorageError("clientData", message);
        return;
      }

      if (event.key === null) {
        resetClientDataFromStorage();
        hydratePreferences(true);
        useAudio.getState().hydrate(true);
      } else if (event.key === audioStorageKey) {
        useAudio.getState().hydrate(true);
      } else if (event.key === clientDataStorageKey) {
        if (event.newValue === null) resetClientDataFromStorage();
        else void useClientData.persist.rehydrate();
      } else {
        hydratePreferences(true);
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [hydratePreferences]);

  // Sync dataMode from env config (via status endpoint).
  useEffect(() => {
    if (statusData?.dataMode) {
      setDataMode(statusData.dataMode);
    }
  }, [statusData?.dataMode, setDataMode]);

  // Only sync appearance settings from server DB in local mode.
  // In client mode, these are localStorage-only.
  useEffect(() => {
    // Do not let the settings query's initial/default data overwrite client
    // preferences before the status endpoint has identified this instance.
    if (!statusData || !settingsData) return;
    // In client mode, don't touch appearance settings — they're in localStorage.
    if (statusData?.dataMode === "client") return;

    const s = settingsData.settings;
    if (s.language && (s.language === "en" || s.language === "ru")) {
      setLang(s.language as Lang);
    }
    if (s.theme) setTheme(s.theme);
    if (s.accent) setAccent(s.accent);
    if (typeof s.customCss === "string") setCustomCss(s.customCss);
    setAutoMarkSeen(s.autoMarkSeen !== "false");
  }, [settingsData, statusData?.dataMode, setLang, setTheme, setAccent, setCustomCss, setAutoMarkSeen]);

  return null;
}

function subscribeStorageError(callback: () => void) {
  window.addEventListener(localStorageErrorEvent, callback);
  return () => window.removeEventListener(localStorageErrorEvent, callback);
}
function StorageNotice() {
  const error = useSyncExternalStore(subscribeStorageError, getLocalStorageError, () => null);
  return error ? <div role="alert" className="border-b border-amber-500/40 bg-amber-500/10 p-3 text-sm">{error}</div> : null;
}
