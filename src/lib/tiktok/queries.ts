"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
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

// ---- Types ----
export interface StatusInfo {
  demoMode: boolean;
  proxyConfigured: boolean;
  cacheTtlMin: number;
  ytdlpPath: string;
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

export function useFeed() {
  return useQuery({
    queryKey: ["feed"],
    queryFn: () => api.get<{ videos: VideoInfo[] }>("/api/tiktok/feed?limit=100"),
  });
}

export function useSubscriptions() {
  return useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => api.get<{ subscriptions: (AuthorInfo & { unseenCount: number; storedVideoCount: number })[] }>(
      "/api/tiktok/subscriptions",
    ),
  });
}

export function useFavorites() {
  return useQuery({
    queryKey: ["favorites"],
    queryFn: () => api.get<{ favorites: VideoInfo[] }>("/api/tiktok/favorites"),
  });
}

export function useAuthor(username: string | null) {
  return useQuery({
    queryKey: ["author", username],
    queryFn: () => api.get<{ author: AuthorInfo; videos: VideoInfo[] }>(`/api/tiktok/authors/${encodeURIComponent(username!)}`),
    enabled: !!username,
  });
}

export function useVideo(id: string | null) {
  return useQuery({
    queryKey: ["video", id],
    queryFn: () => api.get<{ video: VideoInfo; author: AuthorInfo }>(`/api/tiktok/videos/${id}`),
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
  return useQuery({
    queryKey: ["search", query, kind],
    queryFn: () =>
      api.get<{ results: any[]; liveError: string | null }>(
      `/api/tiktok/search?q=${encodeURIComponent(query)}&kind=${kind}`,
    ),
    enabled: query.trim().length > 0,
    placeholderData: keepPreviousData,
  });
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
      qc.invalidateQueries({ queryKey: ["video", id] });
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
      if (seen) qc.invalidateQueries({ queryKey: ["feed"] });
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
      qc.invalidateQueries({ queryKey: ["author", username] });
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
  return useQuery({
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
