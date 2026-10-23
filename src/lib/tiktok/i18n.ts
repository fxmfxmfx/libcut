/**
 * English interface strings. Legacy locale preferences are accepted during
 * migration and normalized to English.
 */

export type Lang = "en" | "ru";

type Dict = Record<string, string>;

const en: Dict = {
  "player.seek": "Seek video",
  "feed.previousPhoto": "Previous photo",
  "feed.nextPhoto": "Next photo",
  "feed.swipe": "Swipe up for the next video",
  "feed.sessionEnd": "You’re all caught up",
  "feed.backToTop": "Back to the first video",
  "feed.previous": "Previous video",
  "feed.next": "Next video",
  "feed.mute": "Mute",
  "feed.unmute": "Unmute",
  "feed.play": "Play video",
  "feed.pause": "Pause video",
  "feed.photo": "Photo",
  "feed.loading": "Loading video…",
  "feed.views": "views",

  "status.proxyConfigured": "Proxy configured",
  "common.retry": "Try again",
  "player.video": "Video",
  "feed.partial": "Could not refresh {n} subscriptions. Showing available videos.",
  // Nav
  "nav.feed": "Feed",
  "nav.subscriptions": "Subscriptions",
  "nav.favorites": "Favorites",
  "nav.search": "Search",
  "nav.settings": "Settings",

  // Search
  "search.placeholder": "@username, keywords or TikTok link…",
  "search.authors": "Authors",
  "search.videos": "Videos",
  "search.all": "All",
  "search.start": "Start searching",
  "search.start.desc": "Type an @username or keywords in the search bar above. Results come from your library and live from TikTok.",
  "search.loading": "Searching…",
  "search.notFound.authors": "No authors found.",
  "search.notFound.videos": "No videos found.",
  "search.inLibrary": "In library",
  "search.onTikTok": "TikTok",

  // Feed
  "feed.title": "Feed",
  "feed.desc": "New videos from your subscriptions you haven't seen yet",
  "feed.check": "Check for new",
  "feed.checking": "Checking your subscriptions for new videos…",
  "feed.found": "Found {n} new videos",
  "feed.empty.title": "No new videos",
  "feed.empty.desc": "You've watched everything available. Click \"Check for new\" to refresh the feed.",
  "feed.empty.nosub.title": "Feed is empty",
  "feed.empty.nosub.desc": "Subscribe to TikTok creators so their new videos show up here. The feed only shows videos you haven't watched.",
  "feed.empty.nosub.cta": "Find creators",

  // Subscriptions
  "subs.title": "Subscriptions",
  "subs.desc": "Manage the creators you follow",
  "subs.subscribe": "Subscribe",
  "subs.unsubscribe": "Unsubscribe",
  "subs.empty.title": "No subscriptions",
  "subs.empty.desc": "Add TikTok creators by @username — their recent videos are saved locally and new ones appear in the feed.",
  "subs.unseen": "new",
  "subs.unwatched": "unwatched",
  "subs.stored": "videos",

  // Subscribe dialog
  "sub.dialog.title": "Subscribe to a creator",
  "sub.dialog.desc": "Enter a TikTok @username. We'll fetch the profile and recent videos via yt-dlp (through your SOCKS5 proxy) and save them locally.",
  "sub.dialog.username": "Username",
  "sub.dialog.placeholder": "@username",
  "sub.dialog.cancel": "Cancel",
  "sub.dialog.ok": "Subscribe",
  "sub.dialog.success": "Subscribed",
  "sub.dialog.success.desc": "@{user} · {n} videos added",
  "sub.dialog.fail": "Could not subscribe",
  "sub.dialog.fail.desc": "Check the username and your proxy",

  // Favorites
  "fav.title": "Favorites",
  "fav.desc": "Videos you've saved",
  "fav.empty.title": "No favorites yet",
  "fav.empty.desc": "Open any video and tap \"Favorite\" to save it here. Favorites are stored in your local database.",
  "fav.empty.cta": "Go to feed",

  // Author profile
  "author.followers": "followers",
  "author.following": "following",
  "author.likes": "likes",
  "author.videos": "videos",
  "author.updated": "updated {ago}",
  "author.check": "Check for new",
  "author.loadOlder": "Load older videos",
  "author.markAllSeen": "Mark all as watched",
  "author.markAllSeen.done": "Marked {n} videos as watched",
  "author.openOriginal": "Open on TikTok",
  "author.back": "Back",
  "author.notFound.title": "Creator not found",
  "author.notFound.desc": "This creator isn't in your library. Subscribe to load their profile.",
  "author.notFound.cta": "Load profile",
  "author.notSubscribed": "not subscribed",
  "author.subscribed": "Following",

  // External link warning
  "ext.warn.title": "Leaving libcut",
  "ext.warn.desc": "This will open the real TikTok website, which has tracking and ads. Continue?",
  "ext.warn.continue": "Continue to TikTok",
  "ext.warn.cancel": "Stay here",

  // Video card
  "video.watched": "Watched",
  "video.new": "New",
  "video.untitled": "Untitled",

  // Player
  "player.original": "Original",
  "player.favorite": "Favorite",
  "player.favorited": "Favorited",
  "player.download": "Download",
  "player.download.start": "Download started",
  "player.download.desc": "The video is downloading to your computer.",
  "player.markWatched": "Mark watched",
  "player.markNew": "Mark as new",
  "player.comments": "Comments",
  "player.comments.load": "Load comments",
  "player.comments.loading": "Loading comments…",
  "player.comments.refresh": "Refresh",
  "player.comments.empty": "No comments yet",
  "player.comments.fail": "Couldn't load comments: {err}",
  "player.replies.empty": "Replies are no longer available",
  "player.replies.hide": "Hide replies",
  "player.replies.view": "View replies ({n})",
  "player.replies.more": "Show more replies",
  "player.replies.retry": "Retry loading replies",
  "player.replies.fail": "Couldn't load replies: {err}",
  "player.close": "Close",
  "player.volume": "Volume",
  "player.slides": "Slide {n} of {total}",
  "player.next": "Next",
  "player.prev": "Previous",
  "player.failed": "Couldn't load video",

  // Settings
  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.accent": "Accent color",
  "settings.customCss": "Custom CSS",
  "settings.customCss.placeholder": "/* Add your own CSS here */\n:root { /* … */ }",
  "settings.proxy": "Proxy",
  "settings.proxy.enabled": "Use proxy",
  "settings.proxy.url": "SOCKS5 proxy URL",
  "settings.proxy.url.placeholder": "socks5://user:pass@host:1080",
  "settings.proxy.desc": "All TikTok access goes through this proxy (via yt-dlp). Enabled by default.",
  "settings.proxy.env": "From env: {url}",
  "settings.proxy.none": "No proxy configured",
  "settings.proxy.test": "Proxy status",
  "settings.proxy.recheck": "Recheck",
  "settings.system": "System info",
  "settings.behavior": "Behavior",
  "settings.autoMarkSeen": "Auto-mark videos as watched when opened",
  "settings.dataMode": "Data storage mode",
  "settings.dataMode.local": "Server (SQLite)",
  "settings.dataMode.client": "Client (browser localStorage)",
  "settings.dataMode.local.desc": "All data (subscriptions, favorites, seen-state) is stored on the server in a SQLite database. Anyone who can access this web page can see and delete all data. Best for single-user / trusted-network setups.",
  "settings.dataMode.client.desc": "All user data is stored in your browser's localStorage. Nothing is persisted server-side. Best for public instances shared by multiple users — each person's data stays in their own browser.",
  "settings.dataMode.warning": "⚠️ In Server mode, anyone with access to this page can view and delete ALL data (subscriptions, favorites, comments). For public instances, use Client mode.",
  "settings.dataMode.env": "Set via DATA_MODE env variable (local or client). Requires container restart to change.",
  "settings.save": "Save",
  "settings.saved": "Settings saved",
  "settings.reset": "Reset to defaults",
  "settings.cache": "Cache",
  "settings.cache.ttl": "Video cache lifetime (minutes)",
  "settings.danger": "Danger zone",
  "settings.clearData": "Clear all data (subscriptions, favorites, comments)",
  "settings.cleared": "All data cleared",

  // Themes
  "theme.default": "Default (Rose)",
  "theme.gruvbox": "Gruvbox",
  "theme.catppuccin": "Catppuccin Mocha",
  "theme.nord": "Nord",
  "theme.dracula": "Dracula",
  "theme.light": "Light",

  // Status
  "status.demo": "Demo mode",
  "status.demo.tip": "DEMO_MODE is on — sample data is shown, real TikTok is not contacted. On your server set DEMO_MODE=false and configure a SOCKS5 proxy (TIKTOK_PROXY).",
  "status.noproxy": "No proxy",
  "status.noproxy.tip": "TIKTOK_PROXY is not set. Requests go direct — TikTok will likely block them. Set a SOCKS5 proxy.",
  "status.checking": "Checking proxy…",
  "status.proxybad": "Proxy not working",
  "status.proxy": "Proxy active",
  "status.proxy.tip": "All TikTok access goes through your SOCKS5 proxy. Video cache is cleared every {n} min.",

  // Misc
  "time.justNow": "just now",
  "time.min": "min ago",
  "time.h": "h ago",
  "time.d": "d ago",
  "time.wk": "wk ago",
  "time.mo": "mo ago",
  "time.y": "y ago",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
};

// Keep the old locale key readable while serving English strings for it.
const dicts: Record<Lang, Dict> = { en, ru: en };

/** Translate a key with optional {placeholder} interpolation. */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = dicts[lang]?.[key] ?? dicts.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}
