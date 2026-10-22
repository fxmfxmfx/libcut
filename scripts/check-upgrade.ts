import { Database } from "bun:sqlite";
import { PrismaClient } from "@prisma/client";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const directory = await mkdtemp(join(tmpdir(), "libcut-upgrade-"));
const file = join(directory, "legacy.db");
const env = { ...process.env, DATABASE_URL: `file:${file}` };
function apply(schema: string) {
  const result = spawnSync("bunx", ["prisma", "db", "push", "--schema", schema, "--skip-generate"], { env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
try {
  const current = await readFile("prisma/schema.prisma", "utf8");
  const old = current.replace(/^.*metadataFetchedAt.*\n/m, "");
  const legacy = join(directory, "legacy.prisma");
  await writeFile(legacy, old);
  apply(legacy);
  const sqlite = new Database(file);
  try {
    sqlite.exec(`INSERT INTO Author (id, username, subscribed, updatedAt) VALUES ('legacy-author', 'legacy.creator', 1, CURRENT_TIMESTAMP);
      INSERT INTO Video (id, tiktokId, authorId, url, seen) VALUES ('legacy-video', '123456789', 'legacy-author', 'https://www.tiktok.com/@legacy.creator/video/123456789', 1);
      INSERT INTO Favorite (id, videoId) VALUES ('legacy-favorite', 'legacy-video');
      INSERT INTO Setting (key, value, updatedAt) VALUES ('theme', 'nord', CURRENT_TIMESTAMP);`);
  } finally { sqlite.close(); }
  apply("prisma/schema.prisma");
  const prisma = new PrismaClient({ datasourceUrl: `file:${file}` });
  try {
    const video = await prisma.video.findUniqueOrThrow({ where: { id: "legacy-video" }, include: { author: true, favorites: true } });
    const setting = await prisma.setting.findUniqueOrThrow({ where: { key: "theme" } });
    if (!video.seen || !video.author.subscribed || video.favorites.length !== 1 || setting.value !== "nord" || video.metadataFetchedAt !== null) throw new Error("Upgrade did not preserve legacy data");
    console.log("SQLite upgrade preserved subscriptions, watched state, favorites, and settings.");
  } finally { await prisma.$disconnect(); }
} finally { await rm(directory, { recursive: true, force: true }); }
