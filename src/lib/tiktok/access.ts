import { errorJson } from "./http";
import { tiktokConfig } from "./config";

/** Reject browser requests initiated from a different site before a mutation. */
export function requireSameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return errorJson("Cross-origin changes are not allowed", 403);
  const origin = request.headers.get("origin");
  if (!origin) return null; // CLI clients do not send Origin.
  try {
    const source = new URL(origin);
    const target = new URL(request.url);
    const host = request.headers.get("host") ?? target.host;
    if (source.host === host && ["https:", "http:"].includes(source.protocol)) return null;
  } catch { /* malformed Origin is rejected below */ }
  return errorJson("Cross-origin changes are not allowed", 403);
}

/** Personal server data is never available through a client-mode instance. */
export function requireLocalMode(request?: Request) {
  if (tiktokConfig.dataMode === "client") return errorJson("Personal data is stored in your browser in client mode", 403, "client_mode");
  return request ? requireSameOrigin(request) : null;
}
