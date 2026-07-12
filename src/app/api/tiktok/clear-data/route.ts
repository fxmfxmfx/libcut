import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";

export const dynamic = "force-dynamic";

/** DELETE /api/tiktok/clear-data — wipe all subscriptions, videos, favorites, comments. */
export async function DELETE(_req: NextRequest) {
  await ensureInitialized();
  await db.comment.deleteMany();
  await db.favorite.deleteMany();
  await db.video.deleteMany();
  await db.author.deleteMany();
  return json({ ok: true });
}
