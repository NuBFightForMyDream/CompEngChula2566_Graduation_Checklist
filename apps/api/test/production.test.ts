// สิ่งที่สำคัญเมื่อขึ้นระบบจริง: Supabase Data API, การเสิร์ฟหน้าเว็บ และการหา IP หลัง proxy
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { pino } from "pino";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { rateLimitCounters } from "../src/db/schema.ts";
import { seedCurricula } from "../src/db/seed.ts";
import { Browser } from "./client.ts";
import { fakeOAuth } from "./fakeOAuth.ts";
import { createTestDb } from "./helpers.ts";

let handle: Awaited<ReturnType<typeof createTestDb>>;
let webRoot: string;
const logger = pino({ level: "silent" });

beforeAll(async () => {
  handle = await createTestDb();
  await seedCurricula(handle.db);
  webRoot = await mkdtemp(join(tmpdir(), "cp-web-"));
  await mkdir(join(webRoot, "assets"));
  await writeFile(join(webRoot, "index.html"), "<!doctype html><title>หน้าเว็บ</title>");
  await writeFile(join(webRoot, "assets", "app-abc123.js"), "console.log(1)");
  await writeFile(join(webRoot, "..", "cp-secret-outside.txt"), "ห้ามเห็น");
});
afterAll(async () => {
  await handle.close();
  await rm(webRoot, { recursive: true, force: true });
  await rm(join(webRoot, "..", "cp-secret-outside.txt"), { force: true });
});

describe("the Supabase Data API", () => {
  // Supabase เปิดตารางใน public ให้ role anon และ authenticated ผ่านคีย์สาธารณะ
  it("every table has row level security on, including any added later", async () => {
    const tables = await handle.db.execute<{ tablename: string; rowsecurity: boolean }>(
      sql`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    expect(tables.length).toBeGreaterThanOrEqual(15);
    expect(tables.filter((t) => !t.rowsecurity).map((t) => t.tablename)).toEqual([]);
  });

  it("a public role sees nothing and cannot write, even with table grants", async () => {
    const b = new Browser(createApp({ db: handle.db, logger, oauth: fakeOAuth() }));
    await b.login("rls-victim");
    await handle.db.execute(sql`CREATE ROLE anon_like NOLOGIN`);
    await handle.db.execute(sql`GRANT USAGE ON SCHEMA public TO anon_like`);
    await handle.db.execute(sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon_like`);

    const failure = await handle.db
      .transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE anon_like`);
        const users = await tx.execute<{ n: number }>(sql`SELECT count(*)::int n FROM users`);
        const sessions = await tx.execute<{ n: number }>(sql`SELECT count(*)::int n FROM sessions`);
        const courses = await tx.execute<{ n: number }>(sql`SELECT count(*)::int n FROM courses`);
        expect([users[0]?.n, sessions[0]?.n, courses[0]?.n]).toEqual([0, 0, 0]);
        await tx.execute(sql`INSERT INTO users (google_sub, email, name) VALUES ('x', 'x', 'x')`);
      })
      .then(
        () => null,
        (e: Error & { cause?: Error }) => e.cause?.message ?? e.message,
      );
    expect(failure).toMatch(/row-level security/);
  });

  it("our own API keeps working with RLS on", async () => {
    const b = new Browser(createApp({ db: handle.db, logger, oauth: fakeOAuth() }));
    await b.login("rls-owner");
    const res = await b.request("/api/plans", { method: "POST", json: { curriculumId: "comp-eng-2566", name: "x" } });
    expect(res.status).toBe(201);
  });
});

describe("serving the web app", () => {
  const app = () => createApp({ db: handle.db, logger, webRoot });

  it("serves the page with a strict content security policy", async () => {
    const res = await app().request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("หน้าเว็บ");
    const csp = res.headers.get("content-security-policy") as string;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("caches hashed assets for a long time", async () => {
    const res = await app().request("/assets/app-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  it("answers 404 for a missing asset instead of HTML", async () => {
    const res = await app().request("/assets/gone.js");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("<!doctype");
  });

  it("sends unknown pages to the app, so future routes work on reload", async () => {
    const res = await app().request("/share/abc");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("หน้าเว็บ");
  });

  it("keeps unknown API paths as JSON errors", async () => {
    const res = await app().request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it.each([
    "/assets/../../cp-secret-outside.txt",
    "/assets/..%2f..%2fcp-secret-outside.txt",
    "/assets/%2e%2e/%2e%2e/cp-secret-outside.txt",
    "/assets/..\\..\\cp-secret-outside.txt",
  ])("does not read files outside the web folder: %s", async (path) => {
    const res = await app().request(path);
    expect(await res.text()).not.toContain("ห้ามเห็น");
  });

  it("still answers the API", async () => {
    expect((await app().request("/api/health")).status).toBe(200);
  });

  it("does not serve the app when no folder is set", async () => {
    expect((await createApp({ db: handle.db, logger }).request("/")).status).toBe(404);
  });
});

describe("rate limit behind a proxy", () => {
  beforeEach(() => handle.db.delete(rateLimitCounters));

  const limited = (trustedProxyHops: number) =>
    createApp({ db: handle.db, logger, oauth: fakeOAuth(), rateLimits: { auth: 1 }, trustedProxyHops });
  const start = (app: ReturnType<typeof limited>, forwarded: string) =>
    app.request("/api/auth/google", { headers: { "x-forwarded-for": forwarded } });

  it("separates users by the address the proxy reports", async () => {
    const app = limited(1);
    expect((await start(app, "1.1.1.1")).status).toBe(302);
    expect((await start(app, "1.1.1.1")).status).toBe(429);
    expect((await start(app, "2.2.2.2")).status).toBe(302);
  });

  it("cannot be dodged by faking addresses on the left", async () => {
    const app = limited(1);
    expect((await start(app, "9.9.9.1, 1.1.1.1")).status).toBe(302);
    expect((await start(app, "9.9.9.2, 1.1.1.1")).status).toBe(429);
  });

  it("counts from the right when there are two proxies", async () => {
    const app = limited(2);
    expect((await start(app, "1.1.1.1, 10.0.0.1")).status).toBe(302);
    expect((await start(app, "fake, 1.1.1.1, 10.0.0.2")).status).toBe(429);
  });

  it("ignores the header entirely when no proxy is trusted", async () => {
    const app = limited(0);
    expect((await start(app, "1.1.1.1")).status).toBe(302);
    expect((await start(app, "2.2.2.2")).status).toBe(429);
  });
});
