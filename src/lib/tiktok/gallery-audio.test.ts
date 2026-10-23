import { describe, expect, it } from "bun:test";
import { extractGalleryAudioUrl } from "./scraper";
import { galleryAudioMime, isAllowedGalleryAudioUrl } from "./gallery-audio";

describe("gallery soundtrack metadata", () => {
  it("extracts hydrated item music and imagePost music URL shapes", () => {
    expect(extractGalleryAudioUrl({ music: { playUrl: "https://p16.tiktokcdn.com/track.mp3" } }))
      .toBe("https://p16.tiktokcdn.com/track.mp3");
    expect(extractGalleryAudioUrl({ imagePost: { music: { play_url_list: ["https://p16.tiktokcdn.com/track.m4a"] } } }))
      .toBe("https://p16.tiktokcdn.com/track.m4a");
    expect(extractGalleryAudioUrl({ music: {}, imagePost: { music: { playUrl: "https://p16.tiktokcdn.com/track.mp3" } } })).toBe("https://p16.tiktokcdn.com/track.mp3");
    expect(extractGalleryAudioUrl({ music: {} })).toBeNull();
  });

  it("allows TikTok media hosts and rejects arbitrary or unsafe URLs", () => {
    expect(isAllowedGalleryAudioUrl("https://p16.tiktokcdn.com/track.mp3")).toBe(true);
    expect(isAllowedGalleryAudioUrl("http://p16.tiktokcdn.com/track.mp3")).toBe(false);
    expect(isAllowedGalleryAudioUrl("https://tiktokcdn.com.attacker.test/track.mp3")).toBe(false);
    expect(isAllowedGalleryAudioUrl("https://127.0.0.1/track.mp3")).toBe(false);
    expect(galleryAudioMime("https://p16.tiktokcdn.com/track.m4a")).toBe("audio/mp4");
  });
});
