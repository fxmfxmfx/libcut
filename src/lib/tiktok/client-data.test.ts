import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  exportClientBackup,
  getUnreadableClientDataRaw,
  resetClientDataFromStorage,
  useClientData,
  validateClientBackup,
  type ClientFavorite,
} from "./client-data";
import { getLocalStorageError } from "./store";
import { demoDataset } from "./demo";

const scratch = mkdtempSync(join(tmpdir(), "libcut-client-storage-"));
let failReads = false;
let failWrites = false;

function storagePath(key: string) {
  return join(scratch, encodeURIComponent(key));
}

const localStorageMock = {
  getItem(key: string) {
    if (failReads) throw new Error("blocked storage");
    try {
      return readFileSync(storagePath(key), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },
  setItem(key: string, value: string) {
    if (failWrites) throw new Error("blocked storage");
    writeFileSync(storagePath(key), value, "utf8");
  },
  removeItem(key: string) {
    try {
      rmSync(storagePath(key));
    } catch {
      // Missing keys match localStorage behavior.
    }
  },
};

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: localStorageMock, dispatchEvent: () => true },
});

const favorite: ClientFavorite = {
  videoId: "db-row-old",
  tiktokId: "123456789",
  url: "https://www.tiktok.com/@creator/video/123456789",
  title: "Photo post",
  thumbnailUrl: "https://example.test/cover.jpg",
  duration: 0,
  authorUsername: "creator",
  authorDisplayName: "Creator",
  authorAvatarUrl: null,
  favoritedAt: 100,
  isGallery: true,
  images: ["https://example.test/slide.jpg"],
};

function resetStore() {
  failReads = false;
  failWrites = false;
  localStorageMock.removeItem("libcut-client-data");
  useClientData.setState({ subscriptions: [], favorites: [], seenVideoIds: [] });
}

describe("client data persistence and identity", () => {
  beforeEach(resetStore);
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it("migrates the legacy persisted shape and keeps old favorites valid", async () => {
    const oldState = {
      subscriptions: [{ username: "creator", displayName: "Creator", avatarUrl: null, description: null, followerCount: 2, subscribedAt: 50 }],
      favorites: [{ ...favorite, isGallery: undefined, images: undefined }],
      seenVideoIds: ["legacy-db-video-id"],
    };
    writeFileSync(storagePath("libcut-client-data"), JSON.stringify({ state: oldState, version: 0 }), "utf8");

    await useClientData.persist.rehydrate();

    expect(useClientData.getState().subscriptions[0]?.username).toBe("creator");
    expect(useClientData.getState().favorites[0]?.videoId).toBe("db-row-old");
    expect(useClientData.getState().favorites[0]?.images).toBeUndefined();
    expect(useClientData.getState().seenVideoIds).toEqual(["legacy-db-video-id"]);
  });

  it("matches seen and favorite state by stable TikTok identity after DB IDs change", () => {
    useClientData.getState().markSeen("db-row-old", "123456789");
    useClientData.getState().addFavorite(favorite);

    expect(useClientData.getState().isSeen("db-row-new", "123456789")).toBe(true);
    expect(useClientData.getState().isFavorited("db-row-new", "123456789")).toBe(true);
    useClientData.getState().removeFavorite("db-row-new", "123456789");
    expect(useClientData.getState().isFavorited("db-row-old", "123456789")).toBe(false);
  });

  it("rehydrates demo subscriptions and favorites with inline image data", async () => {
    const author = demoDataset.authors[0]!.profile;
    const video = demoDataset.authors[0]!.videos[0]!;
    useClientData.getState().subscribe({
      username: author.username,
      displayName: author.displayName,
      avatarUrl: author.avatarUrl,
      description: author.description,
      followerCount: author.followerCount,
      subscribedAt: 100,
    });
    useClientData.getState().addFavorite({
      videoId: "demo-db-row",
      tiktokId: video.tiktokId,
      url: video.url,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration,
      authorUsername: author.username,
      authorDisplayName: author.displayName,
      authorAvatarUrl: author.avatarUrl,
      favoritedAt: 101,
    });

    await useClientData.persist.rehydrate();

    expect(useClientData.getState().subscriptions[0]?.avatarUrl).toStartWith("data:image/svg+xml,");
    expect(useClientData.getState().favorites[0]?.thumbnailUrl).toStartWith("data:image/svg+xml,");
    expect(useClientData.getState().favorites[0]?.authorAvatarUrl).toStartWith("data:image/svg+xml,");
    expect(getUnreadableClientDataRaw()).toBeNull();
    expect(getLocalStorageError()).toBeNull();

    const backup = exportClientBackup({ lang: "en", theme: "default", accent: "#fe2c55", customCss: "", autoMarkSeen: true });
    expect(validateClientBackup({ ...backup, favorites: [{ ...backup.favorites[0]!, url: "data:image/svg+xml,%3Csvg%3E" }] })).toBe(false);
  });

  it("marks a batch of videos seen and keeps both their legacy and stable IDs", () => {
    useClientData.getState().markSeenMany([
      { videoId: "db-a", tiktokId: "12345" },
      { videoId: "db-b", tiktokId: "67890" },
    ]);

    expect(useClientData.getState().isSeen("db-a", "12345")).toBe(true);
    expect(useClientData.getState().isSeen("new-db-a", "12345")).toBe(true);
    expect(useClientData.getState().seenVideoIds).toEqual(["db-a", "12345", "db-b", "67890"]);
  });

  it("rejects malformed or unsupported backups without changing stored client data", () => {
    useClientData.getState().subscribe({ username: "keep-me", displayName: null, avatarUrl: null, description: null, followerCount: 0, subscribedAt: 1 });
    const before = useClientData.getState().subscriptions;

    expect(validateClientBackup({ schemaVersion: 2, subscriptions: [], favorites: [], seenVideoIds: [], preferences: {} })).toBe(false);
    expect(validateClientBackup({ schemaVersion: 1, subscriptions: [{ username: 4 }], favorites: [], seenVideoIds: [], preferences: {} })).toBe(false);
    const valid = exportClientBackup({ lang: "en", theme: "nord", accent: "#fe2c55", customCss: "", autoMarkSeen: true });
    expect(validateClientBackup({ ...valid, subscriptions: [{ ...valid.subscriptions[0], username: "bad handle" }] })).toBe(false);
    expect(validateClientBackup({ ...valid, preferences: { ...valid.preferences, theme: "data:text/html" } })).toBe(false);
    expect(validateClientBackup({ ...valid, preferences: { ...valid.preferences, accent: "red" } })).toBe(false);
    expect(validateClientBackup({ ...valid, preferences: { ...valid.preferences, customCss: "@import url(https://bad.test/a.css);" } })).toBe(false);
    expect(validateClientBackup({ ...valid, favorites: [{ ...favorite, viewCount: Number.POSITIVE_INFINITY }] })).toBe(false);
    expect(validateClientBackup({ ...valid, favorites: [{ ...favorite, publishedAt: "not-a-date" }] })).toBe(false);
    expect(useClientData.getState().subscriptions).toEqual(before);
  });

  it("exports a versioned backup with client data and validates it", () => {
    useClientData.getState().addFavorite(favorite);
    const backup = exportClientBackup({ lang: "en", theme: "nord", accent: "#fe2c55", customCss: "", autoMarkSeen: false });

    expect(backup.schemaVersion).toBe(1);
    expect(validateClientBackup(backup)).toBe(true);
    expect(backup.favorites[0]?.images).toEqual(favorite.images);
  });

  it("reports blocked browser storage and leaves prior persisted bytes intact", () => {
    const previous = JSON.stringify({ state: { subscriptions: [], favorites: [], seenVideoIds: [] }, version: 2 });
    writeFileSync(storagePath("libcut-client-data"), previous, "utf8");
    failWrites = true;

    useClientData.getState().markSeen("db-id", "tt-id");

    expect(getLocalStorageError()).toContain("Browser storage is unavailable");
    expect(readFileSync(storagePath("libcut-client-data"), "utf8")).toBe(previous);
  });

  it("validates persisted row shapes and exposes damaged raw data for recovery export", async () => {
    const damaged = JSON.stringify({
      state: { subscriptions: [{ username: null }], favorites: [], seenVideoIds: [] },
      version: 2,
    });
    writeFileSync(storagePath("libcut-client-data"), damaged, "utf8");

    await useClientData.persist.rehydrate();

    expect(getUnreadableClientDataRaw()).toBe(damaged);
    expect(useClientData.getState().subscriptions).toEqual([]);
    expect(getLocalStorageError()).toContain("damaged");
  });

  it("rehydrates externally repaired bytes and clears the damaged-storage state", async () => {
    const damaged = JSON.stringify({ state: { subscriptions: [{ username: null }], favorites: [], seenVideoIds: [] }, version: 2 });
    writeFileSync(storagePath("libcut-client-data"), damaged, "utf8");
    await useClientData.persist.rehydrate();
    expect(getUnreadableClientDataRaw()).toBe(damaged);
    expect(getLocalStorageError("clientData")).toContain("damaged");

    const repaired = {
      state: {
        subscriptions: [{ username: "repaired", displayName: null, avatarUrl: null, description: null, followerCount: 1, subscribedAt: 2 }],
        favorites: [],
        seenVideoIds: ["123456"],
      },
      version: 2,
    };
    writeFileSync(storagePath("libcut-client-data"), JSON.stringify(repaired), "utf8");
    await useClientData.persist.rehydrate();

    expect(useClientData.getState().subscriptions[0]?.username).toBe("repaired");
    expect(useClientData.getState().seenVideoIds).toEqual(["123456"]);
    expect(getUnreadableClientDataRaw()).toBeNull();
    expect(getLocalStorageError("clientData")).toBeNull();
  });

  it("resets memory after external storage removal without recreating the key", () => {
    useClientData.getState().subscribe({ username: "remove-me", displayName: null, avatarUrl: null, description: null, followerCount: 0, subscribedAt: 1 });
    localStorageMock.removeItem("libcut-client-data");

    resetClientDataFromStorage();

    expect(useClientData.getState().subscriptions).toEqual([]);
    expect(localStorageMock.getItem("libcut-client-data")).toBeNull();
  });
});
