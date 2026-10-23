import { test, expect } from "@playwright/test";

async function openSearch(page: import("@playwright/test").Page) {
  const searchBox = page.getByRole("textbox");
  if (!(await searchBox.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Search", exact: true }).click();
  }
  return searchBox;
}

test("search returns playable videos, mobile comments scroll, downloads support ranges", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const liveResponse = await request.get("/api/tiktok/search?q=garlic&kind=video&source=live");
  const live = await liveResponse.json();
  expect(live.liveError).toBeNull();
  expect(live.results[0].id).toBeTruthy();
  expect(live.results[0].tiktokId).toMatch(/^\d+$/);
  expect(live.results[0].publishedAt).not.toBeNull();
  await page.goto("/");
  await (await openSearch(page)).fill("garlic");
  await expect(page.getByRole("heading", { name: "VIDEOS (1)" })).toBeVisible();
  const card = page.locator('[role="button"]').filter({ has: page.locator(".video-portrait") }).first();
  await expect(card).toBeVisible();
  await card.click();
  const player = page.locator('[data-player-presentation="dialog"]');
  const dialog = player.locator("xpath=ancestor::*[@role='dialog'][1]");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Comments", exact: true }).click();
  const commentsDialog = page.getByRole("dialog", { name: /Comments/ });
  await expect(commentsDialog.locator("ul").first()).toBeVisible();
  const overflow = await dialog.evaluate((element) => ({ width: element.scrollWidth > innerWidth, height: element.getBoundingClientRect().height > innerHeight + 1 }));
  expect(overflow).toEqual({ width: false, height: false });
  await commentsDialog.getByRole("button", { name: "Close", exact: true }).click();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  const found = await request.get("/api/tiktok/authors/city.cookhouse");
  const result = await found.json();
  const video = result.videos[0];
  expect(video.id).toBeTruthy();
  const detail = await (await request.get(`/api/tiktok/videos/${video.id}`)).json();
  const download = await request.get(detail.video.downloadSrc, { headers: { range: "bytes=0-31" } });
  expect(download.status()).toBe(206);
  expect(download.headers()["content-disposition"]).toContain("attachment");
  expect((await download.body()).length).toBe(32);
  expect(errors).toEqual([]);
});

test("live search recovers after a transient error when its query remounts", async ({ page }) => {
  let liveCalls = 0;
  await page.route("**/api/tiktok/search?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("q") !== "networkcheck") return route.continue();

    const source = url.searchParams.get("source");
    if (source === "library") {
      return route.fulfill({ json: { results: [], liveError: null } });
    }
    if (source !== "live") return route.continue();

    liveCalls += 1;
    if (liveCalls === 1) {
      return route.fulfill({ json: { results: [], liveError: "Temporary upstream failure" } });
    }
    return route.fulfill({ json: {
      results: [{
        id: "e2e-networkcheck",
        kind: "author",
        username: "networkcheck",
        displayName: "Network recovery",
        avatarUrl: null,
        description: null,
        followerCount: 1,
        source: "live",
      }],
      liveError: null,
    } });
  });

  await page.goto("/");
  await (await openSearch(page)).fill("networkcheck");
  await expect(page.getByText("Temporary upstream failure", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Network recovery", { exact: true })).toBeVisible();
  expect(liveCalls).toBeGreaterThanOrEqual(2);
});

test("audio volume and mute state are shared and persist across feed and video player", async ({ page, request }) => {
  const mode = (await (await request.get("/api/tiktok/status")).json()).dataMode;
  await page.setViewportSize({ width: 1280, height: 900 });
  if (mode === "client") {
    await page.addInitScript(() => localStorage.setItem("libcut-preferences-v1", JSON.stringify({
      lang: "en", theme: "default", accent: "#fe2c55", customCss: "", autoMarkSeen: false,
    })));
  } else {
    const settings = await request.patch("/api/tiktok/settings", { data: { autoMarkSeen: "false" } });
    expect(settings.ok()).toBe(true);
  }

  await page.goto("/");
  if (mode === "client") {
    await (await openSearch(page)).fill("city.cookhouse");
    await expect(page.getByRole("heading", { name: "AUTHORS (1)" })).toBeVisible();
    await page.getByRole("button", { name: "Subscribe", exact: true }).click();
    await expect(page.getByRole("heading", { name: "City Cookhouse", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Feed", exact: true }).click();
  }

  const feed = page.getByRole("region", { name: "Video feed" });
  await expect(feed).toBeVisible();
  const active = feed.locator('article[data-active="true"]');
  await expect(active.locator("video")).toHaveCount(1);
  const feedVideo = active.locator("video");
  const feedSlider = page.locator('[data-player-presentation="feed"] header').getByRole("slider", { name: "Volume" });
  await expect.poll(() => feedVideo.evaluate((video: HTMLVideoElement) => video.muted)).toBe(false);
  await expect.poll(() => feedVideo.evaluate((video: HTMLVideoElement) => video.volume)).toBe(1);

  await feedSlider.focus();
  await page.keyboard.press("Home");
  for (let step = 0; step < 4; step += 1) await page.keyboard.press("ArrowRight");
  await expect.poll(() => feedVideo.evaluate((video: HTMLVideoElement) => Math.round(video.volume * 100))).toBe(20);
  await expect.poll(() => feedVideo.evaluate((video: HTMLVideoElement) => video.muted)).toBe(false);

  await page.getByRole("button", { name: "Search", exact: true }).click();
  await (await openSearch(page)).fill("garlic");
  await expect(page.getByRole("heading", { name: "VIDEOS (1)" })).toBeVisible();
  const card = page.locator('[role="button"]').filter({ has: page.locator(".video-portrait") }).first();
  await card.click();
  const dialog = page.getByRole("dialog");
  const playerVideo = dialog.locator("video").first();
  const playerSlider = dialog.getByRole("slider", { name: "Volume" });
  await expect(playerSlider).toBeVisible();
  await expect.poll(() => playerVideo.evaluate((video: HTMLVideoElement) => Math.round(video.volume * 100))).toBe(20);
  await expect.poll(() => playerVideo.evaluate((video: HTMLVideoElement) => video.muted)).toBe(false);
  await dialog.getByRole("button", { name: "Mute", exact: true }).click();
  await expect.poll(() => playerVideo.evaluate((video: HTMLVideoElement) => video.muted)).toBe(true);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Feed", exact: true }).click();
  let activeVideo = page.getByRole("region", { name: "Video feed" }).locator('article[data-active="true"] video');
  await expect.poll(() => activeVideo.evaluate((video: HTMLVideoElement) => Math.round(video.volume * 100))).toBe(20);
  await expect.poll(() => activeVideo.evaluate((video: HTMLVideoElement) => video.muted)).toBe(true);

  await page.reload();
  activeVideo = page.getByRole("region", { name: "Video feed" }).locator('article[data-active="true"] video');
  await expect.poll(() => activeVideo.evaluate((video: HTMLVideoElement) => Math.round(video.volume * 100))).toBe(20);
  await expect.poll(() => activeVideo.evaluate((video: HTMLVideoElement) => video.muted)).toBe(true);
  await page.locator('[data-player-presentation="feed"] header').getByRole("button", { name: "Unmute", exact: true }).click();
  await expect.poll(() => activeVideo.evaluate((video: HTMLVideoElement) => !video.muted && Math.round(video.volume * 100) === 20)).toBe(true);

  await page.reload();
  activeVideo = page.getByRole("region", { name: "Video feed" }).locator('article[data-active="true"] video');
  await expect.poll(() => activeVideo.evaluate((video: HTMLVideoElement) => !video.muted && Math.round(video.volume * 100) === 20)).toBe(true);
});

test("video begins loading while its detail request is stalled", async ({ page }) => {
  let releaseDetails!: () => void;
  let notifyDetailsRequested!: () => void;
  const detailGate = new Promise<void>((resolve) => { releaseDetails = resolve; });
  const detailsRequested = new Promise<void>((resolve) => { notifyDetailsRequested = resolve; });
  await page.route("**/api/tiktok/videos/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (!/^\/api\/tiktok\/videos\/[^/]+$/.test(pathname)) return route.continue();
    notifyDetailsRequested();
    await detailGate;
    await route.continue();
  });

  try {
    await page.goto("/");
    await (await openSearch(page)).fill("garlic");
    await expect(page.getByRole("heading", { name: "VIDEOS (1)" })).toBeVisible();
    const card = page.locator('[role="button"]').filter({ has: page.locator(".video-portrait") }).first();
    await card.click();
    const video = page.locator('[data-player-presentation="dialog"] video').first();
    await detailsRequested;
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThan(0);
  } finally {
    releaseDetails();
  }
});

test("client preferences and video state survive reload without writing shared personal data", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "client");
  const personalRequests: string[] = [];
  const authorRequests: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/tiktok\/authors\//.test(r.url())) authorRequests.push(r.url());
    if (/\/api\/tiktok\/(feed|favorites|subscriptions|settings|refresh)(?:\?|$)/.test(r.url())) personalRequests.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem("e2e-initialized")) {
      localStorage.setItem("libcut.lang", "en");
      localStorage.setItem("libcut.theme", "nord");
      localStorage.setItem("libcut.autoMarkSeen", "false");
      localStorage.setItem("libcut.css", ".e2e-test { color: red; }");
      localStorage.setItem("e2e-initialized", "true");
    }
  });
  await page.route("**/api/tiktok/status", async (route) => { await new Promise((r) => setTimeout(r, 150)); await route.continue(); });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "nord");
  await (await openSearch(page)).fill("city.cookhouse");
  await expect(page.getByRole("heading", { name: "AUTHORS (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Subscribe", exact: true }).click();
  await expect(page.getByRole("heading", { name: "City Cookhouse", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator("#autoMark")).not.toBeChecked();
  await expect(page.locator("#css")).toHaveValue(".e2e-test { color: red; }");
  const normalizeAudio = page.getByRole("switch", { name: "Normalize audio", exact: true });
  await expect(normalizeAudio).not.toBeChecked();
  await normalizeAudio.click();
  await expect(normalizeAudio).toBeChecked();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "nord");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Normalize audio", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  const feed = page.getByRole("region", { name: "Video feed" });
  const activeVideo = feed.locator('article[data-active="true"]');
  await expect(activeVideo).toHaveCount(1);
  const beforeMark = authorRequests.length;
  await activeVideo.getByRole("button", { name: "Mark watched", exact: true }).click();
  await expect(activeVideo.getByRole("button", { name: "Mark as new", exact: true })).toBeVisible();
  expect(authorRequests).toHaveLength(beforeMark);
  await activeVideo.getByRole("button", { name: "Favorite", exact: true }).click();
  await expect(activeVideo.getByRole("button", { name: "Favorited", exact: true })).toBeVisible();
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("libcut-client-data")!).state);
  expect(saved.subscriptions).toHaveLength(1);
  expect(saved.favorites).toHaveLength(1);
  expect(saved.seenVideoIds).toContain(saved.favorites[0].tiktokId);
  await expect(page.getByRole("button", { name: "Feed", exact: true })).toBeVisible();
  const feedAfterReload = page.getByRole("region", { name: "Video feed" });
  await expect(feedAfterReload).toBeVisible();
  await expect(feedAfterReload.locator(`article[data-feed-video="${saved.favorites[0].tiktokId}"]`)).toHaveCount(0);
  expect(personalRequests).toEqual([]);
  for (const endpoint of ["feed", "favorites", "subscriptions"]) expect((await request.get(`/api/tiktok/${endpoint}`)).status()).toBe(403);
  expect((await request.patch("/api/tiktok/settings", { data: { theme: "light" } })).status()).toBe(403);
  expect((await request.delete("/api/tiktok/clear-data")).status()).toBe(403);
});

test("vertical feed navigates one active TikTok at a time and marking watched keeps the current video", async ({ page, request }) => {
  const mode = (await (await request.get("/api/tiktok/status")).json()).dataMode;
  await page.setViewportSize({ width: 1280, height: 900 });
  if (mode === "client") {
    await page.addInitScript(() => localStorage.setItem("libcut-preferences-v1", JSON.stringify({
      lang: "en", theme: "default", accent: "#fe2c55", customCss: "", autoMarkSeen: false,
    })));
  } else {
    const settings = await request.patch("/api/tiktok/settings", { data: { autoMarkSeen: "false" } });
    expect(settings.ok()).toBe(true);
  }
  await page.goto("/");
  if (mode === "client") {
    await (await openSearch(page)).fill("city.cookhouse");
    await expect(page.getByRole("heading", { name: "AUTHORS (1)" })).toBeVisible();
    await page.getByRole("button", { name: "Subscribe", exact: true }).click();
    await expect(page.getByRole("heading", { name: "City Cookhouse", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Feed", exact: true }).click();
  }

  const feed = page.getByRole("region", { name: "Video feed", includeHidden: true });
  await expect(feed).toBeVisible();
  const feedHeading = page.getByRole("heading", { name: "Feed", exact: true });
  const searchBox = page.getByRole("textbox");
  await expect.poll(async () => {
    const [headingBox, searchBoxBounds] = await Promise.all([feedHeading.boundingBox(), searchBox.boundingBox()]);
    if (!headingBox || !searchBoxBounds) return Number.POSITIVE_INFINITY;
    return Math.abs((headingBox.y + headingBox.height / 2) - (searchBoxBounds.y + searchBoxBounds.height / 2));
  }).toBeLessThan(5);
  const articles = feed.locator("article[data-feed-video]");
  await expect.poll(() => articles.count()).toBeGreaterThan(1);
  const active = feed.locator('article[data-active="true"]');
  await expect(active).toHaveCount(1);
  await expect(active.locator("video")).toHaveCount(1);
  const currentId = await active.getAttribute("data-feed-video");
  expect(currentId).toBeTruthy();
  await expect(active).toContainText(/@[a-z0-9._]+/i);
  const favoriteButton = active.getByRole("button", { name: "Favorite", exact: true });
  const markWatchedButton = active.getByRole("button", { name: "Mark watched", exact: true });
  const commentsButton = active.getByRole("button", { name: "Comments", exact: true });
  await expect(favoriteButton).toBeVisible();
  await expect(favoriteButton).toHaveAttribute("aria-label", "Favorite");
  await expect(markWatchedButton).toBeVisible();
  await expect(markWatchedButton).toHaveAttribute("aria-label", "Mark watched");
  await expect(commentsButton).toHaveAttribute("aria-label", "Comments");
  await expect(page.getByRole("button", { name: "Previous video", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next video", exact: true })).toBeVisible();

  const activePlayer = active.locator("video");
  await expect.poll(() => activePlayer.evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThan(0);
  await expect.poll(() => activePlayer.evaluate((video: HTMLVideoElement) => video.muted)).toBe(false);
  await expect.poll(() => activePlayer.evaluate((video: HTMLVideoElement) => video.volume)).toBe(1);
  const volumeSlider = page.locator('[data-player-presentation="feed"] header [data-slot="slider"] [role="slider"]');
  await volumeSlider.focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => activePlayer.evaluate((video: HTMLVideoElement) => video.volume)).toBeLessThan(1);
  expect(await active.getAttribute("data-feed-video")).toBe(currentId);
  if (await activePlayer.evaluate((video: HTMLVideoElement) => video.paused)) {
    const playButton = active.getByRole("button", { name: "Play video", exact: true });
    await expect(playButton).toBeVisible();
    await playButton.click();
  }
  await expect.poll(() => activePlayer.evaluate((video: HTMLVideoElement) => !video.paused)).toBe(true);
  await expect.poll(() => feed.locator('article[data-active="false"] video').evaluateAll((videos: HTMLVideoElement[]) => videos.every((video) => video.paused))).toBe(true);

  await commentsButton.click();
  const inlineComments = page.locator('[data-player-presentation="feed"] [data-inline-comments]');
  await expect(inlineComments).toBeVisible();
  await expect(inlineComments.locator("video")).toHaveCount(0);
  await expect.poll(() => activePlayer.evaluate((video: HTMLVideoElement) => !video.paused)).toBe(true);
  await inlineComments.getByRole("button", { name: "Close", exact: true }).click();

  const markWatched = feed.locator(`article[data-feed-video="${currentId}"]`).getByRole("button", { name: "Mark watched", exact: true });
  await markWatched.click();
  await expect(feed.locator(`article[data-feed-video="${currentId}"][data-active="true"]`)).toHaveCount(1);
  await expect(feed.locator('article[data-active="true"]')).toHaveCount(1);

  await feed.focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => feed.locator('article[data-active="true"]').getAttribute("data-feed-video")).not.toBe(currentId);
  await expect(feed.locator('article[data-active="true"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Previous video", exact: true }).click();
  await expect(feed.locator(`article[data-feed-video="${currentId}"][data-active="true"]`)).toHaveCount(1);
  await page.getByRole("button", { name: "Next video", exact: true }).click();
  await expect(feed.locator('article[data-active="true"]')).toHaveCount(1);
  const nextActive = feed.locator('article[data-active="true"]');
  const nextPlayer = nextActive.locator("video");
  await expect.poll(() => nextPlayer.evaluate((video: HTMLVideoElement) => Math.round(video.volume * 100))).toBe(95);
  const nextVolumeSlider = page.locator('[data-player-presentation="feed"] header [data-slot="slider"] [role="slider"]');
  await nextVolumeSlider.focus();
  await page.keyboard.press("Home");
  await expect.poll(() => nextPlayer.evaluate((video: HTMLVideoElement) => video.muted)).toBe(true);
  await page.locator('[data-player-presentation="feed"] header').getByRole("button", { name: "Unmute", exact: true }).click();
  await expect.poll(() => nextPlayer.evaluate((video: HTMLVideoElement) => !video.muted && video.volume === 1)).toBe(true);

  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(feedHeading).toHaveCount(0);
});

test("mobile feed scroll changes one active video without document overflow", async ({ page, request }) => {
  const mode = (await (await request.get("/api/tiktok/status")).json()).dataMode;
  await page.setViewportSize({ width: 390, height: 844 });
  if (mode === "client") {
    await page.addInitScript(() => localStorage.setItem("libcut-preferences-v1", JSON.stringify({
      lang: "en", theme: "default", accent: "#fe2c55", customCss: "", autoMarkSeen: false,
    })));
  } else {
    const settings = await request.patch("/api/tiktok/settings", { data: { autoMarkSeen: "false" } });
    expect(settings.ok()).toBe(true);
  }
  await page.goto("/");
  if (mode === "client") {
    await (await openSearch(page)).fill("city.cookhouse");
    await expect(page.getByRole("heading", { name: "AUTHORS (1)" })).toBeVisible();
    await page.getByRole("button", { name: "Subscribe", exact: true }).click();
    await expect(page.getByRole("heading", { name: "City Cookhouse", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Feed", exact: true }).click();
  }

  const feed = page.getByRole("region", { name: "Video feed" });
  await expect(feed).toBeVisible();
  await expect.poll(() => feed.locator("article[data-feed-video]").count()).toBeGreaterThan(1);
  const active = feed.locator('article[data-active="true"]');
  await expect(active).toHaveCount(1);
  await expect(active.locator("video")).toHaveCount(1);
  const nextId = await feed.locator("article[data-feed-video]").nth(1).getAttribute("data-feed-video");
  expect(nextId).toBeTruthy();
  const bounds = await feed.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error("Video feed bounds are unavailable");
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    // Keep the gesture on the media, clear of the overlaid transport controls
    // and the fixed bottom navigation.
    const x = bounds.x + bounds.width * 0.3;
    const startY = bounds.y + bounds.height * 0.75;
    const endY = bounds.y + bounds.height * 0.2;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY }] });
    for (let y = startY - 24; y > endY; y -= 24) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
      await page.waitForTimeout(30);
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await session.send("Emulation.setTouchEmulationEnabled", { enabled: false }).catch(() => {});
    await session.detach();
  }
  await expect.poll(() => feed.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => feed.locator('article[data-active="true"]').getAttribute("data-feed-video")).toBe(nextId);
  await expect(feed.locator('article[data-active="true"]')).toHaveCount(1);

  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight > document.documentElement.clientHeight,
  }));
  expect(overflow).toEqual({ horizontal: false, vertical: false });
});

test("author profile opens a deep video in a bounded swipe queue and restores on close", async ({ page }) => {
  const firstTikTokId = BigInt("9000000000000000000");
  const videos = Array.from({ length: 9 }, (_, index) => ({
    id: `deep-video-${index + 1}`,
    tiktokId: `${firstTikTokId + BigInt(index + 1)}`,
    url: `https://www.tiktok.com/@deepindex/video/${firstTikTokId + BigInt(index + 1)}`,
    title: `Deep video ${index + 1}`,
    description: null,
    thumbnailUrl: null,
    streamUrl: null,
    duration: 12,
    width: 720,
    height: 1280,
    viewCount: 10,
    likeCount: 1,
    commentCount: 0,
    publishedAt: new Date(Date.now() - index * 60_000).toISOString(),
    seen: false,
    isFavorited: false,
    authorUsername: "deepindex",
    author: { id: "deepindex", username: "deepindex", displayName: "Deep Index", avatarUrl: null, followerCount: 0 },
  }));
  await page.route("**/api/tiktok/search?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("q") !== "deepindex") return route.continue();
    if (url.searchParams.get("source") === "library") return route.fulfill({ json: { results: [], liveError: null } });
    return route.fulfill({ json: { results: [{
      kind: "author", source: "live", username: "deepindex", displayName: "Deep Index",
      avatarUrl: null, description: null, followerCount: 0, subscribed: false,
    }], liveError: null } });
  });
  await page.route("**/api/tiktok/authors/deepindex**", (route) => route.fulfill({ json: {
    author: { id: "deepindex", username: "deepindex", displayName: "Deep Index", avatarUrl: null, description: "Test author", followerCount: 0, subscribed: false },
    videos,
  } }));

  await page.goto("/");
  await (await openSearch(page)).fill("deepindex");
  await expect(page.getByText("Deep Index", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /@deepindex/ }).first().click();
  await expect(page.getByRole("heading", { name: "Deep Index", exact: true })).toBeVisible();

  const profileCards = page.locator('[role="button"]').filter({ has: page.locator(".video-portrait") });
  await expect(profileCards).toHaveCount(9);
  await profileCards.nth(7).click();
  const dialog = page.getByRole("dialog");
  const feed = dialog.getByRole("region", { name: "Video feed" });
  await expect(dialog).toBeVisible();
  await expect(feed.locator('article[data-active="true"]')).toHaveAttribute("data-feed-video", videos[7].tiktokId);
  await expect.poll(() => feed.locator("article[data-feed-video]").count()).toBeLessThan(6);
  await expect(feed.locator('article[data-active="true"] video')).toHaveCount(1);

  await feed.focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => feed.locator('article[data-active="true"]').getAttribute("data-feed-video")).toBe(videos[8].tiktokId);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Deep Index", exact: true })).toBeVisible();
  await expect(profileCards).toHaveCount(9);
});

test("local feed cursor advances when its anchor video is marked watched", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "local");
  const firstResponse = await request.get("/api/tiktok/feed?limit=3");
  expect(firstResponse.ok()).toBe(true);
  const firstPage = await firstResponse.json();
  expect(firstPage.videos).toHaveLength(3);
  expect(firstPage.nextCursor).toBeTruthy();
  const seenAnchor = firstPage.videos.at(-1);
  expect(seenAnchor.id).toBe(firstPage.nextCursor);

  const markResponse = await request.patch(`/api/tiktok/videos/${seenAnchor.id}`, { data: { seen: true } });
  expect(markResponse.ok()).toBe(true);
  const nextResponse = await request.get(`/api/tiktok/feed?limit=3&cursor=${encodeURIComponent(firstPage.nextCursor)}`);
  expect(nextResponse.ok()).toBe(true);
  const nextPage = await nextResponse.json();

  expect(nextPage.videos.length).toBeGreaterThan(0);
  const previousIds = new Set(firstPage.videos.map((video: { id: string }) => video.id));
  expect(nextPage.videos.every((video: { id: string }) => !previousIds.has(video.id))).toBe(true);
});


test("client tabs synchronize preferences and clearing without restoring removed data", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "client");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Feed", exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByRole("button", { name: "Feed", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Nord", exact: true }).click();
  await expect(other.locator("html")).toHaveAttribute("data-theme", "nord");
  const profile = await (await page.request.get("/api/tiktok/authors/city.cookhouse")).json();
  await page.evaluate((author) => localStorage.setItem("libcut-client-data", JSON.stringify({ version: 2, state: {
    subscriptions: [{ username: author.username.toUpperCase(), displayName: author.displayName, avatarUrl: author.avatarUrl, description: author.description, followerCount: author.followerCount, subscribedAt: Date.now() }],
    favorites: [], seenVideoIds: [],
  } })), profile.author);
  await expect(other.getByRole("region", { name: "Video feed" }).locator("article[data-feed-video]").first()).toBeVisible();
  await other.getByRole("button", { name: "@city.cookhouse", exact: true }).first().click();
  await expect(other.getByRole("button", { name: "Unsubscribe", exact: true })).toBeVisible();
  await other.getByRole("button", { name: "Feed", exact: true }).click();
  await page.evaluate(() => localStorage.removeItem("libcut-client-data"));
  await expect(other.getByRole("button", { name: "Find creators", exact: true })).toBeVisible();
  expect(await other.evaluate(() => localStorage.getItem("libcut-client-data"))).toBeNull();
  await other.close();
});
