"use client";

import { useEffect, useMemo } from "react";
import { Rss, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeed, useRefresh, useSubscriptions } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { useClientData } from "@/lib/tiktok/client-data";
import { useQuery } from "@tanstack/react-query";
import { SwipeFeed } from "./swipe-feed";
import { EmptyState } from "./empty-state";
import type { VideoInfo } from "@/lib/tiktok/queries";

export function FeedView() {
  const feed = useFeed();
  const subs = useSubscriptions();
  const refresh = useRefresh();
  const { setTab, t, dataMode } = useView();
  const clientSubs = useClientData((s) => s.subscriptions);
  const clientSeen = useClientData((s) => s.seenVideoIds);

  const clientFeed = useQuery({
    queryKey: ["client-feed", clientSubs.map((s) => s.username).sort()],
    enabled: dataMode === "client" && clientSubs.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const videos = new Map<string, VideoInfo>();
      const failures: string[] = [];
      for (let i = 0; i < clientSubs.length; i += 3) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        await Promise.all(clientSubs.slice(i, i + 3).map(async (sub) => {
          try {
            const r = await fetch(`/api/tiktok/authors/${encodeURIComponent(sub.username)}?refresh=1`, { signal });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
            if (d.refreshError) failures.push(`@${sub.username}: ${d.refreshError}`);
            for (const v of d.videos ?? []) videos.set(v.tiktokId, { ...v, author: d.author });
          } catch (e) {
            if (signal.aborted) throw e;
            failures.push(`@${sub.username}: ${(e as Error).message}`);
          }
        }));
      }
      if (!videos.size && failures.length) throw new Error(failures.join("; "));
      return { videos: [...videos.values()].sort((a, b) => Date.parse(b.publishedAt ?? "1970-01-01") - Date.parse(a.publishedAt ?? "1970-01-01")), failures };
    },
  });

  useEffect(() => {
    if (dataMode === "local") refresh.mutate();
  }, [dataMode]);

  const videos = useMemo(() => dataMode === "client"
    ? (clientFeed.data?.videos ?? []).filter((v) => !clientSeen.includes(v.id) && !clientSeen.includes(v.tiktokId))
    : (feed.data?.videos ?? []), [dataMode, clientFeed.data, clientSeen, feed.data]);
  const sessionKey = dataMode + ":" + (dataMode === "client" ? clientSubs.map((s) => s.username) : (subs.data?.subscriptions ?? []).map((s) => s.username)).sort().join(",");
  const hasSubs = dataMode === "client" ? clientSubs.length > 0 : (subs.data?.subscriptions?.length ?? 0) > 0;
  const isLoading = dataMode === "client" ? clientSubs.length > 0 && clientFeed.isLoading : feed.isLoading;
  const isChecking = dataMode === "client" ? clientFeed.isFetching : refresh.isPending;
  const checkFeed = () => dataMode === "client" ? clientFeed.refetch() : refresh.mutate();
  const feedError = dataMode === "client" ? clientFeed.error : feed.error ?? refresh.error;

  const empty = hasSubs ? (
    <EmptyState icon={<Rss className="size-7" />} title={t("feed.empty.title")} description={t("feed.empty.desc")}
      action={<Button variant="outline" size="sm" onClick={() => { checkFeed(); }} disabled={isChecking}><RefreshCw className="size-4" /> {t("feed.check")}</Button>} />
  ) : (
    <EmptyState icon={<Rss className="size-7" />} title={t("feed.empty.nosub.title")} description={t("feed.empty.nosub.desc")}
      action={<Button variant="outline" size="sm" onClick={() => setTab("search")}>{t("feed.empty.nosub.cta")}</Button>} />
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {feedError && <div role="alert" className="flex shrink-0 items-center justify-between gap-2 bg-destructive/10 px-4 py-2 text-xs">
        <p className="line-clamp-2">{feedError.message}</p><Button size="sm" variant="outline" onClick={() => { checkFeed(); }}>{t("common.retry")}</Button>
      </div>}
      {clientFeed.data?.failures.length ? <p role="status" className="shrink-0 px-4 py-2 text-xs text-amber-500">{t("feed.partial", { n: clientFeed.data.failures.length })}</p> : null}
      <div className="min-h-0 flex-1">
        {isLoading ? <div role="status" className="grid h-full place-items-center"><Loader2 className="size-8 animate-spin text-primary" /></div>
          : <SwipeFeed key={sessionKey} videos={videos} empty={empty} hasMore={dataMode === "local" && feed.hasNextPage}
              loadingMore={feed.isFetching} loadMore={() => { if (!feed.isFetching) void feed.fetchNextPage(); }}
              loadError={feed.isFetchNextPageError ? feed.error?.message : undefined} />}
      </div>
    </div>
  );
}
