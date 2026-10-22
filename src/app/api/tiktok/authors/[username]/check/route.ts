import { requireSameOrigin } from "@/lib/tiktok/access";
import { NextRequest } from "next/server";
import { json, errorJson, cleanUsername, boundedInt } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { checkAuthor } from "@/lib/tiktok/library";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const denied = requireSameOrigin(req);
  if (denied) return denied;
  const username = cleanUsername((await ctx.params).username);
  if (!username) return errorJson("Invalid TikTok username", 400);
  const limit = boundedInt(req.nextUrl.searchParams.get("limit"), 30, 1, 100);
  const offset = boundedInt(req.nextUrl.searchParams.get("offset"), 0, 0, 10_000);
  await ensureInitialized();
  try { return json(await checkAuthor(username, limit, offset)); }
  catch (e) { return errorJson((e as Error).message, 502); }
}
