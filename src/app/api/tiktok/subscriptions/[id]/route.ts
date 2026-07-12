import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/tiktok/subscriptions/[id]
 * Unsubscribe (soft): keep videos/favorites, mark author as not subscribed.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureInitialized();
  const { id } = await ctx.params;
  const author = await db.author.findUnique({ where: { id } });
  if (!author) return errorJson("subscription not found", 404);
  await db.author.update({ where: { id }, data: { subscribed: false } });
  return json({ ok: true });
}
