/** Formatting helpers for the UI. */

import { translate, type Lang } from "./i18n";

export function formatCount(n: number | null | undefined): string {
  if (n == null) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "") + "K";
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
}

export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function timeAgo(date: Date | string | null | undefined, lang: Lang = "en"): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return translate(lang, "time.justNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${translate(lang, "time.min")}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${translate(lang, "time.h")}`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} ${translate(lang, "time.d")}`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk} ${translate(lang, "time.wk")}`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} ${translate(lang, "time.mo")}`;
  const yr = Math.floor(day / 365);
  return `${yr} ${translate(lang, "time.y")}`;
}

export function fullDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
