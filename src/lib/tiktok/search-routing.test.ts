import { afterEach, expect, test } from "bun:test";
import { tiktokConfig } from "./config";
import { YtDlpProvider } from "./ytdlp";

const originalFetch = globalThis.fetch;
const originalMode = tiktokConfig.dataMode;
const originalProxy = tiktokConfig.defaultProxy;
afterEach(() => {
  globalThis.fetch = originalFetch;
  tiktokConfig.dataMode = originalMode;
  tiktokConfig.defaultProxy = originalProxy;
});

test("video searches reach the browser service as video searches instead of discarding author-only results", async () => {
  tiktokConfig.dataMode = "client";
  tiktokConfig.defaultProxy = "http://proxy.invalid:8080";
  let receivedProxy = "";
  globalThis.fetch = (async (input: string | URL | Request, options?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    expect(url.origin).toBe("http://127.0.0.1:3040");
    expect(url.searchParams.get("q")).toBe("pasta recipes");
    receivedProxy = new Headers(options?.headers).get("x-libcut-proxy") ?? "";
    // Match the service contract: omitting kind defaults to an all search,
    // which can legitimately return authors without any videos.
    const results = url.searchParams.get("kind") === "video" ? [{
      kind: "video", tiktokId: "123456789", authorUsername: "chef",
      url: "https://www.tiktok.com/@chef/video/123456789", title: "Pasta recipe",
      thumbnailUrl: null, duration: 10, viewCount: 1, likeCount: 0, commentCount: 0,
    }] : [{ kind: "author", username: "pasta" }];
    return Response.json({ results });
  }) as typeof fetch;

  const results = await new YtDlpProvider().search("pasta recipes", "video");
  expect(results).toHaveLength(1);
  expect(results[0].kind).toBe("video");
  expect(results[0].video?.tiktokId).toBe("123456789");
  expect(receivedProxy).toBe("http://proxy.invalid:8080");
});
