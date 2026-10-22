import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { demoLocalPathForUrl } from "./demo";

test("demo samples resolve independently of the configured temporary cache directory", () => {
  const previous = process.env.TIKTOK_CACHE_DIR;
  process.env.TIKTOK_CACHE_DIR = "/tmp/libcut-custom-cache";
  try {
    const path = demoLocalPathForUrl("/demo-videos/v0.mp4");
    expect(path).toBe(join(process.cwd(), "public/demo-videos/v0.mp4"));
    expect(existsSync(path)).toBe(true);
    expect(() => demoLocalPathForUrl("/../.env")).toThrow();
  } finally {
    if (previous === undefined) delete process.env.TIKTOK_CACHE_DIR;
    else process.env.TIKTOK_CACHE_DIR = previous;
  }
});
