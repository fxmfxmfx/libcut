/**
 * Demo data seeder.
 *
 * On first run (when the DB has no subscriptions yet), seed a few demo authors
 * + their videos + comments so the feed, subscriptions and favorites tabs are
 * immediately explorable. Marks a couple of the oldest videos as "seen" so the
 * feed visibly shows only unseen ones.
 *
 * Only runs when `DEMO_MODE=true`. Idempotent.
 */

import { db } from "@/lib/db";
import { demoDataset } from "./demo";
import { tiktokProvider } from "./index";

export async function seedDemoData(): Promise<void> {
  const existing = await db.author.count();
  if (existing > 0) return;

  // Subscribe to the first 3 demo authors.
  const toSubscribe = demoDataset.authors.slice(0, 3);

  for (let ai = 0; ai < toSubscribe.length; ai++) {
    const { profile, videos } = toSubscribe[ai];
    const author = await db.author.create({
      data: {
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        description: profile.description,
        followerCount: profile.followerCount,
        videoCount: profile.videoCount,
        subscribed: true,
        lastCheckedAt: new Date(),
      },
    });

    // Insert videos (newest first in source -> mark the oldest as seen).
    for (let vi = 0; vi < videos.length; vi++) {
      const v = videos[vi];
      const seen = vi >= videos.length - 2; // last two (oldest) are "seen"
      const created = await db.video.create({
        data: {
          tiktokId: v.tiktokId,
          authorId: author.id,
          url: v.url,
          title: v.title,
          description: v.description,
          thumbnailUrl: v.thumbnailUrl,
          duration: v.duration,
          width: v.width,
          height: v.height,
          viewCount: v.viewCount,
          likeCount: v.likeCount,
          commentCount: v.commentCount,
          shareCount: v.shareCount,
          publishedAt: v.publishedAt,
          discoveredAt: new Date(v.publishedAt?.getTime() ?? Date.now()),
          seen,
          seenAt: seen ? new Date() : null,
        },
      });

      // Seed a few comments for the most recent videos.
      if (vi < 3) {
        try {
          const comments = await tiktokProvider.getComments(v.url);
          if (comments.length) {
            await db.comment.createMany({
              data: comments.slice(0, 6).map((c) => ({
                videoId: created.id,
                authorName: c.authorName,
                authorAvatar: c.authorAvatar,
                text: c.text,
                likeCount: c.likeCount,
                postedAt: c.postedAt,
              })),
            });
          }
        } catch {
          // ignore comment fetch failures during seed
        }
      }
    }
  }
}
