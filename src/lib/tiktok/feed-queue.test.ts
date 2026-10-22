import { describe, expect, test } from "bun:test";
import type { VideoInfo } from "./queries";
import { mergeFeedQueue } from "./feed-queue";

function video(tiktokId: string, title = tiktokId, viewCount = 1): VideoInfo {
  return {
    id: `db-${tiktokId}`,
    tiktokId,
    url: `https://www.tiktok.com/@creator/video/${tiktokId}`,
    title,
    description: title,
    thumbnailUrl: null,
    duration: 10,
    viewCount,
    likeCount: 0,
    commentCount: 0,
    publishedAt: null,
  };
}

describe("mergeFeedQueue", () => {
  test("keeps a video in the viewing queue after seen removes it from the source", () => {
    const watched = video("1", "watched");
    const unread = video("2", "unread");

    expect(mergeFeedQueue([watched, unread], [unread])).toEqual([watched, unread]);
  });

  test("appends new videos after the existing queue", () => {
    const first = video("1");
    const second = video("2");
    const third = video("3");

    expect(mergeFeedQueue([first, second], [second, third])).toEqual([first, second, third]);
  });

  test("updates metadata for existing videos without reordering them", () => {
    const first = video("1", "old first");
    const second = video("2", "unchanged");
    const third = video("3", "old third");
    const updatedFirst = video("1", "updated first", 100);
    const updatedThird = video("3", "updated third", 300);

    const merged = mergeFeedQueue([first, second, third], [updatedThird, updatedFirst]);

    expect(merged.map((item) => item.tiktokId)).toEqual(["1", "2", "3"]);
    expect(merged[0]).toEqual(updatedFirst);
    expect(merged[1]).toEqual(second);
    expect(merged[2]).toEqual(updatedThird);
  });

  test("deduplicates videos by TikTok ID", () => {
    const existing = video("1", "existing");
    const added = video("2", "first copy");
    const duplicateAdded = video("2", "second copy");

    const merged = mergeFeedQueue(
      [existing],
      [added, duplicateAdded, video("1", "updated existing")],
    );

    expect(merged.map((item) => item.tiktokId)).toEqual(["1", "2"]);
    expect(merged[0].title).toBe("updated existing");
  });
});
