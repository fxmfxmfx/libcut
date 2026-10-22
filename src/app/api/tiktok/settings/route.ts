import { requireLocalMode } from "@/lib/tiktok/access";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { tiktokConfig } from "@/lib/tiktok/config";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/settings
 * Returns all stored settings + current effective proxy status.
 *
 * PATCH /api/tiktok/settings  body: { key: value, ... }
 * Upserts settings. Server-side keys: proxyEnabled, proxyUrl.
 * Client-side keys (language, theme, accent, customCss) are also stored here so
 * they sync across devices, but the client also keeps a localStorage mirror.
 */
export async function GET() {
  if (tiktokConfig.dataMode === "client") return json({
    settings: { language: "en", theme: "default", accent: "#fe2c55", customCss: "", autoMarkSeen: "true" },
    demoMode: tiktokConfig.demoMode,
  });
  await ensureInitialized();
  const rows = await db.setting.findMany();
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;

  return json({
    settings: {
      proxyEnabled: settings.proxyEnabled ?? "true",
      proxyUrl: "",
      language: settings.language ?? "en",
      theme: settings.theme ?? "default",
      accent: settings.accent ?? "#fe2c55",
      customCss: settings.customCss ?? "",
      autoMarkSeen: settings.autoMarkSeen ?? "true",
    },
    envProxy: null,
    proxyConfigured: !!(settings.proxyUrl || tiktokConfig.defaultProxy),
    demoMode: tiktokConfig.demoMode,
  });
}

export async function PATCH(req: NextRequest) {
  const denied = requireLocalMode(req);
  if (denied) return denied;
  await ensureInitialized();
  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  const allowed = new Set([
    "proxyEnabled",
    "proxyUrl",
    "language",
    "theme",
    "accent",
    "customCss",
    "autoMarkSeen",
  ]);
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorJson("Expected a settings object", 400);
  const ops = Object.entries(body);
  if (ops.some(([key, value]) => !allowed.has(key) || typeof value !== "string" || value.length > 50_000)) return errorJson("Invalid setting", 400);
  for (const [key, value] of ops) {
    if (["autoMarkSeen", "proxyEnabled"].includes(key) && !["true", "false"].includes(value)) return errorJson("Invalid boolean setting", 400);
    if (key === "language" && !["en", "ru"].includes(value)) return errorJson("Invalid language", 400);
    if (key === "theme" && !["default", "gruvbox", "catppuccin", "nord", "dracula", "light"].includes(value)) return errorJson("Invalid theme", 400);
    if (key === "accent" && !/^#[a-f0-9]{6}$/i.test(value)) return errorJson("Invalid accent", 400);
    if (key === "proxyUrl" && value) {
      try { const url = new URL(value); if (!["socks5:", "socks5h:", "http:", "https:"].includes(url.protocol)) throw new Error(); }
      catch { return errorJson("Invalid proxy URL", 400); }
    }
  }
  await db.$transaction(ops.map(([key, value]) => db.setting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: { value: String(value) },
    })));
  return json({ ok: true, updated: ops.map(([k]) => k) });
}
