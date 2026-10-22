import { db } from "@/lib/db";
import { json } from "@/lib/tiktok/http";
import { ensureInitialized } from "@/lib/tiktok/init";
import { requireLocalMode } from "@/lib/tiktok/access";
import { checkAuthor } from "@/lib/tiktok/library";
export const dynamic = "force-dynamic";
let refresh: Promise<unknown> | null = null;
export async function POST(req: Request) {
  const denied = requireLocalMode(req);
  if (denied) return denied;
  await ensureInitialized();
  if (!refresh) refresh = (async () => {
    const authors = await db.author.findMany({ where: { subscribed: true } });
    const summary: { username: string; newVideos: number; error?: string }[] = [];
    // Small batches avoid creating unbounded subprocesses and exhausting SQLite.
    for (let i = 0; i < authors.length; i += 3) {
      const batch = await Promise.all(authors.slice(i, i + 3).map(async (a) => {
        try { return { username: a.username, ...(await checkAuthor(a.username)) }; }
        catch (e) { return { username: a.username, newVideos: 0, error: (e as Error).message }; }
      }));
      summary.push(...batch);
    }
    return { totalNew: summary.reduce((n, a) => n + a.newVideos, 0), checkedAuthors: authors.length, summary };
  })().finally(() => { refresh = null; });
  return json(await refresh);
}
