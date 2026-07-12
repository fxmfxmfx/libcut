/**
 * Demo data provider.
 *
 * In the sandbox TikTok is unreachable (and there's no proxy configured), so
 * when `DEMO_MODE=true` we serve realistic sample data so the whole UI is
 * explorable. On the user's server with a SOCKS5 proxy + `DEMO_MODE=false`,
 * the real YtDlpProvider runs instead.
 *
 * Sample authors / videos are also seeded into the DB on first run so the
 * subscriptions, feed and favorites tabs work immediately.
 */

import {
  type AuthorProfile,
  type AuthorVideo,
  type VideoComment,
  type VideoMeta,
  type SearchResult,
  type TikTokProvider,
} from "./types";

// Local sample MP4s (generated into /public/demo-videos) — served by Next.js as
// static assets, so playback works even in sandboxes without outbound internet.
const SAMPLE_VIDEOS = [
  "/demo-videos/v0.mp4",
  "/demo-videos/v1.mp4",
  "/demo-videos/v2.mp4",
  "/demo-videos/v3.mp4",
  "/demo-videos/v4.mp4",
  "/demo-videos/v5.mp4",
];

/** Absolute filesystem path for a local demo sample URL (used by stream/download). */
export function demoLocalPathForUrl(sampleUrl: string): string {
  // Resolve relative to the project root (works in dev + Docker).
  const base = process.env.TIKTOK_CACHE_DIR?.replace("/cache/videos", "") || process.cwd();
  return `${base}/public${sampleUrl}`;
}

function thumb(seed: string, color = "#fe2c55"): string {
  // Inline SVG gradient thumbnail with a play glyph — fully offline.
  const c2 = shade(color, -28);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='640'>
<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
<stop offset='0' stop-color='${color}'/><stop offset='1' stop-color='${c2}'/>
</linearGradient></defs>
<rect width='480' height='640' fill='url(#g)'/>
<circle cx='240' cy='300' r='66' fill='white' fill-opacity='0.16'/>
<polygon points='218,266 218,334 276,300' fill='white' fill-opacity='0.92'/>
<rect x='0' y='560' width='480' height='80' fill='black' fill-opacity='0.25'/>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
function avatar(seed: string, color = "#fe2c55"): string {
  const initials = seed.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "TK";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
<defs><linearGradient id='a' x1='0' y1='0' x2='1' y2='1'>
<stop offset='0' stop-color='${color}'/><stop offset='1' stop-color='${shade(color, -30)}'/>
</linearGradient></defs>
<rect width='200' height='200' rx='100' fill='url(#a)'/>
<text x='100' y='118' font-family='Arial,sans-serif' font-size='72' font-weight='bold' fill='white' text-anchor='middle'>${initials}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function shade(hex: string, percent: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + (r * percent) / 100)));
  g = Math.max(0, Math.min(255, Math.round(g + (g * percent) / 100)));
  b = Math.max(0, Math.min(255, Math.round(b + (b * percent) / 100)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

interface DemoAuthorDef {
  username: string;
  displayName: string;
  description: string;
  followers: number;
  videoCount: number;
  color: string;
  theme: string[];
}

const AUTHOR_DEFS: DemoAuthorDef[] = [
  {
    username: "city.cookhouse",
    displayName: "City Cookhouse",
    description: "Fast 15-minute dinners from a tiny city kitchen. New recipe every weekday.",
    followers: 1284000,
    videoCount: 9,
    color: "#fe2c55",
    theme: [
      "15-min garlic butter shrimp pasta",
      "Crispy smashed potatoes (no deep fryer)",
      "One-pan lemon herb chicken & rice",
      "Spicy ramen hack with miso butter",
      "No-knead focaccia in a coffee mug",
      "Quick pickled red onions, 3 ways",
      "Sheet-pan honey mustard salmon",
      "5-ingredient peanut sauce noodles",
      "Cast-iron pizza in 20 minutes",
    ],
  },
  {
    username: "trail.runner.daily",
    displayName: "Trail Runner Daily",
    description: "Daily trail runs, gear reviews & sunrise motivation. Pacific Northwest.",
    followers: 642000,
    videoCount: 8,
    color: "#25f4ee",
    theme: [
      "5 AM sunrise ridge run — full POV",
      "Best trail shoes of the year (tested 12)",
      "How I fuel for a 50K ultramarathon",
      "Steep hill form: stop wasting energy",
      "Headlamp comparison for night runs",
      "Recovery routine after long miles",
      "Hidden waterfall detour you missed",
      "Rainy-day trail layering system",
    ],
  },
  {
    username: "synthwave.lab",
    displayName: "Synthwave Lab",
    description: "Making retro electronic music with hardware synths. Patches & jams.",
    followers: 318000,
    videoCount: 8,
    color: "#8b5cf6",
    theme: [
      "Building a bassline on the Prophet-6",
      "Lo-fi patch in 60 seconds",
      "Jamming two drum machines live",
      "Why I sold my modular rig",
      "Cassette tape saturation trick",
      "Sunset drive track — full build",
      "Cheap vs expensive reverb pedal",
      "Hidden feature of the Volca Keys",
    ],
  },
  {
    username: "tiny.house.studio",
    displayName: "Tiny House Studio",
    description: "Designing & building small spaces that feel huge. Woodworking + clever storage.",
    followers: 905000,
    videoCount: 8,
    color: "#10b981",
    theme: [
      "Murphy bed with hidden desk (build)",
      "Maximizing storage under stairs",
      "Fold-away dining table for 4",
      "Tiny bathroom that doesn't feel tiny",
      "Magnetic kitchen wall organization",
      "Loft bed build start to finish",
      "Secret door bookshelf project",
      "Window seat with pull-out drawers",
    ],
  },
  {
    username: "urban.sketcher",
    displayName: "Urban Sketcher",
    description: "Drawing the city, one café at a time. Ink & watercolor.",
    followers: 211000,
    videoCount: 7,
    color: "#f59e0b",
    theme: [
      "Sketching a busy market in 20 min",
      "My everyday sketch kit (minimal)",
      "Adding people without ruining it",
      "Watercolor clouds in 3 steps",
      "Café sketch with a single pen",
      "How I keep proportions right",
      "Rainy-day urban sketching setup",
    ],
  },
];

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

/** Build the full demo dataset (deterministic). */
export interface DemoDataset {
  authors: {
    profile: AuthorProfile;
    videos: AuthorVideo[];
  }[];
}

function buildDataset(): DemoDataset {
  const dataset: DemoDataset = { authors: [] };
  AUTHOR_DEFS.forEach((def, ai) => {
    const videos: AuthorVideo[] = def.theme.map((title, vi) => {
      const tiktokId = `72${ai}${String(vi).padStart(3, "0")}${ai}${vi}`;
      const seed = `${def.username}-${vi}`;
      return {
        tiktokId,
        url: `https://www.tiktok.com/@${def.username}/video/${tiktokId}`,
        title,
        description: `${title}\n\n#${def.username.split(".")[0]} #fyp #viral`,
        thumbnailUrl: thumb(seed, def.color),
        duration: 12 + ((vi * 7) % 45),
        width: 1080,
        height: 1920,
        viewCount: Math.round((def.followers / 40) * (1 + (vi % 5) * 0.6)),
        likeCount: Math.round((def.followers / 200) * (1 + (vi % 4) * 0.5)),
        commentCount: Math.round((def.followers / 4000) * (1 + (vi % 3))),
        shareCount: Math.round((def.followers / 6000) * (1 + (vi % 2))),
        publishedAt: hoursAgo((vi + 1) * 9 + ai * 3),
      };
    });
    dataset.authors.push({
      profile: {
        username: def.username,
        displayName: def.displayName,
        avatarUrl: avatar(def.username, def.color),
        description: def.description,
        followerCount: def.followers,
        followingCount: Math.round(def.followers * 0.03),
        heartCount: Math.round(def.followers * 77),
        videoCount: def.videoCount,
      },
      videos,
    });
  });
  return dataset;
}

export const demoDataset: DemoDataset = buildDataset();

/** Map a demo video + author to a VideoMeta (adds authorUsername + streamUrl). */
function toVideoMeta(v: AuthorVideo, authorUsername: string, authorDisplayName: string | null, authorAvatarUrl: string | null, idx: number): VideoMeta {
  return {
    ...v,
    authorUsername,
    authorDisplayName,
    authorAvatarUrl,
    streamUrl: SAMPLE_VIDEOS[idx % SAMPLE_VIDEOS.length],
  };
}

const COMMENT_AUTHORS = [
  "maya.r", "dev_42", "outdoor.nik", "lena.codes", "tomas.k", "aisha.m",
  "pixel_pete", "nora_w", "sam.builds", "kiryl.v", "sofia.j", "ben.t",
];

const COMMENT_TEXTS = [
  "This is exactly what I needed today, thank you!",
  "Tried this last night and it actually worked, obsessed",
  "How long did this take you to learn? Seems hard",
  "Saving this for later, the technique is gold",
  "First! Love the energy in these videos",
  "Could you do a follow-up on the tools you used?",
  "This just changed my whole approach lol",
  "Underrated creator, more people need to see this",
  "The editing on this is so clean",
  "Wait what?? I had no idea you could do that",
  "Bookmarked. Coming back to this tomorrow",
  "Your explanations are clearer than the paid course I took",
  "Ngl I watched this 3 times already",
  "Algorithm finally did something right today",
  "The payoff at the end was worth it",
  "Anyone else pause to read the details?",
];

function makeComments(videoId: string, count: number): VideoComment[] {
  const out: VideoComment[] = [];
  for (let i = 0; i < count; i++) {
    const seed = parseInt(videoId.replace(/\D/g, "").slice(-3) || "0", 10) + i;
    out.push({
      id: `${videoId}-c${i}`,
      authorName: COMMENT_AUTHORS[(seed + i) % COMMENT_AUTHORS.length],
      authorAvatar: avatar(`c-${videoId}-${i}`),
      text: COMMENT_TEXTS[(seed + i * 3) % COMMENT_TEXTS.length],
      likeCount: ((seed * 7 + i * 13) % 4200) + 3,
      postedAt: hoursAgo(((i * 5) % 70) + 1),
    });
  }
  return out;
}

export class DemoProvider implements TikTokProvider {
  async getAuthorProfile(username: string): Promise<AuthorProfile> {
    const u = username.replace(/^@/, "");
    const a = demoDataset.authors.find((x) => x.profile.username === u);
    if (!a) {
      // Synthesize a plausible profile for any handle typed in the search/subscribe box.
      return {
        username: u,
        displayName: u,
        avatarUrl: avatar(u),
        description: "This is a demo profile. In demo mode any handle resolves to sample data.",
        followerCount: 1000 + (u.length * 137) % 500000,
        followingCount: Math.round((1000 + (u.length * 137) % 500000) * 0.05),
        heartCount: Math.round((1000 + (u.length * 137) % 500000) * 42),
        videoCount: 0,
      };
    }
    return a.profile;
  }

  async getAuthorVideos(username: string, limit = 30, offset = 0): Promise<AuthorVideo[]> {
    const u = username.replace(/^@/, "");
    const a = demoDataset.authors.find((x) => x.profile.username === u);
    if (!a) return [];
    return a.videos.slice(offset, offset + limit);
  }

  async getVideoMeta(videoUrl: string): Promise<VideoMeta> {
    // Parse author + tiktokId from the demo url.
    const m = videoUrl.match(/@([^/]+)\/video\/(\d+)/);
    const authorUsername = m?.[1] ?? "unknown";
    const tiktokId = m?.[2] ?? "";
    const a = demoDataset.authors.find((x) => x.profile.username === authorUsername);
    const v = a?.videos.find((x) => x.tiktokId === tiktokId) ?? a?.videos[0];
    if (!v) {
      throw new Error("demo video not found");
    }
    const idx = a!.videos.indexOf(v);
    return toVideoMeta(v, authorUsername, a!.profile.displayName, a!.profile.avatarUrl, idx);
  }

  async getComments(videoUrl: string): Promise<VideoComment[]> {
    const m = videoUrl.match(/video\/(\d+)/);
    const id = m?.[1] ?? "0";
    return makeComments(id, 8 + (parseInt(id.replace(/\D/g, "").slice(-2) || "5", 10) % 7));
  }

  async downloadVideo(_videoUrl: string, _destPath: string): Promise<void> {
    // In demo mode "download" is a no-op (the real provider downloads via yt-dlp).
    await new Promise((r) => setTimeout(r, 400));
  }

  async search(query: string, kind: "all" | "author" | "video"): Promise<SearchResult[]> {
    const q = query.toLowerCase().replace(/^@/, "");
    const results: SearchResult[] = [];
    if (kind === "all" || kind === "author") {
      for (const a of demoDataset.authors) {
        if (
          a.profile.username.toLowerCase().includes(q) ||
          (a.profile.displayName ?? "").toLowerCase().includes(q)
        ) {
          results.push({
            kind: "author",
            username: a.profile.username,
            displayName: a.profile.displayName,
            avatarUrl: a.profile.avatarUrl,
            description: a.profile.description,
            followerCount: a.profile.followerCount,
          });
        }
      }
    }
    if (kind === "all" || kind === "video") {
      for (const a of demoDataset.authors) {
        a.videos.forEach((v, idx) => {
          if ((v.title ?? "").toLowerCase().includes(q) || (v.description ?? "").toLowerCase().includes(q)) {
            results.push({
              kind: "video",
              username: a.profile.username,
              video: { ...v, authorUsername: a.profile.username },
            });
          }
          // Suppress unused var
          void idx;
        });
      }
    }
    return results;
  }
}
