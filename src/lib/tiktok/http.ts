/** Small helpers for Next.js route handlers. */
import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorJson(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

/** Format a TikTok username/handle into a clean handle (no @). */
export function cleanUsername(input: string): string {
  return input.trim().replace(/^@/, "").split("/").filter(Boolean).pop() ?? "";
}
