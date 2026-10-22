import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const [mode, port] = process.argv.slice(2);
if (!["local", "client"].includes(mode) || !/^\d+$/.test(port)) throw new Error("Usage: e2e-server.mjs local|client PORT");
const directory = await mkdtemp(join(tmpdir(), `libcut-e2e-${mode}-`));
const env = { ...process.env, DATABASE_URL: `file:${join(directory, "app.db")}`, TIKTOK_CACHE_DIR: join(directory, "cache"), DATA_MODE: mode, DEMO_MODE: "true", TIKTOK_PROXY: "", PORT: port, HOSTNAME: "127.0.0.1", NEXT_TELEMETRY_DISABLED: "1" };
const setup = spawn("bun", ["run", "db:push", "--skip-generate"], { env, stdio: "inherit" });
const code = await new Promise((resolve) => setup.once("exit", resolve));
if (code !== 0) { await rm(directory, { recursive: true, force: true }); process.exit(1); }
const child = spawn(process.execPath, [".next/standalone/server.js"], { env, stdio: "inherit" });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.once("exit", async (exitCode) => { await rm(directory, { recursive: true, force: true }); process.exit(exitCode ?? 0); });
