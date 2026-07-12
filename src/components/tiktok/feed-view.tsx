"use client";

import { useEffect } from "react";
import { Rss, RefreshCw, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeed, useRefresh, useSubscriptions } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { VideoGrid } from "./video-grid";
import { EmptyState } from "./empty-state";

export function FeedView() {
  const feed = useFeed();
  const subs = useSubscriptions();
  const refresh = useRefresh();
  const { setTab, t } = useView();

  useEffect(() => {
    refresh.mutate();
  }, []);

  const videos = feed.data?.videos ?? [];
  const hasSubs = (subs.data?.subscriptions?.length ?? 0) > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Rss className="size-5 text-primary" /> {t("feed.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("feed.desc")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          {refresh.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {t("feed.check")}
        </Button>
      </div>

      {refresh.isPending && videos.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          {t("feed.checking")}
        </div>
      )}
      {refresh.isSuccess && refresh.data?.totalNew ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          <Sparkles className="size-4" />
          {t("feed.found", { n: refresh.data.totalNew })}
        </div>
      ) : null}

      {feed.isLoading ? (
        <FeedSkeleton />
      ) : videos.length === 0 ? (
        hasSubs ? (
          <EmptyState
            icon={<Rss className="size-7" />}
            title={t("feed.empty.title")}
            description={t("feed.empty.desc")}
            action={
              <Button variant="outline" size="sm" className="gap-2" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
                <RefreshCw className="size-4" /> {t("feed.check")}
              </Button>
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
