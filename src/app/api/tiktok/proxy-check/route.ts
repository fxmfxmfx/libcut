import { execFile } from "child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getEffectiveProxy, tiktokConfig } from "@/lib/tiktok/config";

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

function redactProxyDetails(message: string, proxy: string): string {
  const exact = proxy ? message.split(proxy).join("[configured proxy]") : message;
  return exact.replace(/((?:socks5h?|https?):\/\/)[^/\s]*@/gi, "$1[redacted]@");
}

/** GET /api/tiktok/proxy-check */
export async function GET() {
  if (tiktokConfig.dataMode === "client") {
    return NextResponse.json({
      ok: false,
      proxy: null,
      error: "Proxy checks are unavailable in client data mode",
    });
  }

  const proxy = await getEffectiveProxy();
  if (!proxy) {
    return NextResponse.json({ ok: false, proxy: null, error: "No proxy configured" });
  }

  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-sL",
        "--max-time", "15",
        "-o", "/dev/null",
        "-w", "%{http_code}",
        "--proxy", proxy,
        "https://www.tiktok.com/",
      ],
      { timeout: 20_000, encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    const httpCode = Number.parseInt(String(stdout).trim(), 10);
    if (httpCode > 0 && httpCode < 400) {
      return NextResponse.json({ ok: true, proxy: "configured", error: null });
    }
    return NextResponse.json({
      ok: false,
      proxy: "configured",
      error: `TikTok returned HTTP ${Number.isFinite(httpCode) ? httpCode : 0}`,
    });
  } catch (error: any) {
    const message = redactProxyDetails(String(error?.message ?? ""), proxy);
    const timedOut = error?.code === "ETIMEDOUT" || /timed out|timeout/i.test(message);
    return NextResponse.json({
      ok: false,
      proxy: "configured",
      error: timedOut ? "Proxy connection timed out" : "Proxy connection failed",
    });
  }
}
