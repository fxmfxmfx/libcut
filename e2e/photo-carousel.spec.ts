import { expect, test, type Page } from "@playwright/test";

const author = {
  id: "photo-regression",
  username: "photo-regression",
  displayName: "Photo Carousel Regression",
  avatarUrl: null,
  description: "Synthetic gallery fixture",
  followerCount: 1,
  subscribed: false,
};

function svg(width: number, height: number, color: string) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${color}"/></svg>`)}`;
}

function wavTone(seconds = 8) {
  const sampleRate = 8_000;
  const sampleCount = sampleRate * seconds;
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(sampleCount * 2, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.sin(2 * Math.PI * 440 * index / sampleRate) * 0.2;
    buffer.writeInt16LE(Math.round(sample * 0x7fff), 44 + index * 2);
  }
  return buffer;
}

function makeVideo(id: string, index: number, images?: string[]) {
  const tiktokId = `90000000000000000${index}`;
  return {
    id,
    tiktokId,
    url: `https://www.tiktok.com/@${author.username}/video/${tiktokId}`,
    title: images ? "Synthetic photo gallery" : "Following regular video",
    description: null,
    thumbnailUrl: null,
    streamUrl: null,
    streamSrc: null,
    downloadSrc: null,
    duration: images ? 0 : 12,
    width: 720,
    height: 1280,
    viewCount: 10,
    likeCount: 1,
    commentCount: 0,
    shareCount: 0,
    publishedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    seen: false,
    isFavorited: false,
    authorUsername: author.username,
    author: { ...author },
    ...(images ? { isGallery: true, images, audioSrc: `/api/tiktok/videos/${id}/audio` } : { isGallery: false }),
  };
}

async function openSyntheticGallery(page: Page, images: string[]) {
  const galleryVideo = makeVideo("gallery-video", 1, images);
  const followingVideo = makeVideo("following-video", 2);
  const videos = [galleryVideo, followingVideo];
  let warmups = 0;

  await page.route("**/api/tiktok/search?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("q") !== author.username) return route.continue();
    if (url.searchParams.get("source") === "library") return route.fulfill({ json: { results: [], liveError: null } });
    return route.fulfill({ json: {
      results: [{ kind: "author", source: "live", username: author.username, displayName: author.displayName, avatarUrl: null, description: author.description, followerCount: 1, subscribed: false }],
      liveError: null,
    } });
  });
  await page.route(`**/api/tiktok/authors/${author.username}**`, (route) => route.fulfill({ json: { author, videos } }));
  await page.route("**/api/tiktok/videos/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const video = videos.find((candidate) => pathname === `/api/tiktok/videos/${candidate.id}` || pathname === `/api/tiktok/videos/${candidate.tiktokId}`);
    if (!video) return route.continue();
    return route.fulfill({ json: { video, author } });
  });
  await page.route(`**/api/tiktok/videos/${followingVideo.id}/stream`, (route) => {
    if (route.request().headers().range === "bytes=0-0") warmups++;
    return route.fulfill({
      status: 206,
      body: "x",
      headers: { "content-type": "video/mp4", "content-range": "bytes 0-0/1", "accept-ranges": "bytes", "content-length": "1" },
    });
  });
  const audioWav = wavTone();
  await page.route(`**/api/tiktok/videos/${galleryVideo.id}/audio`, (route) => route.fulfill({
    status: 200,
    body: audioWav,
    headers: { "content-type": "audio/wav", "content-length": String(audioWav.length), "cache-control": "no-store" },
  }));

  await page.goto("/");
  const search = page.getByRole("textbox");
  if (!(await search.isVisible().catch(() => false))) await page.getByRole("button", { name: "Search", exact: true }).click();
  await search.fill(author.username);
  await expect(page.getByRole("heading", { name: "AUTHORS (1)" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`@${author.username}`) }).first().click();
  await expect(page.getByRole("heading", { name: author.displayName, exact: true })).toBeVisible();
  const cards = page.locator('[role="button"]').filter({ has: page.locator(".video-portrait") });
  await expect(cards).toHaveCount(2);
  await cards.first().click();

  const dialog = page.getByRole("dialog");
  const feed = dialog.getByRole("region", { name: "Video feed" });
  const carousel = dialog.getByRole("region", { name: "Photo gallery" });
  await expect(dialog).toBeVisible();
  await expect(feed.locator('article[data-active="true"]')).toHaveAttribute("data-feed-video", galleryVideo.tiktokId);
  await expect(carousel).toBeVisible();
  return { dialog, feed, carousel, galleryVideo, followingVideo, warmups: () => warmups };
}

async function waitForGalleryAudio(page: Page) {
  const audio = page.locator("audio");
  await expect(audio).toHaveCount(1);
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused && element.readyState >= 2)).toBe(true);
  return audio;
}

async function touchSwipe(page: Page, box: { x: number; y: number; width: number; height: number }, horizontal: boolean) {
  const start = horizontal
    ? { x: box.x + box.width * 0.82, y: box.y + box.height * 0.5 }
    : { x: box.x + box.width * 0.5, y: box.y + box.height * 0.78 };
  const finish = horizontal
    ? { x: box.x + box.width * 0.18, y: start.y }
    : { x: start.x, y: box.y + box.height * 0.22 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  for (let step = 1; step <= 6; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: start.x + (finish.x - start.x) * step / 6, y: start.y + (finish.y - start.y) * step / 6 }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test.describe("photo carousel on touch screens", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("horizontal native swipe stays in the gallery and vertical swipe advances the video feed", async ({ page }) => {
    const images = Array.from({ length: 10 }, (_, index) => svg(400 + index * 10, 800, `hsl(${index * 30} 60% 45%)`));
    const { dialog, carousel, feed, galleryVideo, followingVideo, warmups } = await openSyntheticGallery(page, images);
    if (process.env.CAPTURE_PHOTO_SCREENSHOTS === "1") await page.screenshot({ path: "/tmp/libcut-photos-mobile.png" });
    const counter = feed.locator('article[data-active="true"] [aria-live="polite"]');
    await expect(counter).toHaveText("1 / 10");
    await expect.poll(warmups).toBe(1);
    await expect(dialog.locator("video")).toHaveCount(0);
    await expect.poll(() => carousel.locator("img[src]").count()).toBeLessThanOrEqual(3);
    // The adjacent image must be decoded before the gesture begins, not merely present in the DOM.
    await expect.poll(() => carousel.locator("img").nth(1).evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    const audio = await waitForGalleryAudio(page);
    const photo = carousel.getByRole("group", { name: "Photo 1 of 10" }).locator("img");
    await audio.evaluate((element: HTMLAudioElement) => {
      element.dataset.playCalls = "0";
      element.dataset.pauseCalls = "0";
      element.dataset.loadCalls = "0";
      const play = element.play.bind(element);
      const pause = element.pause.bind(element);
      const load = element.load.bind(element);
      element.play = () => { element.dataset.playCalls = String(Number(element.dataset.playCalls) + 1); return play(); };
      element.pause = () => { element.dataset.pauseCalls = String(Number(element.dataset.pauseCalls) + 1); pause(); };
      element.load = () => { element.dataset.loadCalls = String(Number(element.dataset.loadCalls) + 1); load(); };
      // React's pointer-up handler runs before this document bubble listener.
      document.addEventListener("pointerup", () => { element.dataset.pausedAtPointerUp = String(element.paused); });
    });
    await photo.tap({ position: { x: 50, y: 150 } });
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
    await expect(audio).toHaveAttribute("data-paused-at-pointer-up", "true");
    await expect(audio).toHaveAttribute("data-pause-calls", "1");
    await photo.tap({ position: { x: 50, y: 150 } });
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused)).toBe(true);
    await expect(audio).toHaveAttribute("data-paused-at-pointer-up", "false");
    await expect(audio).toHaveAttribute("data-play-calls", "1");
    await expect(audio).toHaveAttribute("data-pause-calls", "1");
    await expect(audio).toHaveAttribute("data-load-calls", "0");
    const beforeSwipe = await audio.evaluate((element: HTMLAudioElement) => element.currentTime);

    const box = await carousel.boundingBox();
    expect(box).not.toBeNull();
    await touchSwipe(page, box!, true);
    await expect(counter).toHaveText("2 / 10");
    await expect(feed.locator('article[data-active="true"]')).toHaveAttribute("data-feed-video", galleryVideo.tiktokId);
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused && element.currentTime > 0)).toBe(true);
    const afterSwipe = await audio.evaluate((element: HTMLAudioElement) => element.currentTime);
    expect(afterSwipe).toBeGreaterThan(beforeSwipe);

    const updatedBox = await carousel.boundingBox();
    expect(updatedBox).not.toBeNull();
    await touchSwipe(page, updatedBox!, false);
    await expect(feed.locator('article[data-active="true"]')).toHaveAttribute("data-feed-video", followingVideo.tiktokId);
    await expect(audio).toHaveCount(0);
  });
});

test.describe("photo carousel on desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("buttons, scoped keyboard, resize, selected aspect, and broken-photo retry work", async ({ page }) => {
    let retryRequests = 0;
    const retrySvg = svg(1200, 600, "#224466");
    await page.route("https://images.e2e.test/retry.svg", async (route) => {
      retryRequests += 1;
      if (retryRequests === 1) return route.fulfill({ status: 503, body: "temporary image failure" });
      return route.fulfill({ contentType: "image/svg+xml", body: decodeURIComponent(retrySvg.slice(retrySvg.indexOf(",") + 1)) });
    });
    const images = [svg(400, 800, "#ff0050"), svg(1600, 800, "#00aaff"), svg(800, 800, "#00cc88"), "https://images.e2e.test/retry.svg", ...Array.from({ length: 6 }, (_, index) => svg(500 + index, 900, "#553399"))];
    const { dialog, feed, carousel, galleryVideo } = await openSyntheticGallery(page, images);
    const playerCard = dialog.locator(".player-card");
    if (process.env.CAPTURE_PHOTO_SCREENSHOTS === "1") await page.screenshot({ path: "/tmp/libcut-photos-desktop.png" });
    const activeArticle = feed.locator('article[data-active="true"]');
    const counter = feed.locator('article[data-active="true"] [aria-live="polite"]');

    await expect(counter).toHaveText("1 / 10");
    await expect.poll(() => playerCard.evaluate((element) => Number.parseFloat(getComputedStyle(element).getPropertyValue("--player-aspect")))).toBeCloseTo(0.5, 2);
    await expect.poll(() => carousel.locator("img").nth(1).evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1600);
    // The wide neighbor may preload, but its ratio must not resize the selected photo's frame.
    await expect.poll(() => playerCard.evaluate((element) => Number.parseFloat(getComputedStyle(element).getPropertyValue("--player-aspect")))).toBeCloseTo(0.5, 2);
    await expect.poll(() => carousel.locator("img[src]").count()).toBeLessThanOrEqual(3);

    const audio = await waitForGalleryAudio(page);
    const currentPhoto = carousel.getByRole("group", { name: "Photo 1 of 10" }).locator("img");
    await expect(currentPhoto).toHaveCount(1);
    await currentPhoto.click({ position: { x: 20, y: 20 } });
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
    await feed.focus();
    await page.keyboard.press("Space");
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused)).toBe(true);
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime > 0)).toBe(true);
    await currentPhoto.click({ position: { x: 20, y: 20 } });
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
    await currentPhoto.click({ position: { x: 20, y: 20 } });
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused)).toBe(true);

    await activeArticle.getByRole("button", { name: "Next photo" }).click();
    await expect(counter).toHaveText("2 / 10");
    await carousel.focus();
    await page.keyboard.press("ArrowRight");
    await expect(counter).toHaveText("3 / 10");
    await page.setViewportSize({ width: 1180, height: 820 });
    await expect(counter).toHaveText("3 / 10");
    await expect(feed.locator('article[data-active="true"]')).toHaveAttribute("data-feed-video", galleryVideo.tiktokId);

    await activeArticle.getByRole("button", { name: "Next photo" }).click();
    await expect(activeArticle.getByRole("alert")).toContainText("Couldn't load photo");
    await activeArticle.getByRole("alert").getByRole("button", { name: "Try again" }).click();
    await expect.poll(() => retryRequests).toBe(2);
    await expect.poll(() => carousel.locator('img[src="https://images.e2e.test/retry.svg"]').evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1200);
    await expect(counter).toHaveText("4 / 10");
  });
});
