import { afterEach, describe, expect, test } from "bun:test";
import { execFile as execFileCallback, spawnSync } from "node:child_process";
import { mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ensureNormalizedFile } from "./normalize";

const execFile = promisify(execFileCallback);
const mediaToolsAvailable = ["ffmpeg", "ffprobe"].every(
  (tool) => spawnSync(tool, ["-version"], { stdio: "ignore" }).status === 0,
);
const mediaTest = mediaToolsAvailable ? test : test.skip;
let directory = "";

async function makeVideo(filePath: string, withAudio: boolean, gain?: number) {
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `color=c=blue:s=64x64:r=24:d=${gain === undefined ? 0.5 : 3}`,
  ];
  if (withAudio) args.push("-f", "lavfi", "-i", `sine=frequency=800:sample_rate=44100:duration=${gain === undefined ? 0.5 : 3}`);
  args.push("-shortest", "-c:v", "mpeg4");
  if (withAudio) args.push("-c:a", "aac");
  if (gain !== undefined) args.push("-af", `volume=${gain}`);
  args.push(filePath);
  await execFile("ffmpeg", args, { maxBuffer: 1024 * 1024 });
}

async function probe(filePath: string) {
  const { stdout } = await execFile("ffprobe", [
    "-v", "error", "-show_entries", "stream=codec_type,codec_name,sample_rate",
    "-of", "json", filePath,
  ], { maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout) as { streams: Array<{ codec_type: string; codec_name: string; sample_rate?: string }> };
}

describe("ensureNormalizedFile", () => {
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = "";
  });

  mediaTest("normalizes audio, copies video, coalesces requests, and reuses fresh output", async () => {
    directory = await mkdtemp(join(tmpdir(), "libcut-normalize-"));
    const source = join(directory, "source.mp4");
    const output = join(directory, "cache", "source.normalized.mp4");
    await makeVideo(source, true);
    const sourceStat = await stat(source);

    const results = await Promise.all([
      ensureNormalizedFile(source, output),
      ensureNormalizedFile(source, output),
    ]);
    expect(results).toEqual([output, output]);
    expect((await stat(source)).mtimeMs).toBe(sourceStat.mtimeMs);

    const streams = (await probe(output)).streams;
    expect(streams.find((stream) => stream.codec_type === "video")?.codec_name).toBe("mpeg4");
    expect(streams.find((stream) => stream.codec_type === "audio")?.codec_name).toBe("aac");
    expect(streams.find((stream) => stream.codec_type === "audio")?.sample_rate).toBe("48000");

    const outputStat = await stat(output);
    expect(await ensureNormalizedFile(source, output)).toBe(output);
    expect((await stat(output)).mtimeMs).toBe(outputStat.mtimeMs);
  });

  mediaTest("brings quiet and loud clips to similar loudness without clipping", async () => {
    directory = await mkdtemp(join(tmpdir(), "libcut-normalize-levels-"));
    const quiet = join(directory, "quiet.mp4");
    const loud = join(directory, "loud.mp4");
    await makeVideo(quiet, true, 0.04);
    await makeVideo(loud, true, 4);
    async function loudness(file: string) {
      const { stderr } = await execFile("ffmpeg", [
        "-hide_banner", "-i", file, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-",
      ], { maxBuffer: 1024 * 1024 });
      const stats = JSON.parse(stderr.match(/\{\s*"input_i"[\s\S]+?\}/)![0]);
      return { integrated: Number(stats.input_i), peak: Number(stats.input_tp) };
    }
    const quietBefore = await loudness(quiet);
    const loudBefore = await loudness(loud);
    expect(loudBefore.integrated - quietBefore.integrated).toBeGreaterThan(30);
    const quietAfter = await loudness(await ensureNormalizedFile(quiet));
    const loudAfter = await loudness(await ensureNormalizedFile(loud));
    expect(Math.abs(quietAfter.integrated - loudAfter.integrated)).toBeLessThan(2);
    expect(Math.abs(quietAfter.integrated + 16)).toBeLessThan(2);
    expect(Math.abs(loudAfter.integrated + 16)).toBeLessThan(2);
    expect(Math.max(quietAfter.peak, loudAfter.peak)).toBeLessThan(0);
  });

  mediaTest("preserves video-only inputs and uses the default normalized filename", async () => {
    directory = await mkdtemp(join(tmpdir(), "libcut-normalize-no-audio-"));
    const source = join(directory, "silent.mp4");
    await makeVideo(source, false);

    const normalized = await ensureNormalizedFile(source);
    expect(normalized).toBe(join(directory, "silent.normalized.mp4"));
    const streams = (await probe(normalized)).streams;
    expect(streams.map((stream) => stream.codec_type)).toEqual(["video"]);
  });

  mediaTest("rebuilds a normalized file when the cached copy is stale", async () => {
    directory = await mkdtemp(join(tmpdir(), "libcut-normalize-stale-"));
    const source = join(directory, "source.mp4");
    const output = join(directory, "source.normalized.mp4");
    await makeVideo(source, true);
    await Bun.write(output, "stale output");
    const sourceStat = await stat(source);
    const staleTime = new Date(Math.max(0, sourceStat.mtimeMs - 10_000));
    await utimes(output, staleTime, staleTime);

    expect(await ensureNormalizedFile(source)).toBe(output);
    expect((await stat(output)).size).toBeGreaterThan(0);
    expect((await probe(output)).streams.some((stream) => stream.codec_type === "audio")).toBe(true);
  });
});
