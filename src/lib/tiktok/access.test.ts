import { expect, test } from "bun:test";
import { requireLocalMode, requireSameOrigin } from "./access";
import { tiktokConfig } from "./config";

test("mutation guards reject foreign and malformed browser origins", () => {
  for (const origin of ["https://evil.example", "null", "malformed"]) {
    expect(requireSameOrigin(new Request("http://libcut.local:3000/api", { headers: { origin } }))?.status).toBe(403);
  }
  expect(requireSameOrigin(new Request("http://libcut.local:3000/api", { headers: { origin: "http://libcut.local:3000", "sec-fetch-site": "cross-site" } }))?.status).toBe(403);
});

test("mutation guards accept own origin including reverse proxies and CLI clients", () => {
  expect(requireSameOrigin(new Request("http://127.0.0.1:3000/api", { headers: { host: "libcut.example", origin: "https://libcut.example" } }))).toBeNull();
  expect(requireSameOrigin(new Request("http://libcut.local:3000/api", { headers: { origin: "http://libcut.local:3000" } }))).toBeNull();
  expect(requireSameOrigin(new Request("http://libcut.local:3000/api"))).toBeNull();
});

test("client instances deny server personal data regardless of request origin", () => {
  const previous = tiktokConfig.dataMode;
  try {
    tiktokConfig.dataMode = "client";
    expect(requireLocalMode()?.status).toBe(403);
    tiktokConfig.dataMode = "local";
    expect(requireLocalMode()).toBeNull();
  } finally { tiktokConfig.dataMode = previous; }
});
