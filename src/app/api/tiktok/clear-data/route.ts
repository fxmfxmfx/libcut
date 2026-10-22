import { invalidateLibraryChecks } from "@/lib/tiktok/library";
import { requireLocalMode } from "@/lib/tiktok/access";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";

export const dynamic = "force-dynamic";

/** DELETE /api/tiktok/clear-data — wipe all subscriptions, videos, favorites, comments. */
export async function DELETE(_req: NextRequest) {
  const denied = requireLocalMode(_req);
  if (denied) return denied;
  await ensureInitialized();
  await db.$transaction([db.comment.deleteMany(), db.favorite.deleteMany(), db.video.deleteMany(), db.author.deleteMany(), db.searchHistory.deleteMany()]);
  invalidateLibraryChecks();
  return json({ ok: true });
}
