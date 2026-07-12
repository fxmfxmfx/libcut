"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useState, type ReactNode } from "react";
import { useSettings } from "@/lib/tiktok/queries";
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

/** Pull server-side settings into the client store on load. */
function SettingsSync() {
  const { data } = useSettings();
  const setLang = useView((s) => s.setLang);
  const setTheme = useView((s) => s.setTheme);
  const setAccent = useView((s) => s.setAccent);
  const setCustomCss = useView((s) => s.setCustomCss);
  const setAutoMarkSeen = useView((s) => s.setAutoMarkSeen);

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    if (s.language && (s.language === "en" || s.language === "ru")) {
      setLang(s.language as Lang);
    }
    if (s.theme) setTheme(s.theme);
    if (s.accent) setAccent(s.accent);
    if (typeof s.customCss === "string") setCustomCss(s.customCss);
    setAutoMarkSeen(s.autoMarkSeen !== "false");
  }, [data, setLang, setTheme, setAccent, setCustomCss, setAutoMarkSeen]);

  return null;
}
