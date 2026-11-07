import { defaultSettings, type PlanDetail, planDetailSchema } from "@cp/contracts";
import { type Curriculum, createModel, emptyPlan, moveCourse, setChoice, setGrade, togglePassed } from "@cp/core";
import data from "@cp/curricula/data/comp-eng-2566.json";
import { eq } from "drizzle-orm";
import { pino } from "pino";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { planItems, plans, users } from "../src/db/schema.ts";
import { seedCurricula } from "../src/db/seed.ts";
import { MAX_PLANS_PER_USER } from "../src/modules/plans/service.ts";
import { Browser, jsonOf } from "./client.ts";
import { fakeOAuth } from "./fakeOAuth.ts";
import { createTestDb } from "./helpers.ts";

const cur = data as unknown as Curriculum;
const CUR = "comp-eng-2566";
let handle: Awaited<ReturnType<typeof createTestDb>>;
let app: ReturnType<typeof createApp>;
let alice: Browser;
let bob: Browser;
let counter = 0;

beforeAll(async () => {
  handle = await createTestDb();
  await seedCurricula(handle.db);
  // test ชุดนี้ login ทุกข้อ จึงยกเพดานไว้ เพดานจริงมี test แยกด้านล่าง
  app = createApp({
    db: handle.db,
    logger: pino({ level: "silent" }),
    oauth: fakeOAuth(),
    rateLimits: { auth: 100_000, writes: 100_000 },
  });
});
afterAll(() => handle.close());

beforeEach(async () => {
  alice = new Browser(app);
  bob = new Browser(app);
  await alice.login(`alice${++counter}`);
  await bob.login(`bob${counter}`);
});

async function newPlan(b: Browser, body: object = {}): Promise<PlanDetail> {
  const res = await b.request("/api/plans", { method: "POST", json: { curriculumId: CUR, name: "แผนหลัก", ...body } });
  expect(res.status).toBe(201);
  return planDetailSchema.parse(await res.json());
}

const save = (b: Browser, plan: { id: string; version: number }, state: object, settings: object = defaultSettings) =>
  b.request(`/api/plans/${plan.id}/state`, { method: "PUT", json: { version: plan.version, state, settings } });

const read = async (b: Browser, id: string) =>
  planDetailSchema.parse(await (await b.request(`/api/plans/${id}`)).json());

describe("creating a plan", () => {
  it("starts empty with every course placed", async () => {
    const plan = await newPlan(alice);
    expect(plan.version).toBe(1);
    expect(plan.state).toEqual(emptyPlan(cur));
    expect(plan.settings).toEqual(defaultSettings);
  });

  it("can carry over a plan from the browser", async () => {
    const state = togglePassed(createModel(cur, emptyPlan(cur)), "2110101").state;
    const plan = await newPlan(alice, { state, settings: { ...defaultSettings, autoShift: false } });
    expect(plan.state.passed).toEqual(["2110101"]);
    expect(plan.settings.autoShift).toBe(false);
  });

  it("rejects a plan that breaks the rules", async () => {
    const res = await alice.request("/api/plans", {
      method: "POST",
      json: { curriculumId: CUR, name: "x", state: { ...emptyPlan(cur), passed: ["2110211"] } },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ problems: [{ code: "PREREQ_NOT_PASSED", id: "2110211" }] });
  });

  it("answers 404 for an unknown curriculum", async () => {
    const res = await alice.request("/api/plans", { method: "POST", json: { curriculumId: "nope", name: "x" } });
    expect(res.status).toBe(404);
  });

  it("answers 400 for a bad body or broken JSON", async () => {
    const empty = await alice.request("/api/plans", { method: "POST", json: { curriculumId: CUR, name: "   " } });
    expect(empty.status).toBe(400);
    const broken = await alice.request("/api/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(broken.status).toBe(400);
  });

  it("stops at the limit, even when requests arrive together", async () => {
    const attempts = await Promise.all(
      Array.from({ length: MAX_PLANS_PER_USER + 5 }, (_, i) =>
        alice.request("/api/plans", { method: "POST", json: { curriculumId: CUR, name: `แผน ${i}` } }),
      ),
    );
    const statuses = attempts.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(MAX_PLANS_PER_USER);
    expect(statuses.filter((s) => s === 409)).toHaveLength(5);
  });
});

describe("saving a plan", () => {
  it("round-trips everything a user can do", async () => {
    const plan = await newPlan(alice);
    let s = emptyPlan(cur);
    s = togglePassed(createModel(cur, s), "2110101").state;
    s = setGrade(createModel(cur, s), "2110211", "B+").state;
    s = setGrade(createModel(cur, s), "2110215", "F").state;
    s = moveCourse(createModel(cur, s), "2301107", "2/1", { autoShift: true }).state;
    const o = cur.pools?.approved?.options.find((x) => x.id === "2110452");
    s = setChoice(
      createModel(cur, s),
      "APPR-2",
      { id: o?.id as string, code: o?.code as string, name: o?.name as string, credits: 3 },
      { autoShift: true },
    ).state;
    s = setChoice(
      createModel(cur, s),
      "FREE-1",
      { id: null, code: "9999", name: "กรอกเอง", credits: 2 },
      { autoShift: true },
    ).state;
    const extras = [
      { id: "X-b", code: "B", name: "สอง", credits: 3, category: "free", semester: "3/1" },
      { id: "X-a", code: "A", name: "หนึ่ง", credits: 1, category: "extra", semester: "1/2" },
    ];
    s = { ...s, extras, place: { ...s.place, "X-b": "3/1", "X-a": "1/2" } };
    const settings = { autoShift: false, showEdges: false, colors: { "cat:free": "#123456" } };

    const res = await save(alice, plan, s, settings);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ version: 2 });

    const back = await read(alice, plan.id);
    expect(back.state.place).toEqual(s.place);
    expect(back.state.grades).toEqual(s.grades);
    expect(back.state.choices).toEqual(s.choices);
    expect(back.state.extras).toEqual(extras);
    expect(new Set(back.state.passed)).toEqual(new Set(s.passed));
    expect(back.settings).toEqual(settings);
    expect(back.version).toBe(2);
  });

  it("does not leave rows behind for a removed extra", async () => {
    const plan = await newPlan(alice);
    const extra = { id: "X-1", code: "X", name: "X", credits: 3, category: "free", semester: "1/1" };
    const base = emptyPlan(cur);
    await save(alice, plan, { ...base, extras: [extra], place: { ...base.place, "X-1": "1/1" } });
    await save(alice, { id: plan.id, version: 2 }, base);
    const rows = await handle.db.select().from(planItems).where(eq(planItems.planId, plan.id));
    expect(rows).toHaveLength(cur.courses.length);
  });

  it.each([
    ["a course passed without its prereq", { passed: ["2110211"] }, "PREREQ_NOT_PASSED"],
    ["a passing grade without passing", { grades: { "2110101": "A" } }, "GRADE_MISMATCH"],
    ["a course that does not exist", { passed: ["ghost"] }, "UNKNOWN_COURSE"],
  ])("rejects %s even though the client skipped its own checks", async (_name, patch, code) => {
    const plan = await newPlan(alice);
    const res = await save(alice, plan, { ...emptyPlan(cur), ...patch });
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toContain(code);
    // ไม่บันทึกอะไรเลย และ version ไม่เปลี่ยน
    const back = await read(alice, plan.id);
    expect(back.version).toBe(1);
    expect(back.state.passed).toEqual([]);
  });

  it("rejects a term the course is not offered in", async () => {
    const plan = await newPlan(alice);
    const s = emptyPlan(cur);
    const res = await save(alice, plan, { ...s, place: { ...s.place, "2110211": "2/2" } });
    expect(res.status).toBe(422);
  });

  it("rejects data of the wrong shape", async () => {
    const plan = await newPlan(alice);
    expect((await save(alice, plan, { passed: "all" })).status).toBe(400);
    const s = emptyPlan(cur);
    expect((await save(alice, plan, s, { autoShift: "yes" })).status).toBe(400);
    expect((await save(alice, plan, s, { ...defaultSettings, colors: { a: "red;}" } })).status).toBe(400);
    expect((await alice.request("/api/plans/not-a-uuid")).status).toBe(400);
  });

  it("refuses a body far larger than any real plan", async () => {
    const plan = await newPlan(alice);
    const res = await save(alice, plan, { ...emptyPlan(cur), passed: ["x".repeat(400_000)] });
    expect(res.status).toBe(413);
  });
});

describe("two devices", () => {
  it("the second save with an old version gets the latest plan back", async () => {
    const plan = await newPlan(alice);
    const first = togglePassed(createModel(cur, emptyPlan(cur)), "2110101").state;
    expect((await save(alice, plan, first)).status).toBe(200);

    const stale = togglePassed(createModel(cur, emptyPlan(cur)), "2301107").state;
    const res = await save(alice, plan, stale);
    expect(res.status).toBe(409);
    const body = await jsonOf(res);
    expect(body.error.code).toBe("VERSION_CONFLICT");
    expect(body.plan.version).toBe(2);
    expect(body.plan.state.passed).toEqual(["2110101"]);
    // ของเดิมไม่ถูกเขียนทับ
    expect((await read(alice, plan.id)).state.passed).toEqual(["2110101"]);
  });

  it("only one of many simultaneous saves wins", async () => {
    const plan = await newPlan(alice);
    const courses = ["2110101", "2301107", "2304103", "2304183", "5500111", "2100111"];
    const results = await Promise.all(
      courses.map((id) => save(alice, plan, togglePassed(createModel(cur, emptyPlan(cur)), id).state)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(courses.length - 1);
    const back = await read(alice, plan.id);
    expect(back.version).toBe(2);
    expect(back.state.passed).toHaveLength(1);
    // แถวต้องครบ ไม่มีการเขียนปนกันระหว่างคำขอที่แข่งกัน
    const rows = await handle.db.select().from(planItems).where(eq(planItems.planId, plan.id));
    expect(rows).toHaveLength(cur.courses.length);
  });
});

describe("another user's plan", () => {
  it("looks like it does not exist, for every action", async () => {
    const plan = await newPlan(alice);
    const state = togglePassed(createModel(cur, emptyPlan(cur)), "2110101").state;
    expect((await bob.request(`/api/plans/${plan.id}`)).status).toBe(404);
    expect((await save(bob, plan, state)).status).toBe(404);
    expect((await bob.request(`/api/plans/${plan.id}`, { method: "DELETE" })).status).toBe(404);
    const unknown = await bob.request("/api/plans/00000000-0000-4000-8000-000000000000");
    expect(unknown.status).toBe(404);

    const back = await read(alice, plan.id);
    expect(back.version).toBe(1);
    expect(back.state.passed).toEqual([]);
  });

  it("never appears in my list", async () => {
    await newPlan(alice);
    const list = await (await bob.request("/api/plans")).json();
    expect(list).toEqual([]);
  });
});

describe("without logging in", () => {
  it("every plan route answers 401", async () => {
    const plan = await newPlan(alice);
    const anon = new Browser(app);
    expect((await anon.request("/api/plans")).status).toBe(401);
    expect((await anon.request(`/api/plans/${plan.id}`)).status).toBe(401);
    expect((await anon.request("/api/plans", { method: "POST", json: {} })).status).toBe(401);
    expect((await save(anon, plan, emptyPlan(cur))).status).toBe(401);
    expect((await anon.request(`/api/plans/${plan.id}`, { method: "DELETE" })).status).toBe(401);
  });
});

describe("deleting a plan", () => {
  it("hides it and blocks further saves", async () => {
    const plan = await newPlan(alice);
    expect((await alice.request(`/api/plans/${plan.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await alice.request(`/api/plans/${plan.id}`)).status).toBe(404);
    expect((await save(alice, plan, emptyPlan(cur))).status).toBe(404);
    expect(await (await alice.request("/api/plans")).json()).toEqual([]);
  });

  it("keeps the data so a later restore is possible, and export still shows it", async () => {
    const plan = await newPlan(alice);
    await alice.request(`/api/plans/${plan.id}`, { method: "DELETE" });
    const [row] = await handle.db.select().from(plans).where(eq(plans.id, plan.id));
    expect(row?.deletedAt).not.toBeNull();
    const body = await jsonOf(await alice.request("/api/me/export"));
    expect(body.plans[0].deletedAt).not.toBeNull();
  });
});

describe("when the curriculum changes after saving", () => {
  it("reading adapts the plan instead of failing", async () => {
    const plan = await newPlan(alice);
    const s = togglePassed(createModel(cur, emptyPlan(cur)), "2110101").state;
    await save(alice, plan, s);
    await handle.db.insert(planItems).values({
      planId: plan.id,
      courseId: "REMOVED-COURSE",
      kind: "curriculum",
      semester: "1/1",
      passed: true,
    });
    const back = await read(alice, plan.id);
    expect(back.state.place["REMOVED-COURSE"]).toBeUndefined();
    expect(back.state.passed).toEqual(["2110101"]);
  });
});

describe("database rules hold without the API", () => {
  const insert = async (values: Partial<typeof planItems.$inferInsert>) => {
    const plan = await newPlan(alice);
    return handle.db.insert(planItems).values({
      planId: plan.id,
      courseId: "T",
      kind: "curriculum",
      semester: "1/1",
      ...values,
    });
  };
  const failsWith = async (work: Promise<unknown>, pattern: RegExp) => {
    const err = await work.then(
      () => null,
      (e: Error & { cause?: Error }) => e,
    );
    expect(err?.cause?.message ?? err?.message).toMatch(pattern);
  };

  it("a passing grade requires passed", async () => {
    await failsWith(insert({ grade: "A", passed: false }), /plan_items_grade_matches_passed/);
  });

  it("a failing grade forbids passed", async () => {
    await failsWith(insert({ grade: "F", passed: true }), /plan_items_grade_matches_passed/);
  });

  it("an unknown grade is refused", async () => {
    await failsWith(insert({ grade: "Z" }), /plan_items_grade_valid/);
  });

  it("an extra must have its details, and a course must not", async () => {
    await failsWith(insert({ kind: "extra" }), /plan_items_extra_complete/);
    await failsWith(insert({ extraCode: "X" }), /plan_items_extra_complete/);
  });

  it("a partial choice is refused", async () => {
    await failsWith(insert({ choiceId: "2110431" }), /plan_items_choice_complete/);
  });

  it("the same option cannot fill two slots", async () => {
    const plan = await newPlan(alice);
    const choice = { choiceId: "2110431", choiceCode: "2110431", choiceName: "x", choiceCredits: 3 };
    const row = { planId: plan.id, kind: "curriculum" as const, semester: "3/1", ...choice };
    await handle.db.delete(planItems).where(eq(planItems.planId, plan.id));
    await handle.db.insert(planItems).values({ ...row, courseId: "ELEC-1" });
    await failsWith(
      handle.db.insert(planItems).values({ ...row, courseId: "APPR-1" }),
      /plan_items_one_choice_per_plan/,
    );
  });

  it("a curriculum with plans cannot be deleted by accident", async () => {
    await newPlan(alice);
    const { curricula } = await import("../src/db/schema.ts");
    await failsWith(handle.db.delete(curricula).where(eq(curricula.id, CUR)), /foreign key/);
  });

  it("seeding again keeps every saved plan", async () => {
    const plan = await newPlan(alice, { state: togglePassed(createModel(cur, emptyPlan(cur)), "2110101").state });
    await seedCurricula(handle.db);
    expect((await read(alice, plan.id)).state.passed).toEqual(["2110101"]);
    expect((await handle.db.select().from(users)).length).toBeGreaterThan(0);
  });
});

describe("rate limit", () => {
  it("applies per user", async () => {
    const limited = createApp({
      db: handle.db,
      logger: pino({ level: "silent" }),
      oauth: fakeOAuth(),
      rateLimits: { auth: 100_000, writes: 2 },
    });
    const b = new Browser(limited);
    await b.login(`limited${counter}`);
    const post = () => b.request("/api/plans", { method: "POST", json: { curriculumId: CUR, name: "x" } });
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(429);
    const other = new Browser(limited);
    await other.login(`unlimited${counter}`);
    expect((await other.request("/api/plans", { method: "POST", json: { curriculumId: CUR, name: "x" } })).status).toBe(
      201,
    );
  });
});
