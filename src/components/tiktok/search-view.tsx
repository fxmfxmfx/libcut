"use client";

import { Search, Loader2, Users, Video as VideoIcon, UserPlus } from "lucide-react";
import { useSearch } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VideoCard } from "./video-card";
import { EmptyState } from "./empty-state";
import { SubscribeDialog } from "./subscribe-dialog";
import { formatCount } from "@/lib/tiktok/format";

export function SearchView() {
  const { searchQuery, searchKind, setSearch, t, lang } = useView();
  const q = searchQuery.trim();
  const search = useSearch(q, searchKind);

  const authors = search.data?.results?.filter((r) => r.kind === "author") ?? [];
  const videos = search.data?.results?.filter((r) => r.kind === "video") ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Search className="size-5 text-primary" /> {t("nav.search")}
          </h1>
        </div>
        <ToggleGroup
          type="single"
          value={searchKind}
          onValueChange={(v) => v && setSearch(searchQuery, v as "all" | "author" | "video")}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="all">{t("search.all")}</ToggleGroupItem>
          <ToggleGroupItem value="author">{t("search.authors")}</ToggleGroupItem>
          <ToggleGroupItem value="video">{t("search.videos")}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!q ? (
        <EmptyState
          icon={<Search className="size-7" />}
          title={t("search.start")}
          description={t("search.start.desc")}
        />
      ) : search.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" /> …
        </div>
      ) : (
        <>
          {search.data?.liveError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400">
              {search.data.liveError}
            </div>
          )}

          {(searchKind === "all" || searchKind === "author") && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Users className="size-4" /> {t("search.authors")} ({authors.length})
              </h2>
              {authors.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("search.notFound.authors")}</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {authors.map((a, i) => (
                    <AuthorResultCard
                      key={`${a.username}-${i}`}
                      username={a.username}
                      displayName={a.displayName}
                      avatarUrl={a.avatarUrl}
                      description={a.description}
                      followerCount={a.followerCount}
                      subscribed={a.subscribed}
                      source={a.source}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {(searchKind === "all" || searchKind === "video") && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <VideoIcon className="size-4" /> {t("search.videos")} ({videos.length})
              </h2>
              {videos.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("search.notFound.videos")}</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {videos.map((v, i) => (
                    <VideoCard
                      key={v.id ?? `${v.tiktokId}-${i}`}
                      video={normalizeVideo(v)}
                      showAuthor
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function AuthorResultCard({
  username,
  displayName,
  avatarUrl,
  description,
  followerCount,
  subscribed,
  source,
}: {
  username?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  description?: string | null;
  followerCount?: number;
  subscribed?: boolean;
  source?: string;
}) {
  const { openAuthor, t, lang } = useView();
  if (!username) return null;
  return (
    <Card className="p-4 transition-colors hover:border-primary/40">
      <button onClick={() => openAuthor(username)} className="flex w-full items-start gap-3 text-left">
        <Avatar className="size-12 border border-border/50">
          <AvatarImage src={avatarUrl ?? undefined} />
          <AvatarFallback>{(displayName ?? username).slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{displayName ?? username}</span>
            {subscribed && <Badge variant="secondary" className="text-[10px]">{t("author.subscribed")}</Badge>}
            {source === "library" && (
              <Badge variant="outline" className="text-[10px] text-primary">{t("search.inLibrary")}</Badge>
            )}
            {source === "live" && (
              <Badge variant="outline" className="text-[10px] text-primary">{t("search.onTikTok")}</Badge>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">@{username}</div>
          {description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{description}</p>}
          {typeof followerCount === "number" && followerCount > 0 && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              {formatCount(followerCount)} {t("author.followers")}
            </div>
          )}
        </div>
      </button>
      {!subscribed && (
        <div className="mt-3 flex justify-end">
          <SubscribeDialog username={username}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <UserPlus className="size-3.5" /> {t("subs.subscribe")}
            </Button>
          </SubscribeDialog>
        </div>
      )}
    </Card>
  );
}

function normalizeVideo(v: any) {
  if (v.video) {
    return {
      id: v.id ?? v.video.tiktokId,
      tiktokId: v.video.tiktokId,
      url: v.video.url,
      title: v.video.title,
      description: v.video.description,
      thumbnailUrl: v.video.thumbnailUrl,
      duration: v.video.duration,
      viewCount: v.video.viewCount,
      likeCount: v.video.likeCount,
      commentCount: v.video.commentCount ?? 0,
      publishedAt: v.video.publishedAt,
      isGallery: v.video.isGallery,
      author: v.video.authorUsername
        ? { id: "", username: v.video.authorUsername, displayName: v.video.authorUsername }
        : undefined,
    };
  }
  return v;
}
