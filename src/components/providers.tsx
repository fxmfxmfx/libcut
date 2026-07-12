"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useState, type ReactNode } from "react";
import { useSettings, useStatus } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
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

  // Sync dataMode from env config (via status endpoint).
  useEffect(() => {
    if (statusData?.dataMode) {
      setDataMode(statusData.dataMode);
    }
  }, [statusData?.dataMode, setDataMode]);

  // Only sync appearance settings from server DB in local mode.
  // In client mode, these are localStorage-only.
  useEffect(() => {
    if (!settingsData) return;
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
