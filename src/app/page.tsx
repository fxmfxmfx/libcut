"use client";

import { useEffect } from "react";
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
  const { activeTab, selectedAuthor, openVideoId } = useView();
  // Kick off init (seed demo data + cache cleanup) as early as possible.
  useStatus();

  useEffect(() => {
    if (openVideoId) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [openVideoId]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar />

        <div className="flex min-h-screen flex-1 flex-col">
          <TopBar />

          <main className="flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-10">
            <div className="mx-auto w-full max-w-[1600px]">
              {selectedAuthor ? (
                <AuthorProfile username={selectedAuthor} />
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

          <footer className="mt-auto hidden border-t border-border/60 px-4 py-4 text-center text-xs text-muted-foreground md:block md:px-6">
            libcut
          </footer>
        </div>
      </div>

      {openVideoId && <VideoPlayer videoId={openVideoId} />}
    </div>
  );
}
