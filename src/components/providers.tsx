"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { useState, type ReactNode } from "react";
import { useSettings, useStatus } from "@/lib/tiktok/queries";
import { useView, getLocalStorageError, localStorageErrorEvent, preferencesStorageKey, reportLocalStorageError } from "@/lib/tiktok/store";
import { clientDataStorageKey, resetClientDataFromStorage, useClientData } from "@/lib/tiktok/client-data";
import { audioStorageKey, useAudio } from "@/lib/tiktok/audio";

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

/** Hydrate browser preferences, then sync the shared data mode and local server settings. */
function SettingsSync() {
  const { data: settingsData } = useSettings();
  const { data: statusData } = useStatus();
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

  // Theme, accent, and custom CSS always belong to this browser.
  // Local instances share automatic watched marking.
  useEffect(() => {
    // Do not let the settings query's initial/default data overwrite client
    // preferences before the status endpoint has identified this instance.
    if (!statusData || !settingsData) return;
    // Client instances keep all preferences in localStorage.
    if (statusData?.dataMode === "client") return;

    const s = settingsData.settings;
    setAutoMarkSeen(s.autoMarkSeen !== "false");
  }, [settingsData, statusData?.dataMode, setAutoMarkSeen]);

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
