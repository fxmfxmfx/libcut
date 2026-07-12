/**
 * Shared types for the TikTok parser module.
 */

export interface AuthorProfile {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  description: string | null;
  followerCount: number;
  followingCount: number;
  heartCount: number;
  videoCount: number;
}

export interface AuthorVideo {
  tiktokId: string;
  url: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  duration: number;
  width: number;
  height: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  publishedAt: Date | null;
  /// Photo carousel / image post (swipeable slides) instead of a video.
  isGallery?: boolean;
  /// Image URLs for a gallery post.
  images?: string[];
}

export interface VideoMeta extends AuthorVideo {
  authorUsername: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  streamUrl: string | null;
}

export interface VideoComment {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  text: string;
  likeCount: number;
  postedAt: Date | null;
}

export interface SearchResult {
  kind: "author" | "video";
  // author fields
  username?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  description?: string | null;
  followerCount?: number;
  // video fields
  video?: AuthorVideo & { authorUsername: string };
}

/**
 * Unified interface implemented by both the real (yt-dlp) and demo providers.
 */
export interface TikTokProvider {
  /** Fetch a creator's profile (handle without @). */
  getAuthorProfile(username: string): Promise<AuthorProfile>;
  /** Fetch the list of videos for a creator (most recent first). Supports offset for pagination. */
  getAuthorVideos(username: string, limit?: number, offset?: number): Promise<AuthorVideo[]>;
  /** Fetch full metadata for a single video by URL. */
  getVideoMeta(videoUrl: string): Promise<VideoMeta>;
  /** Fetch comments for a single video by URL. */
  getComments(videoUrl: string): Promise<VideoComment[]>;
  /** Download a video file to the given destination path. */
  downloadVideo(videoUrl: string, destPath: string): Promise<void>;
  /** Search TikTok for authors / videos. */
  search(query: string, kind: "all" | "author" | "video"): Promise<SearchResult[]>;
}

export class TikTokError extends Error {
  constructor(
    message: string,
    public code: "network" | "not_found" | "blocked" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "TikTokError";
  }
}
