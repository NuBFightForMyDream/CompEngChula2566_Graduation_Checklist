// สร้างผลลัพธ์สำหรับ Vercel จริง แล้วรัน function ที่ bundle แล้วกับ Postgres
// จับปัญหาที่เกิดเฉพาะตอน bundle เช่น dependency แบบ CommonJS ที่ใช้ require
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDb } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { seedCurricula } from "../src/db/seed.ts";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const OUTPUT = join(ROOT, ".vercel", "output");
const FUNCTION = join(OUTPUT, "functions", "api.func");

let server: Server;
let base: string;
let close: () => Promise<void>;

interface Route {
  src?: string;
  dest?: string;
  status?: number;
  handle?: string;
  headers?: Record<string, string>;
  continue?: boolean;
}
const config = () =>
  JSON.parse(readFileSync(join(OUTPUT, "config.json"), "utf8")) as { version: number; routes: Route[] };

beforeAll(async () => {
  const { VERCEL_ENV: _skip, ...env } = process.env;
  const built = spawnSync(process.execPath, ["scripts/vercel-build.ts"], { cwd: ROOT, env, encoding: "utf8" });
  expect(built.status, built.stderr).toBe(0);

  const url = inject("pgUrl");
  const handle = createDb(url, { max: 2 });
  await runMigrations(handle.db);
  await seedCurricula(handle.db);
  await handle.close();

  process.env.DATABASE_URL = url;
  process.env.LOG_LEVEL = "silent";
  const mod = (await import(join(FUNCTION, "index.mjs"))) as { default: RequestListener };
  server = createServer(mod.default);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise((resolve) => server.close(() => resolve()));
}, 120_000);

afterAll(() => close?.());

describe("the bundled function", () => {
  it("is a single file with the expected config", () => {
    const vc = JSON.parse(readFileSync(join(FUNCTION, ".vc-config.json"), "utf8"));
    expect(vc).toMatchObject({
      handler: "index.mjs",
      launcherType: "Nodejs",
      runtime: "nodejs24.x",
      regions: ["sin1"],
    });
    expect(existsSync(join(FUNCTION, "index.mjs"))).toBe(true);
  });

  it("answers through the Node request handler Vercel calls", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("reads real data with prepared statements off, as through the pooler", async () => {
    const res = await fetch(`${base}/api/curricula/comp-eng-2566`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { courses: { offered?: string[]; id: string }[] };
    expect(body.courses).toHaveLength(52);
    // คอลัมน์ text[] ต้องยังแปลงเป็น array ได้ เมื่อปิด prepared statements
    expect(body.courses.find((c) => c.id === "2110211")?.offered).toEqual(["1"]);
  });

  it("handles a request with a body", async () => {
    const res = await fetch(`${base}/api/auth/logout`, { method: "POST" });
    expect(res.status).toBe(204);
  });

  it("uses the address Vercel reports for rate limits", async () => {
    const hit = (ip: string) =>
      fetch(`${base}/api/auth/google`, { headers: { "x-forwarded-for": ip }, redirect: "manual" });
    expect((await hit("198.51.100.1")).status).toBe(302);
  });
});

describe("the routing config", () => {
  it("sends every API path to the function before anything else", () => {
    const [first] = config().routes;
    expect(first?.dest).toBe("/api");
    for (const path of ["/api", "/api/health", "/api/plans/1/state"]) {
      expect(new RegExp(`^${first?.src}$`).test(path), path).toBe(true);
    }
    expect(new RegExp(`^${first?.src}$`).test("/apis")).toBe(false);
  });

  it("protects pages with a content security policy but not hashed assets", () => {
    const routes = config().routes;
    const page = routes.find((r) => r.headers?.["Content-Security-Policy"]);
    expect(page?.continue).toBe(true);
    expect(new RegExp(`^${page?.src}$`).test("/")).toBe(true);
    expect(new RegExp(`^${page?.src}$`).test("/share/abc")).toBe(true);
    expect(new RegExp(`^${page?.src}$`).test("/assets/app.js")).toBe(false);
    expect(page?.headers?.["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("answers 404 for a missing asset and sends other paths to the app", () => {
    const routes = config().routes;
    const fs = routes.findIndex((r) => r.handle === "filesystem");
    expect(fs).toBeGreaterThan(0);
    expect(routes[fs + 1]).toMatchObject({ src: "/assets/.*", status: 404 });
    expect(routes[fs + 2]).toMatchObject({ src: "/.*", dest: "/index.html" });
  });

  it("includes the built web app", () => {
    expect(existsSync(join(OUTPUT, "static", "index.html"))).toBe(true);
  });
});
