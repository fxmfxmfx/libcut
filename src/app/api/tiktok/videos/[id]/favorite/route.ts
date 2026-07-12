import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, errorJson } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";

export const dynamic = "force-dynamic";

/**
 * POST /api/tiktok/videos/[id]/favorite   -> add to favorites
 * DELETE /api/tiktok/videos/[id]/favorite -> remove from favorites
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureInitialized();
  const { id } = await ctx.params;
  const v = await db.video.findUnique({ where: { id }, select: { id: true } });
  if (!v) return errorJson("video not found", 404);
  await db.favorite.upsert({
    where: { videoId: id },
    create: { videoId: id },
    update: {},
  });
  return json({ ok: true, isFavorited: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureInitialized();
  const { id } = await ctx.params;
  await db.favorite.deleteMany({ where: { videoId: id } });
  return json({ ok: true, isFavorited: false });
}
