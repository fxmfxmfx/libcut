"use client";

import type { VideoInfo } from "@/lib/tiktok/queries";
import { VideoCard } from "./video-card";

interface Props {
  videos: VideoInfo[];
  showAuthor?: boolean;
  showSeen?: boolean;
}

export function VideoGrid({ videos, showAuthor = true, showSeen = false }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {videos.map((v) => (
        <VideoCard key={v.id} video={v} showAuthor={showAuthor} showSeen={showSeen} />
      ))}
    </div>
  );
}
