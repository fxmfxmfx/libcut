"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

const api = {
  get: async <T>(url: string): Promise<T> => {
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${r.status}`);
    }
    return r.json() as Promise<T>;
  },
  post: async <T>(url: string, body?: unknown): Promise<T> => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      throw new Error(b.error || `HTTP ${r.status}`);
    }
    return r.json() as Promise<T>;
  },
  del: async <T>(url: string): Promise<T> => {
    const r = await fetch(url, { method: "DELETE" });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      throw new Error(b.error || `HTTP ${r.status}`);
    }
    return r.json() as Promise<T>;
  },
  patch: async <T>(url: string, body?: unknown): Promise<T> => {
    const r = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      throw new Error(b.error || `HTTP ${r.status}`);
    }
    return r.json() as Promise<T>;
  },
};

import { useView } from "./store";
import { useClientData } from "./client-data";

// ---- Types ----
export interface StatusInfo {
  demoMode: boolean;
  proxyConfigured: boolean;
  cacheTtlMin: number;
  ytdlpPath: string;
  dataMode: "local" | "client";
}

export interface AuthorInfo {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  description: string | null;
  followerCount: number;
  followingCount?: number;
  heartCount?: number;
  videoCount?: number;
  storedVideoCount?: number;
  unseenCount?: number;
  subscribed?: boolean;
  lastCheckedAt?: string | null;
}

export interface VideoInfo {
  id: string;
  tiktokId: string;
  url: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  duration: number;
  width?: number;
  height?: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount?: number;
  publishedAt: string | null;
  seen?: boolean;
  cached?: boolean;
  streamUrl?: string | null;
  isFavorited?: boolean;
  streamSrc?: string;
  downloadSrc?: string;
  favoritedAt?: string;
  isGallery?: boolean;
  images?: string[] | null;
  author?: AuthorInfo;
}

export interface CommentInfo {
  id: string;
  tiktokCid: string | null;
  authorName: string;
  authorAvatar: string | null;
  text: string;
  likeCount: number;
  postedAt: string | null;
  parentId: string | null;
  replyCount: number;
}

// ---- Queries ----
export function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: () => api.get<StatusInfo>("/api/tiktok/status"),
    staleTime: 60_000,
  });
}

export function useProxyCheck(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["proxy-check"],
    queryFn: () => api.get<{ ok: boolean; proxy: string | null; error: string | null }>("/api/tiktok/proxy-check"),
    staleTime: 60_000,
    retry: false,
  });
}

export function useFeed() {
  const enabled = useView((s) => s.modeReady && s.dataMode === "local");
  return useQuery({
    enabled,
    queryKey: ["feed"],
    queryFn: () => api.get<{ videos: VideoInfo[] }>("/api/tiktok/feed?limit=100"),
  });
}

export function useSubscriptions() {
  const enabled = useView((s) => s.modeReady && s.dataMode === "local");
  return useQuery({
    enabled,
    queryKey: ["subscriptions"],
    queryFn: () => api.get<{ subscriptions: (AuthorInfo & { unseenCount: number; storedVideoCount: number })[] }>(
      "/api/tiktok/subscriptions",
    ),
  });
}

export function useFavorites() {
  const enabled = useView((s) => s.modeReady && s.dataMode === "local");
  return useQuery({
    enabled,
    queryKey: ["favorites"],
    queryFn: () => api.get<{ favorites: VideoInfo[] }>("/api/tiktok/favorites"),
  });
}

export function useAuthor(username: string | null) {
  return useQuery({
    queryKey: ["author", username],
    queryFn: () => api.get<{ author: AuthorInfo; videos: VideoInfo[]; refreshError?: string | null }>(`/api/tiktok/authors/${encodeURIComponent(username!)}`),
    enabled: !!username,
  });
}

export function useVideo(id: string | null) {
  const source = useView((s) => s.openVideoSource);
  const dataMode = useView((s) => s.dataMode);
  return useQuery({
    queryKey: ["video", id],
    queryFn: () => {
      const favorite = dataMode === "client" ? useClientData.getState().favorites.find((f) => f.tiktokId === id || f.videoId === id) : undefined;
      const lookupId = favorite?.tiktokId ?? source?.tiktokId ?? id;
      const url = favorite?.url ?? source?.url;
      const suffix = url ? `?url=${encodeURIComponent(url)}` : "";
      return api.get<{ video: VideoInfo; author: AuthorInfo }>(`/api/tiktok/videos/${lookupId}${suffix}`);
    },
    enabled: !!id,
  });
}

export function useComments(id: string | null, enabled = true) {
  return useQuery({
    queryKey: ["comments", id],
    queryFn: () => api.get<{ comments: CommentInfo[]; commentCount: number; error?: string }>(
      `/api/tiktok/videos/${id}/comments`,
    ),
    enabled: !!id && enabled,
  });
}

export function useSearch(query: string, kind: "all" | "author" | "video") {
  const dataMode = useView((s) => s.dataMode);
  const subscriptions = useClientData((s) => s.subscriptions);
  const favorites = useClientData((s) => s.favorites);
  const qc = useQueryClient();
  const clientFeed = useQuery<{ videos: VideoInfo[] }>({
    queryKey: ["client-feed", subscriptions.map((s) => s.username).sort()],
    enabled: false,
  });
  const request = (source: string, signal: AbortSignal) => fetch(`/api/tiktok/search?q=${encodeURIComponent(query)}&kind=${kind}&source=${source}`, { signal }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data as { results: any[]; liveError: string | null };
  });
  const library = useQuery({
    queryKey: ["search", query, kind, "library"],
    queryFn: ({ signal }) => request("library", signal),
    enabled: dataMode === "local" && query.trim().length > 0,
  });
  const live = useQuery({
    queryKey: ["search", query, kind, "live"],
    queryFn: ({ signal }) => request("live", signal),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
    retry: false,
  });
  const q = query.toLowerCase().replace(/^@/, "");
  const clientResults: any[] = [];
  if (dataMode === "client" && q) {
    if (kind !== "video") clientResults.push(...subscriptions.filter((s) => `${s.username} ${s.displayName ?? ""}`.toLowerCase().includes(q)).map((s) => ({ ...s, kind: "author", source: "library", subscribed: true })));
    if (kind !== "author") {
      const known = [...(clientFeed.data?.videos ?? []), ...subscriptions.flatMap((sub) => {
        const author = qc.getQueryData<{ author: AuthorInfo; videos: VideoInfo[] }>(["author", sub.username]);
        return (author?.videos ?? []).map((v) => ({ ...v, author: author!.author }));
      })];
      clientResults.push(...known.filter((v) => `${v.title ?? ""} ${v.description ?? ""} ${v.author?.username ?? ""} ${v.url}`.toLowerCase().includes(q)).map((v) => ({ ...v, kind: "video", source: "library" })));
    }
    if (kind !== "author") clientResults.push(...favorites.filter((f) => `${f.title ?? ""} ${f.authorUsername} ${f.description ?? ""} ${f.url}`.toLowerCase().includes(q)).map((f) => ({
      ...f, id: f.videoId, kind: "video", source: "library", author: { id: "", username: f.authorUsername, displayName: f.authorDisplayName, avatarUrl: f.authorAvatarUrl },
      viewCount: f.viewCount ?? 0, likeCount: f.likeCount ?? 0, commentCount: f.commentCount ?? 0, publishedAt: f.publishedAt ?? null,
    })));
  }
  const unique = new Map<string, any>();
  for (const r of [...(dataMode === "local" ? library.data?.results ?? [] : clientResults), ...(live.data?.results ?? [])]) {
    const key = r.kind === "author" ? `author:${r.username}` : `video:${r.tiktokId}`;
    if (!unique.has(key)) unique.set(key, r);
  }
  return {
    data: { results: [...unique.values()], liveError: live.data?.liveError ?? live.error?.message ?? library.error?.message ?? null },
    isLoading: (library.isLoading || live.isLoading) && unique.size === 0,
    isFetching: library.isFetching || live.isFetching,
    refetch: () => { void library.refetch(); void live.refetch(); },
  };
}

// ---- Mutations ----
export function useSubscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) =>
      api.post<{ author: { id: string; username: string }; storedVideos: number }>("/api/tiktok/subscriptions", {
        username,
      }),
    onSuccess: (_d, username) => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["author", username] });
    },
  });
}

export function useUnsubscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/tiktok/subscriptions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["author"] });
    },
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, fav }: { id: string; fav: boolean }) => {
      if (fav) return api.post(`/api/tiktok/videos/${id}/favorite`);
      return api.del(`/api/tiktok/videos/${id}/favorite`);
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["favorites"] });
      qc.invalidateQueries({ queryKey: ["search"] });
      qc.invalidateQueries({ queryKey: ["video"] });
      qc.invalidateQueries({ queryKey: ["author"] });
    },
  });
}

export function useMarkSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, seen }: { id: string; seen: boolean }) =>
      api.patch(`/api/tiktok/videos/${id}`, { seen }),
    onSuccess: (_d, { id, seen }) => {
      qc.setQueryData<{ video: VideoInfo; author: AuthorInfo }>(["video", id], (old) =>
        old ? { ...old, video: { ...old.video, seen } } : old,
      );
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["author"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["favorites"] });
      qc.invalidateQueries({ queryKey: ["search"] });
      qc.invalidateQueries({ queryKey: ["video"] });
    },
  });
}

export function useRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ totalNew: number; checkedAuthors: number }>("/api/tiktok/refresh"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}

export function useCheckAuthor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, limit, offset }: { username: string; limit?: number; offset?: number }) =>
      api.post<{ newVideos: number; totalChecked: number; authorId: string; offset: number }>(
        `/api/tiktok/authors/${encodeURIComponent(username)}/check?limit=${limit ?? 30}&offset=${offset ?? 0}`,
      ),
    onSuccess: (_d, { username }) => {
      qc.invalidateQueries({ queryKey: ["author", username] });
      qc.invalidateQueries({ queryKey: ["client-feed"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}

export function useMarkAllSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) =>
      api.post<{ ok: boolean; marked: number }>(
        `/api/tiktok/authors/${encodeURIComponent(username)}/mark-seen`,
      ),
    onSuccess: (_d, username) => {
      qc.invalidateQueries({ queryKey: ["video"] });
      qc.invalidateQueries({ queryKey: ["author", username] });
      qc.invalidateQueries({ queryKey: ["client-feed"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}

export interface AppSettings {
  proxyEnabled: string;
  proxyUrl: string;
  language: string;
  theme: string;
  accent: string;
  customCss: string;
  autoMarkSeen: string;
}
export function useSettings() {
  const enabled = useView((s) => s.modeReady && s.dataMode === "local");
  return useQuery({
    enabled,
    queryKey: ["settings"],
    queryFn: () =>
      api.get<{ settings: AppSettings; envProxy: string | null; demoMode: boolean }>("/api/tiktok/settings"),
    staleTime: 30_000,
  });
}
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) =>
      api.patch<{ ok: boolean }>("/api/tiktok/settings", patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
