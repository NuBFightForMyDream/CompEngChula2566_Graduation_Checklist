// กฎที่ฐานข้อมูลต้องบังคับเอง แม้มีคนเขียนตรงโดยไม่ผ่าน API
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, courses, curricula, poolOptions, prerequisites } from "../src/db/schema.ts";
import { seedCurricula } from "../src/db/seed.ts";
import { getCourseChain } from "../src/modules/curricula/repo.ts";
import { createTestDb } from "./helpers.ts";

const ID = "comp-eng-2566";
let handle: Awaited<ReturnType<typeof createTestDb>>;
const course = {
  curriculumId: ID,
  id: "T1",
  name: "T",
  credits: 3,
  categoryKey: "core",
  semester: "1/1",
  position: 999,
};

/** drizzle ห่อ error ไว้ ข้อความของ Postgres จริงอยู่ใน cause */
const rejectsWith = async (work: Promise<unknown>, pattern: RegExp) => {
  const err = await work.then(
    () => null,
    (e: Error) => e,
  );
  expect(err, "ต้องถูกฐานข้อมูลปฏิเสธ").not.toBeNull();
  expect(String((err as Error & { cause?: Error }).cause?.message ?? (err as Error).message)).toMatch(pattern);
};

beforeAll(async () => {
  handle = await createTestDb();
  await seedCurricula(handle.db);
});
afterAll(() => handle.close());

describe("courses", () => {
  it("rejects a semester outside the plan", async () => {
    await rejectsWith(handle.db.insert(courses).values({ ...course, semester: "6/1" }), /courses_semester_format/);
  });

  it("rejects zero credits", async () => {
    await rejectsWith(handle.db.insert(courses).values({ ...course, credits: 0 }), /courses_credits_positive/);
  });

  it("rejects an unknown term in offered", async () => {
    await rejectsWith(handle.db.insert(courses).values({ ...course, offered: ["3"] }), /courses_offered_valid/);
  });

  it("rejects an empty offered list, which would mean never offered", async () => {
    await rejectsWith(handle.db.insert(courses).values({ ...course, offered: [] }), /courses_offered_valid/);
  });

  it("rejects a category that does not exist", async () => {
    await rejectsWith(handle.db.insert(courses).values({ ...course, categoryKey: "nope" }), /foreign key/);
  });

  it("rejects a category that belongs to another curriculum", async () => {
    await handle.db.insert(curricula).values({
      id: "other",
      listName: "other",
      name: "other",
      totalCredits: 1,
      maxCreditsPerSemester: 1,
      position: 1,
    });
    await handle.db
      .insert(categories)
      .values({ curriculumId: "other", key: "only-other", label: "x", required: 1, color: "#000000", position: 0 });
    await rejectsWith(handle.db.insert(courses).values({ ...course, categoryKey: "only-other" }), /foreign key/);
  });
});

describe("prerequisites", () => {
  it("rejects a course that requires itself", async () => {
    await rejectsWith(
      handle.db
        .insert(prerequisites)
        .values({ curriculumId: ID, courseId: "2110101", prereqId: "2110101", position: 0 }),
      /prerequisites_not_self/,
    );
  });

  it("rejects a course that does not exist", async () => {
    await rejectsWith(
      handle.db.insert(prerequisites).values({ curriculumId: ID, courseId: "2110101", prereqId: "ghost", position: 0 }),
      /foreign key/,
    );
  });

  it("rejects a duplicate edge", async () => {
    await rejectsWith(
      handle.db
        .insert(prerequisites)
        .values({ curriculumId: ID, courseId: "2110211", prereqId: "2110101", position: 9 }),
      /duplicate key/,
    );
  });

  it("the recursive query finishes even if bad data forms a cycle", async () => {
    await handle.db
      .insert(prerequisites)
      .values({ curriculumId: ID, courseId: "2110101", prereqId: "2110211", position: 0 });
    const chain = await getCourseChain(handle.db, ID, "2110211");
    expect(chain.prereqs).toContain("2110101");
    await handle.db
      .delete(prerequisites)
      .where(and(eq(prerequisites.courseId, "2110101"), eq(prerequisites.prereqId, "2110211")));
  });
});

describe("pool options", () => {
  it("allows one course in two pools but not twice in the same pool", async () => {
    const [row] = await handle.db.select().from(poolOptions).where(eq(poolOptions.id, "2110431")).limit(1);
    expect(row).toBeDefined();
    await rejectsWith(handle.db.insert(poolOptions).values(row as typeof poolOptions.$inferInsert), /duplicate key/);
    const found = await handle.db.execute<{ n: number }>(
      sql`SELECT count(*)::int n FROM pool_options WHERE id = '2110431'`,
    );
    expect(found[0]?.n).toBe(2);
  });
});

describe("deleting a curriculum", () => {
  it("removes its rows and leaves other curricula alone", async () => {
    await handle.db.delete(curricula).where(eq(curricula.id, "other"));
    const left = await handle.db
      .select({ key: categories.key })
      .from(categories)
      .where(eq(categories.curriculumId, "other"));
    expect(left).toEqual([]);
    const kept = await handle.db.select({ id: courses.id }).from(courses).where(eq(courses.curriculumId, ID));
    expect(kept.length).toBe(52);
  });
});
