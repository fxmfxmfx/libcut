/** Small helpers for Next.js route handlers. */
import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function errorJson(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

/** Format a TikTok username/handle into a clean handle (no @). */
export function cleanUsername(input: string): string {
  const value = input.trim();
  const match = /^https:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9_.]{1,24})\/?(?:\?.*)?$/.exec(value);
  const username = (match?.[1] ?? value.replace(/^@/, "")).toLowerCase();
  return /^[a-z0-9_][a-z0-9_.]{0,23}$/.test(username) ? username : "";
}

export function boundedInt(value: string | null, fallback: number, min: number, max: number) {
  const number = Number(value);
  return value !== null && Number.isFinite(number) ? Math.min(max, Math.max(min, Math.floor(number))) : fallback;
}

export function canonicalVideoUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || !["www.tiktok.com", "tiktok.com"].includes(url.hostname) || url.port || url.username || url.password) return null;
    if (!/^\/@[a-zA-Z0-9_.]{1,24}\/(?:video|photo)\/\d+$/.test(url.pathname.replace(/\/$/, ""))) return null;
    return `https://www.tiktok.com${url.pathname.replace(/\/$/, "")}`;
  } catch { return null; }
}
