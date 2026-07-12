"use client";

import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Play, Eye, Heart, MessageCircle, CheckCircle2, Images } from "lucide-react";
import type { VideoInfo } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { formatCount, formatDuration, timeAgo } from "@/lib/tiktok/format";
import { cn } from "@/lib/utils";

interface Props {
  video: VideoInfo;
  showAuthor?: boolean;
  showSeen?: boolean;
}

export function VideoCard({ video, showAuthor = true, showSeen = false }: Props) {
  const openVideo = useView((s) => s.openVideo);
  const openAuthor = useView((s) => s.openAuthor);
  const t = useView((s) => s.t);
  const lang = useView((s) => s.lang);

  const author = video.author;
  const seen = !!video.seen;
  const isGallery = !!video.isGallery;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => openVideo(video.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openVideo(video.id);
        }
      }}
      className={cn(
        "group relative overflow-hidden p-0 cursor-pointer border-border/60 bg-card transition-all",
        "hover:ring-2 hover:ring-primary/60 hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary",
      )}
    >
      {/* Thumbnail */}
      <div className="video-portrait relative w-full overflow-hidden bg-muted">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title ?? "TikTok video"}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <Play className="size-10 opacity-40" />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10 opacity-90" />
        <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100">
          <div className="rounded-full bg-primary/90 p-3 text-primary-foreground shadow-lg">
            <Play className="size-5 fill-current" />
          </div>
        </div>

        {/* duration / gallery badge */}
        {!isGallery ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {formatDuration(video.duration)}
          </span>
        ) : (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
            <Images className="size-3" /> {video.images?.length ?? 0}
          </span>
        )}

        {/* seen / new badge */}
        {showSeen &&
          (seen ? (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white/90">
              <CheckCircle2 className="size-3" /> {t("video.watched")}
            </span>
          ) : (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
              {t("video.new")}
            </span>
          ))}
      </div>

      {/* meta */}
      <div className="space-y-2 p-3">
        {showAuthor && author && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openAuthor(author.username);
            }}
            className="flex w-full items-center gap-2 text-left"
          >
            <Avatar className="size-6 border border-border/50">
              <AvatarImage src={author.avatarUrl ?? undefined} />
              <AvatarFallback className="text-[10px]">
                {(author.displayName ?? author.username).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-xs font-medium text-foreground/90 hover:text-primary">
              @{author.username}
            </span>
          </button>
        )}
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {video.title || t("video.untitled")}
        </p>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3" /> {formatCount(video.viewCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3" /> {formatCount(video.likeCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="size-3" /> {formatCount(video.commentCount)}
          </span>
          {video.publishedAt && (
            <span className="ml-auto whitespace-nowrap">{timeAgo(video.publishedAt, lang)}</span>
          )}
        </div>
      </div>
    </Card>
  );
}
