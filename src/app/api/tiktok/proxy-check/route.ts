import { NextResponse } from "next/server";
import { getEffectiveProxy } from "@/lib/tiktok/config";
import { execFileSync } from "child_process";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/proxy-check
 * Tests if the configured SOCKS5 proxy is working by making a request to
 * TikTok through it. Returns { ok, proxy, error }.
 */
export async function GET() {
  const proxy = await getEffectiveProxy();
  if (!proxy) {
    return NextResponse.json({ ok: false, proxy: null, error: "No proxy configured" });
  }

  try {
    // Use curl to test the proxy — try to reach tiktok.com
    const proxyArg = proxy.startsWith("socks5")
      ? ["--socks5", proxy.replace(/^socks5:\/\//, "").replace(/^socks5h:\/\//, "")]
      : ["--proxy", proxy];
    const args = [
      "-sL",
      "--max-time", "15",
      "-o", "/dev/null",
      "-w", "%{http_code}",
      ...proxyArg,
      "https://www.tiktok.com/",
    ];
    const result = execFileSync("curl", args, { timeout: 20_000, encoding: "utf8" }).trim();
    const httpCode = parseInt(result, 10);
    if (httpCode > 0 && httpCode < 400) {
      return NextResponse.json({ ok: true, proxy: "configured", error: null });
    }
    return NextResponse.json({ ok: false, proxy: "configured", error: `TikTok returned HTTP ${httpCode}` });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      proxy: "configured",
      error: e?.message?.includes("timed out") ? "Proxy connection timed out" : (e?.message ?? "Proxy connection failed"),
    });
  }
}
