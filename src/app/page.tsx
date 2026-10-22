"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/tiktok/top-bar";
import { Sidebar } from "@/components/tiktok/sidebar";
import { FeedView } from "@/components/tiktok/feed-view";
import { SubscriptionsView } from "@/components/tiktok/subscriptions-view";
import { FavoritesView } from "@/components/tiktok/favorites-view";
import { SearchView } from "@/components/tiktok/search-view";
import { AuthorProfile } from "@/components/tiktok/author-profile";
import { VideoPlayer } from "@/components/tiktok/video-player";
import { SettingsView } from "@/components/tiktok/settings-view";
import { useView } from "@/lib/tiktok/store";
import { useStatus } from "@/lib/tiktok/queries";

export default function Home() {
  const { activeTab, selectedAuthor, openVideoId, modeReady, preferencesReady, t } = useView();
  const status = useStatus();
  const immersiveFeed = activeTab === "feed" && !selectedAuthor;
  useEffect(() => {
    if (openVideoId) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [openVideoId]);

  if (!modeReady || !preferencesReady) return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
      <div className="space-y-4 text-center" role="status">
        {status.isError ? <><p>{status.error.message}</p><Button onClick={() => status.refetch()}>{t("common.retry")}</Button></>
          : <><Loader2 className="mx-auto size-7 animate-spin text-primary" /><p>libcut 2.0</p></>}
      </div>
    </main>
  );

  return (
    <div className={immersiveFeed ? "flex h-dvh flex-col overflow-hidden bg-background text-foreground" : "flex min-h-screen flex-col bg-background text-foreground"}>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Sidebar />

        <div className={immersiveFeed ? "flex min-h-0 min-w-0 flex-1 flex-col pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0" : "flex min-h-screen min-w-0 flex-1 flex-col"}>
          <TopBar />

          <main className={immersiveFeed ? "min-h-0 flex-1" : "flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-10"}>
            <div className={immersiveFeed ? "h-full" : "mx-auto w-full max-w-[1600px]"}>
              {selectedAuthor ? (
                <AuthorProfile key={selectedAuthor} username={selectedAuthor} />
              ) : activeTab === "feed" ? (
                <FeedView />
              ) : activeTab === "subscriptions" ? (
                <SubscriptionsView />
              ) : activeTab === "favorites" ? (
                <FavoritesView />
              ) : activeTab === "settings" ? (
                <SettingsView />
              ) : (
                <SearchView />
              )}
            </div>
          </main>

          {!immersiveFeed && <footer className="mt-auto hidden border-t border-border/60 px-4 py-4 text-center text-xs text-muted-foreground md:block md:px-6">
            libcut 2.0
          </footer>}
        </div>
      </div>

      {openVideoId && <VideoPlayer key={openVideoId} videoId={openVideoId} />}
    </div>
  );
}
