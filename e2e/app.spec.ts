import { test, expect } from "@playwright/test";

test("search returns playable videos, mobile comments scroll, downloads support ranges", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("textbox").fill("city.cookhouse");
  await expect(page.getByRole("heading", { name: "AUTHORS (1)" })).toBeVisible();
  await page.getByRole("button", { name: /@city.cookhouse/ }).first().click();
  const card = page.locator('[role="button"]').filter({ has: page.locator(".video-portrait") }).first();
  await expect(card).toBeVisible();
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(dialog.locator("ul").first()).toBeVisible();
  const overflow = await dialog.evaluate((element) => ({ width: element.scrollWidth > innerWidth, height: element.getBoundingClientRect().height > innerHeight + 1 }));
  expect(overflow).toEqual({ width: false, height: false });
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
  await page.getByRole("textbox").fill("city.cookhouse");
  await expect(page.getByRole("heading", { name: "AUTHORS (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Subscribe", exact: true }).click();
  await expect(page.getByRole("heading", { name: "City Cookhouse", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("switch")).not.toBeChecked();
  await expect(page.locator("#css")).toHaveValue(".e2e-test { color: red; }");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "nord");
  const card = page.locator('[role="button"]').filter({ has: page.locator(".video-portrait") }).first();
  await card.click();
  const dialog = page.getByRole("dialog");
  const beforeMark = authorRequests.length;
  await dialog.getByRole("button", { name: "Mark watched", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Mark as new", exact: true })).toBeVisible();
  expect(authorRequests).toHaveLength(beforeMark);
  await dialog.getByRole("button", { name: "Favorite", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Favorited", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("libcut-client-data")!).state);
  expect(saved.subscriptions).toHaveLength(1);
  expect(saved.favorites).toHaveLength(1);
  expect(saved.seenVideoIds).toContain(saved.favorites[0].tiktokId);
  await expect(page.getByRole("heading", { name: "Feed", exact: true })).toBeVisible();
  await expect.poll(async () => (await page.locator('[role="button"]').filter({ has: page.locator(".video-portrait") }).allTextContents()).some((title) => title.includes(saved.favorites[0].title))).toBe(false);
  expect(personalRequests).toEqual([]);
  for (const endpoint of ["feed", "favorites", "subscriptions"]) expect((await request.get(`/api/tiktok/${endpoint}`)).status()).toBe(403);
  expect((await request.patch("/api/tiktok/settings", { data: { theme: "light" } })).status()).toBe(403);
  expect((await request.delete("/api/tiktok/clear-data")).status()).toBe(403);
});


test("client tabs synchronize preferences and clearing without restoring removed data", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "client");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Feed", exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByRole("heading", { name: "Feed", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Nord", exact: true }).click();
  await expect(other.locator("html")).toHaveAttribute("data-theme", "nord");
  const profile = await (await page.request.get("/api/tiktok/authors/city.cookhouse")).json();
  await page.evaluate((author) => localStorage.setItem("libcut-client-data", JSON.stringify({ version: 2, state: {
    subscriptions: [{ username: author.username.toUpperCase(), displayName: author.displayName, avatarUrl: author.avatarUrl, description: author.description, followerCount: author.followerCount, subscribedAt: Date.now() }],
    favorites: [], seenVideoIds: [],
  } })), profile.author);
  await expect(other.locator('[role="button"]').filter({ has: other.locator(".video-portrait") }).first()).toBeVisible();
  await other.getByRole("button", { name: "@city.cookhouse", exact: true }).first().click();
  await expect(other.getByRole("button", { name: "Unsubscribe", exact: true })).toBeVisible();
  await other.getByRole("button", { name: "Feed", exact: true }).click();
  await page.evaluate(() => localStorage.removeItem("libcut-client-data"));
  await expect(other.getByRole("button", { name: "Find creators", exact: true })).toBeVisible();
  expect(await other.evaluate(() => localStorage.getItem("libcut-client-data"))).toBeNull();
  await other.close();
});
