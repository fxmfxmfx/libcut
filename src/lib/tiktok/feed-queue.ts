import type { VideoInfo } from "./queries";

/** Keep the viewing session stable when seen videos leave the unread query. */
export function mergeFeedQueue(current: VideoInfo[], incoming: VideoInfo[]): VideoInfo[] {
  const updates = new Map(incoming.map((video) => [video.tiktokId, video]));
  const known = new Set<string>();
  const result: VideoInfo[] = [];
  for (const video of [...current, ...incoming]) {
    if (known.has(video.tiktokId)) continue;
    known.add(video.tiktokId);
    result.push(updates.get(video.tiktokId) ?? video);
  }
  return result;
}
