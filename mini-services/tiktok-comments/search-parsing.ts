export type SearchKind = "all" | "author" | "video";

export interface SearchAuthor {
  kind: "author";
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  description: string | null;
  followerCount: number;
}

export interface SearchVideo {
  kind: "video";
  tiktokId: string;
  url: string;
  title: string | null;
  thumbnailUrl: string | null;
  duration: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  authorUsername: string;
}

export type SearchResult = SearchAuthor | SearchVideo;

export const MAX_SEARCH_RESULTS = 24;

export function firstString(...values: any[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

export function asCount(value: any): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

export function imageUrl(value: any): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const candidates = value.url_list ?? value.urlList ?? value.urls;
  if (Array.isArray(candidates) && typeof candidates[0] === "string") return candidates[0];
  return firstString(value.url, value.uri);
}

export function parseSearchAuthor(value: any): SearchAuthor | null {
  if (!value || typeof value !== "object") return null;
  const user = value.user_info?.user ?? value.user_info ?? value.userInfo?.user ?? value.userInfo ?? value.user ?? value;
  if (!user || typeof user !== "object") return null;
  const username = firstString(user.uniqueId, user.unique_id, user.username, user.handle);
  if (!username || !/^[a-z0-9._]{1,24}$/i.test(username)) return null;
  const stats = value.stats ?? value.user_info?.stats ?? value.userInfo?.stats ?? user.stats ?? {};
  return {
    kind: "author",
    username,
    displayName: firstString(user.nickname, user.displayName, user.display_name),
    avatarUrl: imageUrl(user.avatarLarger ?? user.avatar_medium ?? user.avatarMedium ?? user.avatar_thumb ?? user.avatarThumb),
    description: firstString(user.signature, user.description, user.bio),
    followerCount: asCount(stats.followerCount ?? stats.follower_count ?? stats.followers),
  };
}

export function parseSearchVideo(value: any): SearchVideo | null {
  if (!value || typeof value !== "object") return null;
  const item = value.itemStruct ?? value.aweme_info ?? value.awemeInfo ?? value.item ?? value;
  if (!item || typeof item !== "object") return null;
  const id = firstString(item.id, item.aweme_id, item.awemeId, item.item_id);
  const author = item.author ?? item.user ?? item.author_info ?? item.authorInfo ?? {};
  const username = firstString(author.uniqueId, author.unique_id, author.username, author.handle);
  if (!id || !/^\d+$/.test(id) || !username || !/^[a-z0-9._]{1,24}$/i.test(username)) return null;
  const video = item.video ?? {};
  const stats = item.stats ?? item.statistics ?? {};
  return {
    kind: "video",
    tiktokId: id,
    url: `https://www.tiktok.com/@${username}/video/${id}`,
    title: firstString(item.desc, item.description, item.title)?.slice(0, 1000) ?? null,
    thumbnailUrl: imageUrl(video.cover ?? video.dynamicCover ?? video.originCover ?? item.cover),
    duration: asCount(video.duration ?? item.duration),
    viewCount: asCount(stats.playCount ?? stats.play_count ?? stats.viewCount ?? stats.views),
    likeCount: asCount(stats.diggCount ?? stats.digg_count ?? stats.likeCount ?? stats.likes),
    commentCount: asCount(stats.commentCount ?? stats.comment_count ?? stats.comments),
    authorUsername: username,
  };
}

export const SEARCH_CHILD_KEYS = new Set([
  "data", "item_list", "itemList", "user_list", "userList", "aweme_list", "awemeList",
  "items", "results", "result", "body", "module_list", "moduleList", "cards",
  "search_result", "searchResult", "item", "itemStruct", "aweme_info", "awemeInfo",
  "user", "user_info", "userInfo", "users", "videos",
]);

/** Walk only known result/list fields with strict depth and node bounds. */
export function collectSearchResults(
  payload: any,
  endpointKind: "general" | "item" | "user",
  kind: SearchKind,
): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  const queue: Array<{ value: any; depth: number }> = [{ value: payload, depth: 0 }];
  let visited = 0;

  const add = (result: SearchResult | null) => {
    if (!result || results.length >= MAX_SEARCH_RESULTS) return;
    const key = result.kind === "author"
      ? `author:${result.username.toLowerCase()}`
      : `video:${result.tiktokId}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(result);
  };

  while (queue.length && visited < 4000 && results.length < MAX_SEARCH_RESULTS) {
    const { value, depth } = queue.shift()!;
    visited++;
    if (Array.isArray(value)) {
      for (const child of value.slice(0, 500)) queue.push({ value: child, depth });
      continue;
    }
    if (!value || typeof value !== "object" || depth > 8) continue;

    const resultType = String(value.type ?? value.item_type ?? value.card_type ?? "").toLowerCase();
    const isUserResult = /user|account|creator/.test(resultType);
    if (kind !== "author" && endpointKind !== "user") {
      add(parseSearchVideo(value));
    }
    if (kind !== "video" && (endpointKind === "user" || isUserResult)) {
      add(parseSearchAuthor(value));
    }

    if (depth >= 8) continue;
    for (const [key, child] of Object.entries(value)) {
      if (SEARCH_CHILD_KEYS.has(key)) queue.push({ value: child, depth: depth + 1 });
    }
  }
  return results;
}
