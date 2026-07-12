"use client";

import { Users, UserMinus, Loader2, Eye, Video as VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useSubscriptions, useUnsubscribe } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { formatCount, timeAgo } from "@/lib/tiktok/format";
import { EmptyState } from "./empty-state";
import { SubscribeDialog } from "./subscribe-dialog";

export function SubscriptionsView() {
  const subs = useSubscriptions();
  const unsubscribe = useUnsubscribe();
  const { openAuthor, t, lang } = useView();

  const list = subs.data?.subscriptions ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Users className="size-5 text-primary" /> {t("nav.subscriptions")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {list.length > 0 ? `${list.length}` : t("subs.desc")}
          </p>
        </div>
        <SubscribeDialog />
      </div>

      {subs.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Users className="size-7" />}
          title={t("subs.empty.title")}
          description={t("subs.empty.desc")}
          action={<SubscribeDialog />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <Card key={a.id} className="group relative p-4 transition-colors hover:border-primary/40">
              <button
                onClick={() => openAuthor(a.username)}
                className="flex w-full items-start gap-3 text-left"
              >
                <Avatar className="size-12 border border-border/50">
                  <AvatarImage src={a.avatarUrl ?? undefined} />
                  <AvatarFallback>{(a.displayName ?? a.username).slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{a.displayName ?? a.username}</span>
                    {a.unseenCount > 0 && (
                      <Badge className="bg-primary text-primary-foreground">
                        {a.unseenCount} {t("subs.unseen")}
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">@{a.username}</div>
                  {a.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3" /> {formatCount(a.followerCount)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <VideoIcon className="size-3" /> {a.storedVideoCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="size-3" /> {a.unseenCount}
                    </span>
                    {a.lastCheckedAt && <span>{timeAgo(a.lastCheckedAt, lang)}</span>}
                  </div>
                </div>
              </button>
              <div className="mt-3 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-destructive"
                  disabled={unsubscribe.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`${t("subs.unsubscribe")} @${a.username}?`)) {
                      unsubscribe.mutate(a.id);
                    }
                  }}
                >
                  {unsubscribe.isPending && unsubscribe.variables === a.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <UserMinus className="size-3.5" />
                  )}
                  {t("subs.unsubscribe")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
