import { describe, expect, test } from "bun:test";
import { collectSearchResults, MAX_SEARCH_RESULTS } from "./search-parsing";

describe("collectSearchResults", () => {
  test("parses TikTok general search data item wrappers", () => {
    const results = collectSearchResults({
      data: [{
        type: 1,
        item: {
          id: "7340000000000000001",
          desc: "A search result",
          author: { unique_id: "creator_one" },
          video: { duration: 18, cover: { url_list: ["https://cdn.test/cover.jpg"] } },
          stats: { play_count: 1234, digg_count: 56, comment_count: 7 },
        },
      }],
    }, "general", "all");

    expect(results).toEqual([{
      kind: "video",
      tiktokId: "7340000000000000001",
      url: "https://www.tiktok.com/@creator_one/video/7340000000000000001",
      title: "A search result",
      thumbnailUrl: "https://cdn.test/cover.jpg",
      duration: 18,
      viewCount: 1234,
      likeCount: 56,
      commentCount: 7,
      authorUsername: "creator_one",
    }]);
  });

  test("parses user_list/user_info fields and sibling stats", () => {
    const results = collectSearchResults({
      user_list: [{
        type: "user",
        user_info: {
          unique_id: "creator.two",
          nickname: "Creator Two",
          signature: "Short bio",
          avatar_thumb: { url_list: ["https://cdn.test/avatar.jpg"] },
        },
        stats: { follower_count: 9821 },
      }],
    }, "user", "author");

    expect(results).toEqual([{
      kind: "author",
      username: "creator.two",
      displayName: "Creator Two",
      avatarUrl: "https://cdn.test/avatar.jpg",
      description: "Short bio",
      followerCount: 9821,
    }]);
  });

  test("parses camel-case item lists and deduplicates repeated videos", () => {
    const item = {
      awemeInfo: {
        awemeId: "1234567890",
        description: "Camel case result",
        authorInfo: { uniqueId: "camel.author" },
        video: { duration: 9, dynamicCover: "https://cdn.test/camel.jpg" },
        statistics: { views: 99, likes: 8, comments: 3 },
      },
    };
    const results = collectSearchResults({ itemList: [item, item] }, "item", "video");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kind: "video",
      tiktokId: "1234567890",
      title: "Camel case result",
      thumbnailUrl: "https://cdn.test/camel.jpg",
      viewCount: 99,
      likeCount: 8,
      commentCount: 3,
    });
  });

  test("filters requested result kinds and deduplicates authors case-insensitively", () => {
    const payload = {
      data: [
        { type: 1, item: { id: "10", author: { unique_id: "same" } } },
        { type: 1, item: { id: "10", author: { unique_id: "same" } } },
        { type: "user", user_info: { unique_id: "Creator", nickname: "First" } },
        { type: "user", user_info: { unique_id: "creator", nickname: "Duplicate" } },
      ],
    };

    expect(collectSearchResults(payload, "general", "video").map((result) => result.kind)).toEqual(["video"]);
    const authors = collectSearchResults(payload, "general", "author");
    expect(authors).toHaveLength(1);
    expect(authors[0]).toMatchObject({ kind: "author", username: "Creator", displayName: "First" });
  });

  test("ignores malformed and over-nested data and caps result count", () => {
    const videos = Array.from({ length: MAX_SEARCH_RESULTS + 10 }, (_, index) => ({
      type: 1,
      item: { id: String(1000 + index), author: { unique_id: `author_${index}` } },
    }));
    videos.unshift({ type: 1, item: { id: "not-a-number", author: { unique_id: "bad" } } } as never);

    let depthBomb: any = videos;
    for (let depth = 0; depth < 10; depth++) depthBomb = { data: depthBomb };
    expect(collectSearchResults(depthBomb, "general", "video")).toHaveLength(0);

    const mixed = collectSearchResults({ data: [null, "bad", {}, ...videos] }, "general", "video");
    expect(mixed).toHaveLength(MAX_SEARCH_RESULTS);
    expect(mixed.every((result) => result.kind === "video")).toBe(true);
  });
});
