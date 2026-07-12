"use client";

import { useState } from "react";
import { ArrowLeft, RefreshCw, Loader2, UserPlus, UserCheck, Users, Video as VideoIcon, CheckCheck, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  useAuthor,
  useCheckAuthor,
  useUnsubscribe,
  useSubscribe,
  useMarkAllSeen,
} from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { useClientData } from "@/lib/tiktok/client-data";
import { useToast } from "@/hooks/use-toast";
import { formatCount, timeAgo, fullDate } from "@/lib/tiktok/format";
import { VideoGrid } from "./video-grid";
import { EmptyState } from "./empty-state";
import { ExternalLinkButton } from "./external-link-button";

const PAGE = 30;

export function AuthorProfile({ username }: { username: string }) {
  const { data, isLoading, isError, error } = useAuthor(username);
  const check = useCheckAuthor();
  const unsubscribe = useUnsubscribe();
  const subscribe = useSubscribe();
  const markAllSeen = useMarkAllSeen();
  const { closeAuthor, t, lang, dataMode } = useView();
  const clientIsSeen = useClientData((s) => s.isSeen);
  const clientMarkAllSeen = useClientData((s) => s.markSeen);
  const clientSubs = useClientData((s) => s.subscriptions);
  const { toast } = useToast();
  const [loadingMore, setLoadingMore] = useState(false);
  const [olderOffset, setOlderOffset] = useState(0);
  const [noMoreOlder, setNoMoreOlder] = useState(false);

  async function handleCheck(offset = 0) {
    try {
      const res = await check.mutateAsync({ username, limit: PAGE, offset });
      if (offset === 0) {
        toast({
          title: "OK",
          description:
            res.newVideos > 0
              ? `${res.newVideos} ${t("feed.found", { n: res.newVideos })}`
              : t("feed.empty.title"),
        });
      } else {
        // Loading older: track if there are more.
        if (res.totalChecked < PAGE) setNoMoreOlder(true);
        setOlderOffset((o) => o + res.totalChecked);
      }
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: t("sub.dialog.fail"),
        description: e?.message ?? "",
      });
    }
  }

  async function handleLoadOlder() {
    if (!data || loadingMore || noMoreOlder) return;
    setLoadingMore(true);
    const offset = PAGE + olderOffset;
    await handleCheck(offset);
    setLoadingMore(false);
  }

  async function handleMarkAllSeen() {
    if (dataMode === "client") {
      // Client mode: mark all videos as seen in localStorage
      if (data) {
        let count = 0;
        for (const v of data.videos) {
          if (!clientIsSeen(v.id)) {
            clientMarkAllSeen(v.id);
            count++;
          }
        }
        toast({ description: t("author.markAllSeen.done", { n: count }) });
      }
      return;
    }
    try {
      const res = await markAllSeen.mutateAsync(username);
      toast({ description: t("author.markAllSeen.done", { n: res.marked }) });
    } catch (e: any) {
      toast({ variant: "destructive", description: e?.message ?? "" });
    }
  }

  async function handleToggleSub() {
    if (!data) return;
    if (dataMode === "client") {
      // Client mode: subscribe/unsubscribe via localStorage
      const clientSubs = useClientData.getState().subscriptions;
      const isSubbed = clientSubs.some((s) => s.username === data.author.username);
      if (isSubbed) {
        useClientData.getState().unsubscribe(data.author.username);
        toast({ description: t("subs.unsubscribe") });
      } else {
        useClientData.getState().subscribe({
          username: data.author.username,
          displayName: data.author.displayName,
          avatarUrl: data.author.avatarUrl,
          description: data.author.description,
          followerCount: data.author.followerCount,
          subscribedAt: Date.now(),
        });
        toast({ description: t("sub.dialog.success") });
      }
      return;
    }
    if (data.author.subscribed) {
      if (confirm(t("subs.unsubscribe"))) {
        await unsubscribe.mutateAsync(data.author.id);
      }
    } else {
      await subscribe.mutateAsync(username);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-5">
        <BackButton onBack={closeAuthor} t={t} />
        <div className="flex gap-4">
          <div className="size-20 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="video-portrait w-full animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-5">
        <BackButton onBack={closeAuthor} t={t} />
        <EmptyState
          icon={<Users className="size-7" />}
          title={t("author.notFound.title")}
          description={error?.message ?? t("author.notFound.desc")}
          action={
            <Button size="sm" className="gap-2" onClick={() => handleCheck()}>
              <UserPlus className="size-4" /> {t("author.notFound.cta")}
            </Button>
          }
        />
      </div>
    );
  }

  const { author, videos } = data;
  // In client mode, check seen-state from localStorage; otherwise from API.
  const hasUnseen = dataMode === "client"
    ? videos.some((v) => !clientIsSeen(v.id))
    : videos.some((v) => !v.seen);
  // In client mode, check subscription from localStorage.
  const isSubscribed = dataMode === "client"
    ? clientSubs.some((s) => s.username === author?.username)
    : author?.subscribed;

  return (
    <div className="space-y-5">
      <BackButton onBack={closeAuthor} t={t} />

      {/* Profile header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar className="size-20 border-2 border-border/60 sm:size-24">
          <AvatarImage src={author.avatarUrl ?? undefined} />
          <AvatarFallback className="text-2xl">
            {(author.displayName ?? author.username).slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{author.displayName ?? author.username}</h1>
            {isSubscribed ? (
              <Badge className="gap-1 bg-primary text-primary-foreground">
                <UserCheck className="size-3" /> {t("author.subscribed")}
              </Badge>
            ) : (
              <Badge variant="outline">{t("author.notSubscribed")}</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">@{author.username}</span>
            {author.followerCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" />
                <span className="font-semibold text-foreground">{formatCount(author.followerCount)}</span>
                {t("author.followers")}
              </span>
            )}
            {(author.followingCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="font-semibold text-foreground">{formatCount(author.followingCount ?? 0)}</span>
                {t("author.following")}
              </span>
            )}
            {(author.heartCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1">
                <Heart className="size-3.5" />
                <span className="font-semibold text-foreground">{formatCount(author.heartCount ?? 0)}</span>
                {t("author.likes")}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <VideoIcon className="size-3.5" />
              <span className="font-semibold text-foreground">{videos.length}</span>
              {t("author.videos")}
            </span>
            {author.lastCheckedAt && (
              <span title={fullDate(author.lastCheckedAt)}>
                {t("author.updated", { ago: timeAgo(author.lastCheckedAt, lang) })}
              </span>
            )}
          </div>
          {author.description && (
            <p className="max-w-2xl text-sm leading-relaxed text-foreground/90">{author.description}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => handleCheck()}
            disabled={check.isPending}
          >
            {check.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {t("author.check")}
          </Button>
          {hasUnseen && isSubscribed && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleMarkAllSeen}
              disabled={markAllSeen.isPending}
            >
              <CheckCheck className="size-4" /> {t("author.markAllSeen")}
            </Button>
          )}
          {isSubscribed ? (
            <Button variant="outline" size="sm" className="gap-2" onClick={handleToggleSub} disabled={unsubscribe.isPending}>
              <UserCheck className="size-4" /> {t("subs.unsubscribe")}
            </Button>
          ) : (
            <Button size="sm" className="gap-2" onClick={handleToggleSub} disabled={subscribe.isPending}>
              {subscribe.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              {t("subs.subscribe")}
            </Button>
          )}
          <ExternalLinkButton href={`https://www.tiktok.com/@${author.username}`}>
            <Button variant="ghost" size="sm" className="gap-2">
              {t("author.openOriginal")}
            </Button>
          </ExternalLinkButton>
        </div>
      </div>

      {/* Videos */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("author.videos")}
        </h2>
        {videos.length === 0 ? (
          <EmptyState
            icon={<VideoIcon className="size-7" />}
            title={t("search.notFound.videos")}
            description={t("feed.empty.desc")}
          />
        ) : (
          <>
            <VideoGrid videos={videos} showAuthor={false} showSeen />
            {/* Load older videos */}
            {!noMoreOlder && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleLoadOlder}
                  disabled={loadingMore}
                >
                  {loadingMore ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  {t("author.loadOlder")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BackButton({ onBack, t }: { onBack: () => void; t: (k: string) => string }) {
  return (
    <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={onBack}>
      <ArrowLeft className="size-4" /> {t("author.back")}
    </Button>
  );
}
