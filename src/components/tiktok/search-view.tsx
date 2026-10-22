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
import { useClientData } from "@/lib/tiktok/client-data";
import { formatCount } from "@/lib/tiktok/format";

export function SearchView() {
  const { searchQuery, searchKind, setSearch, t, lang } = useView();
  const q = searchQuery.trim();
  const search = useSearch(q, searchKind);

  const authors = search.data?.results?.filter((r) => r.kind === "author") ?? [];
  const matchingAuthors = authors.filter((author) => isCloseAuthorMatch(q, author));
  const orderedAuthors = matchingAuthors.length
    ? [...matchingAuthors, ...authors.filter((author) => !isCloseAuthorMatch(q, author))]
    : authors;
  const videos = search.data?.results?.filter((r) => r.kind === "video") ?? [];
  const normalizedVideos = videos.map(normalizeVideo);
  const authorsFirst = searchKind === "all" && matchingAuthors.length > 0;

  const authorSection = (searchKind === "all" || searchKind === "author") ? (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Users className="size-4" /> {t("search.authors")} ({authors.length})
      </h2>
      {orderedAuthors.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("search.notFound.authors")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orderedAuthors.map((a, i) => (
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
  ) : null;

  const videoSection = (searchKind === "all" || searchKind === "video") ? (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <VideoIcon className="size-4" /> {t("search.videos")} ({videos.length})
      </h2>
      {videos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("search.notFound.videos")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {normalizedVideos.map((video, i) => (
            <VideoCard
              key={video.id ?? `${video.tiktokId}-${i}`}
              video={video}
              queue={normalizedVideos}
              showAuthor
              showSeen
            />
          ))}
        </div>
      )}
    </section>
  ) : null;

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
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm">{t("search.loading")}</p>
        </div>
      ) : (
        <>
          {search.isFetching && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("search.loading")}</p>}
          {search.data?.liveError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400">
              <p>{search.data.liveError}</p>
              <Button size="sm" variant="ghost" onClick={search.refetch}>{t("common.retry")}</Button>
            </div>
          )}

          {authorsFirst ? <>{authorSection}{videoSection}</> : <>{videoSection}{authorSection}</>}
        </>
      )}
    </div>
  );
}

function isCloseAuthorMatch(query: string, author: { username?: string | null; displayName?: string | null }) {
  const normalizedQuery = normalizeMatchText(query);
  if (!normalizedQuery) return false;
  const names = [author.username, author.displayName].filter((name): name is string => !!name).map(normalizeMatchText);
  return names.some((name) => {
    if (!name) return false;
    if (normalizedQuery === name) return true;
    if (normalizedQuery.length < 3) return false;

    const lengthDifference = Math.abs(normalizedQuery.length - name.length);
    const prefixMatch = normalizedQuery.startsWith(name) || name.startsWith(normalizedQuery);
    if (prefixMatch && lengthDifference <= 2) return true;

    const threshold = Math.min(2, Math.max(1, Math.floor(Math.min(normalizedQuery.length, name.length) * 0.12)));
    return lengthDifference <= threshold && editDistanceAtMost(normalizedQuery, name, threshold);
  });
}

function normalizeMatchText(value: string) {
  return value.trim().toLocaleLowerCase().replace(/^@/, "").normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
}

function editDistanceAtMost(left: string, right: string, maximum: number) {
  if (Math.abs(left.length - right.length) > maximum) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMinimum = i;
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      rowMinimum = Math.min(rowMinimum, current[j]);
    }
    if (rowMinimum > maximum) return false;
    previous = current;
  }
  return previous[right.length] <= maximum;
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
  const { openAuthor, t, lang, dataMode } = useView();
  const clientSubs = useClientData((s) => s.subscriptions);
  // In client mode, check subscription from localStorage.
  const isSubscribed = username
    ? (dataMode === "client"
      ? clientSubs.some((s) => s.username.toLowerCase() === username.toLowerCase())
      : subscribed)
    : false;
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
            {isSubscribed && <Badge variant="secondary" className="text-[10px]">{t("author.subscribed")}</Badge>}
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
      {!isSubscribed && (
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
