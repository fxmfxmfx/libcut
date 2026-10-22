"use client";

import { Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClientData } from "@/lib/tiktok/client-data";
import { useRefresh, useSubscriptions } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { useIsFetching, useIsMutating, useQueryClient } from "@tanstack/react-query";
import { SearchBar } from "./search-bar";
import { StatusBadge } from "./status-badge";

export function TopBar() {
  const { activeTab, selectedAuthor, dataMode, t } = useView();
  const showFeedHeader = activeTab === "feed" && !selectedAuthor;
  const clientSubscriptions = useClientData((state) => state.subscriptions);
  const localSubscriptions = useSubscriptions();
  const refresh = useRefresh();
  const clientFeedFetching = useIsFetching({ queryKey: ["client-feed"] });
  const localFeedRefreshing = useIsMutating({ mutationKey: ["feed-refresh"] });
  const queryClient = useQueryClient();
  const hasSubscriptions = dataMode === "client"
    ? clientSubscriptions.length > 0
    : (localSubscriptions.data?.subscriptions.length ?? 0) > 0;
  const refreshing = localFeedRefreshing > 0 || (dataMode === "client" && clientFeedFetching > 0);

  function checkFeed() {
    if (dataMode === "client") {
      void queryClient.refetchQueries({ queryKey: ["client-feed"], type: "active" });
    } else if (dataMode === "local") {
      refresh.mutate();
    }
  }

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2 md:hidden">
          {!showFeedHeader && <ShieldOff className="size-5 text-primary" />}
          {!showFeedHeader && <span className="text-sm font-bold">libcut</span>}
        </div>

        {showFeedHeader && <div className="flex shrink-0 items-center gap-2">
          <h1 className="text-sm font-bold">{t("feed.title")}</h1>
          {hasSubscriptions && <Button variant="ghost" size="icon" className="shrink-0 md:size-9 md:w-auto md:px-3"
            aria-label={refreshing ? t("feed.checking") : t("feed.check")} onClick={checkFeed} disabled={refreshing}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            <span className="hidden md:inline">{t("feed.check")}</span>
          </Button>}
        </div>}

        {refresh.error && showFeedHeader && <p role="alert" className="max-w-36 truncate text-xs text-destructive" title={refresh.error.message}>{refresh.error.message}</p>}

        <div className="flex min-w-0 flex-1 justify-center">
          <SearchBar />
        </div>

        <div className="hidden sm:block">
          <StatusBadge />
        </div>
      </div>
    </header>
  );
}
