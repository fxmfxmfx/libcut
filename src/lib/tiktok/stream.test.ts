import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { streamLocalFile } from "./stream";

describe("streamLocalFile", () => {
  let directory: string;
  let filePath: string;
  const bytes = Buffer.from("0123456789", "utf8");

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "libcut-stream-"));
    filePath = join(directory, "video.mp4");
    await writeFile(filePath, bytes);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function request(range?: string): Request {
    return new Request("http://localhost/video", {
      headers: range ? { Range: range } : undefined,
    });
  }

  test("serves the full file with byte streaming headers", async () => {
    const response = await streamLocalFile(filePath, request() as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Length")).toBe(String(bytes.length));
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  test("serves a bounded range with the exact byte interval", async () => {
    const response = await streamLocalFile(filePath, request("bytes=2-5") as never);

    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(response.headers.get("Content-Length")).toBe("4");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes.subarray(2, 6));
  });

  test("supports suffix and open-ended ranges", async () => {
    const suffix = await streamLocalFile(filePath, request("bytes=-3") as never);
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get("Content-Range")).toBe("bytes 7-9/10");
    expect(Buffer.from(await suffix.arrayBuffer())).toEqual(bytes.subarray(7));

    const openEnded = await streamLocalFile(filePath, request("bytes=6-") as never);
    expect(openEnded.status).toBe(206);
    expect(openEnded.headers.get("Content-Range")).toBe("bytes 6-9/10");
    expect(Buffer.from(await openEnded.arrayBuffer())).toEqual(bytes.subarray(6));
  });

  test("returns 416 for unsatisfiable and malformed ranges", async () => {
    for (const range of ["bytes=10-", "bytes=5-2", "bytes=-0", "bytes=1-2,4-5", "items=1-2", "bytes=oops"]) {
      const response = await streamLocalFile(filePath, request(range) as never);
      expect(response.status).toBe(416);
      expect(response.headers.get("Content-Range")).toBe("bytes */10");
      expect(response.headers.get("Content-Length")).toBe("0");
      expect(await response.arrayBuffer()).toHaveLength(0);
    }
  });

  test("returns 404 when the local file is missing", async () => {
    const response = await streamLocalFile(join(directory, "missing.mp4"), request() as never);
    expect(response.status).toBe(404);
  });

  test("encodes Unicode attachment filenames and strips header injection", async () => {
    const response = await streamLocalFile(filePath, request() as never, {
      asAttachment: true,
      filename: "Видео\r\nX-Evil: yes\"\\clip.mp4",
    });

    expect(response.status).toBe(200);
    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition.startsWith("attachment;")).toBe(true);
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain("%D0%92%D0%B8%D0%B4%D0%B5%D0%BE");
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(await readFile(filePath));
  });
});
