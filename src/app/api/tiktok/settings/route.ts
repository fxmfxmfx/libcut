import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json } from "@/lib/tiktok/http";
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
  await ensureInitialized();
  const rows = await db.setting.findMany();
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;

  return json({
    settings: {
      proxyEnabled: settings.proxyEnabled ?? "true",
      proxyUrl: settings.proxyUrl ?? tiktokConfig.defaultProxy ?? "",
      language: settings.language ?? "en",
      theme: settings.theme ?? "default",
      accent: settings.accent ?? "#fe2c55",
      customCss: settings.customCss ?? "",
      autoMarkSeen: settings.autoMarkSeen ?? "true",
      dataMode: settings.dataMode ?? "local",
    },
    envProxy: tiktokConfig.defaultProxy,
    demoMode: tiktokConfig.demoMode,
  });
}

export async function PATCH(req: NextRequest) {
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
    "dataMode",
  ]);
  const ops = Object.entries(body).filter(([k]) => allowed.has(k));
  for (const [key, value] of ops) {
    await db.setting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: { value: String(value) },
    });
  }
  return json({ ok: true, updated: ops.map(([k]) => k) });
}
