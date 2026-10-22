import { describe, expect, test } from "bun:test";
import { boundedInt, canonicalVideoUrl, cleanUsername } from "./http";

describe("cleanUsername", () => {
  test("normalizes handles and canonical TikTok profile URLs", () => {
    expect(cleanUsername(" @Example.Name ")).toBe("example.name");
    expect(cleanUsername("https://www.tiktok.com/@Example_Name?lang=en")).toBe("example_name");
  });

  test("rejects malformed handles and non-canonical profile URLs", () => {
    for (const value of [
      "",
      "@-invalid",
      "name with spaces",
      "https://evil.example/@creator",
      "http://www.tiktok.com/@creator",
      "https://www.tiktok.com:444/@creator",
      "https://user:pass@www.tiktok.com/@creator",
    ]) {
      expect(cleanUsername(value)).toBe("");
    }
  });
});

describe("canonicalVideoUrl", () => {
  test("normalizes valid HTTPS video and photo URLs", () => {
    expect(canonicalVideoUrl("https://www.tiktok.com/@Creator/video/123456?lang=en"))
      .toBe("https://www.tiktok.com/@Creator/video/123456");
    expect(canonicalVideoUrl("https://tiktok.com/@creator.photo/photo/987654/"))
      .toBe("https://www.tiktok.com/@creator.photo/photo/987654");
  });

  test("rejects non-TikTok hosts, credentials, ports, protocols, and invalid IDs", () => {
    for (const value of [
      "https://tiktok.com.evil.example/@creator/video/123",
      "https://evil.example/@creator/video/123",
      "https://user:pass@www.tiktok.com/@creator/video/123",
      "https://www.tiktok.com:444/@creator/video/123",
      "http://www.tiktok.com/@creator/video/123",
      "https://www.tiktok.com/@creator/video/not-a-number",
      "https://www.tiktok.com/@creator/live/123",
    ]) {
      expect(canonicalVideoUrl(value)).toBeNull();
    }
  });
});

describe("boundedInt", () => {
  test("clamps and floors finite values", () => {
    expect(boundedInt("-2", 30, 1, 100)).toBe(1);
    expect(boundedInt("125", 30, 1, 100)).toBe(100);
    expect(boundedInt("3.9", 30, 1, 100)).toBe(3);
  });

  test("uses the fallback for missing and non-finite values", () => {
    expect(boundedInt(null, 30, 1, 100)).toBe(30);
    expect(boundedInt("Infinity", 30, 1, 100)).toBe(30);
    expect(boundedInt("NaN", 30, 1, 100)).toBe(30);
  });
});
