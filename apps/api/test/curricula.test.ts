import { curriculumListSchema, curriculumSchema, noticeListSchema } from "@cp/contracts";
import { affected, buildGraph, prereqChain } from "@cp/core";
import data from "@cp/curricula/data/comp-eng-2566.json";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { seedCurricula } from "../src/db/seed.ts";
import { createTestDb } from "./helpers.ts";

const ID = "comp-eng-2566";
let handle: Awaited<ReturnType<typeof createTestDb>>;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  handle = await createTestDb();
  await seedCurricula(handle.db);
  app = createApp({ db: handle.db, logger: pino({ level: "silent" }) });
});
afterAll(() => handle.close());

const get = (path: string) => app.request(path);
// biome-ignore lint/suspicious/noExplicitAny: ค่าที่ตอบกลับถูกตรวจด้วย schema หรือ toEqual ใน test แต่ละข้อ
const bodyOf = async (path: string): Promise<any> => (await get(path)).json();

/** ในไฟล์ JSON ตัวเลือกวิชาอาจไม่มี prereq หรือเป็น [] ซึ่งมีความหมายเหมือนกัน ฐานข้อมูลคืนเป็น [] เสมอ */
function expectedCurriculum() {
  const cur = curriculumSchema.parse(data);
  for (const pool of Object.values(cur.pools ?? {})) {
    for (const option of pool.options) option.prereq ??= [];
  }
  return cur;
}

describe("GET /api/health", () => {
  it("reports ok when the database answers", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("GET /api/curricula", () => {
  it("lists the curricula from the index", async () => {
    const body = curriculumListSchema.parse(await bodyOf("/api/curricula"));
    expect(body).toEqual([{ id: ID, name: "Computer Engineering (2022) — 138 หน่วยกิต" }]);
  });
});

describe("GET /api/curricula/:id", () => {
  it("round-trips the curriculum file exactly", async () => {
    expect(await bodyOf(`/api/curricula/${ID}`)).toEqual(expectedCurriculum());
  });

  it("keeps the order that the board depends on", async () => {
    const body = curriculumSchema.parse(await bodyOf(`/api/curricula/${ID}`));
    expect(body.courses.map((c) => c.id)).toEqual(data.courses.map((c) => c.id));
    expect(Object.keys(body.categories)).toEqual(Object.keys(data.categories));
    expect(Object.keys(body.pools ?? {})).toEqual(Object.keys(data.pools));
  });

  it("keeps an option's prereq and term, including one listed in two pools", async () => {
    const body = curriculumSchema.parse(await bodyOf(`/api/curricula/${ID}`));
    const security = body.pools?.approved?.options.find((o) => o.id === "2110413");
    expect(security?.prereq).toEqual(["2110313", "2110471"]);
    expect(security?.offered).toEqual(["1"]);
    expect(body.pools?.elective?.options.some((o) => o.id === "2110431")).toBe(true);
    expect(body.pools?.approved?.options.some((o) => o.id === "2110431")).toBe(true);
  });

  it("does not depend on any elective slot having its own prereq", () => {
    // เงื่อนไขของ test แรก: ถ้าช่องมี prereq เอง การที่ตัวเลือกไม่มี prereq กับเป็น [] จะมีความหมายต่างกัน
    expect(data.courses.filter((c) => c.pool && c.prereq.length)).toEqual([]);
  });

  it("answers 404 for an unknown curriculum", async () => {
    const res = await get("/api/curricula/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("answers 400 for a malformed id instead of querying with it", async () => {
    const res = await get("/api/curricula/a'%20OR%201=1");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "BAD_REQUEST" } });
  });
});

describe("GET /api/curricula/:id/notices", () => {
  it("returns notices in the order of the index", async () => {
    const body = noticeListSchema.parse(await bodyOf(`/api/curricula/${ID}/notices`));
    expect(body.map((n) => n.slug)).toEqual(["cp-department", "comp-eng-2566"]);
    expect(body[1]?.body).toContain("เงื่อนไขเพิ่มเติม");
  });

  it("answers 404 for an unknown curriculum", async () => {
    expect((await get("/api/curricula/nope/notices")).status).toBe(404);
  });
});

describe("GET /api/curricula/:id/courses/:courseId/chain", () => {
  it("matches the graph algorithms in core for every course", async () => {
    const graph = buildGraph(curriculumSchema.parse(data).courses);
    for (const { id } of data.courses) {
      const body = await bodyOf(`/api/curricula/${ID}/courses/${id}/chain`);
      expect(body.prereqs, id).toEqual([...prereqChain(graph.prereqs, id)].sort());
      expect(body.dependents, id).toEqual([...affected(graph.unlocks, id)].sort());
    }
  });

  it("answers 404 for a course outside the curriculum", async () => {
    expect((await get(`/api/curricula/${ID}/courses/9999999/chain`)).status).toBe(404);
  });
});

describe("CDN caching", () => {
  it("lets the CDN cache public curriculum data", async () => {
    for (const path of ["/api/curricula", `/api/curricula/${ID}`, `/api/curricula/${ID}/notices`]) {
      expect((await get(path)).headers.get("cache-control"), path).toContain("s-maxage");
    }
  });

  it("never caches errors or private data", async () => {
    expect((await get("/api/curricula/nope")).headers.get("cache-control")).toBeNull();
    expect((await get("/api/health")).headers.get("cache-control")).toBeNull();
    expect((await get("/api/me")).headers.get("cache-control")).toBe("no-store");
  });
});

describe("the rest of the app", () => {
  it("publishes an OpenAPI document with every route", async () => {
    const doc = await bodyOf("/api/openapi.json");
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/api/curricula",
      "/api/curricula/{id}",
      "/api/curricula/{id}/courses/{courseId}/chain",
      "/api/curricula/{id}/notices",
      "/api/me",
      "/api/me/export",
      "/api/plans",
      "/api/plans/{id}",
      "/api/plans/{id}/state",
    ]);
  });

  it("serves the API docs page", async () => {
    expect((await get("/api/docs")).status).toBe(200);
  });

  it("answers JSON for an unknown path", async () => {
    const res = await get("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("sets security headers", async () => {
    expect((await get("/api/health")).headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("hides internal details when the database fails", async () => {
    const broken = await createTestDb();
    await broken.close();
    const brokenApp = createApp({ db: broken.db, logger: pino({ level: "silent" }) });
    const res = await brokenApp.request(`/api/curricula/${ID}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "INTERNAL", message: "ระบบขัดข้อง" } });
    expect((await brokenApp.request("/api/health")).status).toBe(503);
  });
});
