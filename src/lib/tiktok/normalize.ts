/** Create and cache an AAC loudness-normalized copy of a local video. */

import { randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const NORMALIZE_TIMEOUT_MS = 60_000;
const QUEUE_TIMEOUT_MS = 15_000;
const MAX_DIAGNOSTIC_BYTES = 1024 * 1024;
const MAX_QUEUED_NORMALIZATIONS = 10;

const pending = new Map<string, Promise<string>>();
let active = false;
const waiters: Array<() => void> = [];

function outputPathFor(originalPath: string, requestedPath?: string): string {
  const resolvedOriginal = path.resolve(originalPath);
  const resolvedOutput = path.resolve(
    requestedPath ?? resolvedOriginal.replace(/\.mp4$/i, ".normalized.mp4"),
  );
  if (resolvedOriginal === resolvedOutput) {
    throw new Error("Audio normalization output must differ from the source video.");
  }
  return resolvedOutput;
}

async function statFile(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

async function isFresh(outputPath: string, sourceMtimeMs: number): Promise<boolean> {
  const outputStat = await statFile(outputPath);
  return !!outputStat && outputStat.size > 0 && outputStat.mtimeMs >= sourceMtimeMs;
}

async function acquireSlot(): Promise<() => void> {
  if (!active) {
    active = true;
  } else {
    if (waiters.length >= MAX_QUEUED_NORMALIZATIONS) {
      throw new Error("Audio normalization queue is full. Try again shortly.");
    }
    await new Promise<void>((resolve, reject) => {
      const next = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        const index = waiters.indexOf(next);
        if (index !== -1) waiters.splice(index, 1);
        reject(new Error("Audio normalization is busy. Try again shortly."));
      }, QUEUE_TIMEOUT_MS);
      waiters.push(next);
    });
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = waiters.shift();
    if (next) next();
    else active = false;
  };
}

async function normalize(sourcePath: string, targetPath: string): Promise<string> {
  const initialSourceStat = await statFile(sourcePath);
  if (!initialSourceStat || initialSourceStat.size === 0) {
    throw new Error("The source video is unavailable for audio normalization.");
  }
  if (await isFresh(targetPath, initialSourceStat.mtimeMs)) return targetPath;

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${randomUUID()}.tmp.mp4`,
  );
  try {
    await execFile(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-nostdin",
        "-i", sourcePath,
        "-map", "0:v:0",
        "-map", "0:a?",
        "-c:v", "copy",
        "-c:a", "aac",
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ar", "48000",
        "-movflags", "+faststart",
        temporaryPath,
      ],
      {
        timeout: NORMALIZE_TIMEOUT_MS,
        maxBuffer: MAX_DIAGNOSTIC_BYTES,
        encoding: "utf8",
        windowsHide: true,
      },
    );

    const [outputStat, finalSourceStat] = await Promise.all([
      statFile(temporaryPath),
      statFile(sourcePath),
    ]);
    if (!outputStat || outputStat.size === 0) {
      throw new Error("Audio normalization produced an empty video.");
    }
    if (
      !finalSourceStat ||
      finalSourceStat.size !== initialSourceStat.size ||
      finalSourceStat.mtimeMs !== initialSourceStat.mtimeMs
    ) {
      throw new Error("The source video changed during audio normalization.");
    }
    if (outputStat.mtimeMs < finalSourceStat.mtimeMs) {
      throw new Error("Audio normalization output is older than its source video.");
    }

    await fs.rename(temporaryPath, targetPath);
    return targetPath;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("The source video")) throw error;
    if (error instanceof Error && error.message.startsWith("Audio normalization produced")) throw error;
    if (error instanceof Error && error.message.startsWith("Audio normalization output")) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ETIMEDOUT") {
      throw new Error("Audio normalization timed out.");
    }
    throw new Error("Audio normalization failed. Check that FFmpeg is installed and the video is playable.");
  } finally {
    await fs.unlink(temporaryPath).catch(() => {});
  }
}

/**
 * Return a fresh normalized copy, coalescing concurrent requests for the same
 * output. The source file is never modified.
 */
export async function ensureNormalizedFile(
  originalPath: string,
  requestedOutputPath?: string,
): Promise<string> {
  const sourcePath = path.resolve(originalPath);
  const targetPath = outputPathFor(sourcePath, requestedOutputPath);
  const sourceStat = await statFile(sourcePath);
  if (!sourceStat || sourceStat.size === 0) {
    throw new Error("The source video is unavailable for audio normalization.");
  }
  if (await isFresh(targetPath, sourceStat.mtimeMs)) return targetPath;

  const existing = pending.get(targetPath);
  if (existing) return existing;

  const task = (async () => {
    const release = await acquireSlot();
    try {
      const currentSourceStat = await statFile(sourcePath);
      if (!currentSourceStat || currentSourceStat.size === 0) {
        throw new Error("The source video is unavailable for audio normalization.");
      }
      if (await isFresh(targetPath, currentSourceStat.mtimeMs)) return targetPath;
      return await normalize(sourcePath, targetPath);
    } finally {
      release();
    }
  })().finally(() => {
    if (pending.get(targetPath) === task) pending.delete(targetPath);
  });
  pending.set(targetPath, task);
  return task;
}
