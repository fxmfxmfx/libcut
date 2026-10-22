"use client";

import { useEffect } from "react";
import { Rss, RefreshCw, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeed, useRefresh, useSubscriptions } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { useClientData } from "@/lib/tiktok/client-data";
import { useQuery } from "@tanstack/react-query";
import { VideoGrid } from "./video-grid";
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

  const videos = dataMode === "client"
    ? (clientFeed.data?.videos ?? []).filter((v) => !clientSeen.includes(v.id) && !clientSeen.includes(v.tiktokId))
    : (feed.data?.videos ?? []);
  const hasSubs = dataMode === "client" ? clientSubs.length > 0 : (subs.data?.subscriptions?.length ?? 0) > 0;
  const isLoading = dataMode === "client" ? clientSubs.length > 0 && clientFeed.isLoading : feed.isLoading;
  const isChecking = dataMode === "client" ? clientFeed.isFetching : refresh.isPending;
  const checkFeed = () => dataMode === "client" ? clientFeed.refetch() : refresh.mutate();
  const feedError = dataMode === "client" ? clientFeed.error : feed.error ?? refresh.error;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Rss className="size-5 text-primary" /> {t("feed.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("feed.desc")}</p>
        </div>
        {hasSubs && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => { checkFeed(); }}
            disabled={isChecking}
          >
            {isChecking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {t("feed.check")}
          </Button>
        )}
      </div>

      {dataMode === "local" && refresh.isPending && videos.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          {t("feed.checking")}
        </div>
      )}
      {dataMode === "local" && refresh.isSuccess && refresh.data?.totalNew ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          <Sparkles className="size-4" />
          {t("feed.found", { n: refresh.data.totalNew })}
        </div>
      ) : null}

      {feedError && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        <p>{feedError.message}</p><Button className="mt-2" size="sm" variant="outline" onClick={() => { checkFeed(); }}>{t("common.retry")}</Button>
      </div>}
      {clientFeed.data?.failures.length ? <div role="status" className="rounded-lg border border-amber-500/40 p-3 text-sm">{t("feed.partial", { n: clientFeed.data.failures.length })}</div> : null}
      {isLoading ? (
        <FeedSkeleton />
      ) : videos.length === 0 ? (
        hasSubs ? (
          <EmptyState
            icon={<Rss className="size-7" />}
            title={t("feed.empty.title")}
            description={t("feed.empty.desc")}
            action={
              (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => { checkFeed(); }} disabled={isChecking}>
                  <RefreshCw className="size-4" /> {t("feed.check")}
                </Button>
              )
            }
          />
        ) : (
          <EmptyState
            icon={<Rss className="size-7" />}
            title={t("feed.empty.nosub.title")}
            description={t("feed.empty.nosub.desc")}
            action={
              <Button variant="outline" size="sm" onClick={() => setTab("search")}>
                {t("feed.empty.nosub.cta")}
              </Button>
            }
          />
        )
      ) : (
        <VideoGrid videos={videos} showAuthor showSeen />
      )}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="video-portrait w-full animate-pulse bg-muted" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-2 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
