"use client";

import { Heart } from "lucide-react";
import { useFavorites } from "@/lib/tiktok/queries";
import { VideoGrid } from "./video-grid";
import { EmptyState } from "./empty-state";
import { useView } from "@/lib/tiktok/store";
import { Button } from "@/components/ui/button";

export function FavoritesView() {
  const favs = useFavorites();
  const { setTab, t } = useView();
  const videos = favs.data?.favorites ?? [];

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

      {favs.isLoading ? (
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
