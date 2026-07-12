"use client";

import { Heart } from "lucide-react";
import { useFavorites, type VideoInfo } from "@/lib/tiktok/queries";
import { VideoGrid } from "./video-grid";
import { EmptyState } from "./empty-state";
import { useView } from "@/lib/tiktok/store";
import { useClientData } from "@/lib/tiktok/client-data";
import { Button } from "@/components/ui/button";

export function FavoritesView() {
  const favs = useFavorites();
  const { setTab, t, dataMode } = useView();
  const clientFavs = useClientData((s) => s.favorites);

  // In client mode, use localStorage favorites
  const videos = dataMode === "client"
    ? (clientFavs.map((f) => ({
        id: f.videoId,
        tiktokId: f.tiktokId,
        url: f.url,
        title: f.title,
        description: null,
        thumbnailUrl: f.thumbnailUrl,
        duration: f.duration,
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        publishedAt: null as string | null,
        favoritedAt: new Date(f.favoritedAt).toISOString(),
        author: {
          id: "",
          username: f.authorUsername,
          displayName: f.authorDisplayName,
          avatarUrl: f.authorAvatarUrl,
        },
      })) as VideoInfo[])
    : (favs.data?.favorites ?? []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Heart className="size-5 text-primary" /> {t("nav.favorites")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {videos.length > 0 ? `${videos.length}` : t("fav.desc")}
        </p>
      </div>

      {dataMode !== "client" && favs.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="video-portrait w-full animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <EmptyState
          icon={<Heart className="size-7" />}
          title={t("fav.empty.title")}
          description={t("fav.empty.desc")}
          action={
            <Button variant="outline" size="sm" onClick={() => setTab("feed")}>
              {t("fav.empty.cta")}
            </Button>
          }
        />
      ) : (
        <VideoGrid videos={videos} showAuthor />
      )}
    </div>
  );
}
