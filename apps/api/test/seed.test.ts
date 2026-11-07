import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { curriculumSchema } from "@cp/contracts";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { courses, curricula, poolOptions, prerequisites } from "../src/db/schema.ts";
import { DEFAULT_DATA_DIR, seedCurricula } from "../src/db/seed.ts";
import { createTestDb } from "./helpers.ts";

let handle: Awaited<ReturnType<typeof createTestDb>>;
const ID = "comp-eng-2566";
const count = async (table: typeof courses | typeof prerequisites | typeof poolOptions) =>
  (await handle.db.select({ n: sql<number>`count(*)::int` }).from(table))[0]?.n;

/** โฟลเดอร์ข้อมูลชั่วคราวที่แก้ JSON ได้ */
async function withData(
  edit: (cur: ReturnType<typeof curriculumSchema.parse>) => void,
  run: (dir: string) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), "cp-seed-"));
  try {
    const cur = curriculumSchema.parse(JSON.parse(await readFile(join(DEFAULT_DATA_DIR, `${ID}.json`), "utf8")));
    edit(cur);
    await writeFile(join(dir, `${ID}.json`), JSON.stringify(cur));
    await writeFile(join(dir, "index.json"), JSON.stringify([{ id: ID, name: "ทดสอบ", file: `${ID}.json` }]));
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(() => handle.close());

describe("seedCurricula", () => {
  it("loads every row from the file", async () => {
    await seedCurricula(handle.db);
    expect(await count(courses)).toBe(52);
    expect(await count(prerequisites)).toBe(13);
    expect(await count(poolOptions)).toBe(40);
  });

  it("gives the same result when run again", async () => {
    await seedCurricula(handle.db);
    await seedCurricula(handle.db);
    expect(await count(courses)).toBe(52);
    expect(await count(prerequisites)).toBe(13);
  });

  it("applies edits and removes rows that left the file", async () => {
    await withData(
      (cur) => {
        cur.courses = cur.courses.filter((c) => c.id !== "2110489");
        const first = cur.courses[0];
        if (first) first.name = "RENAMED";
      },
      async (dir) => {
        await seedCurricula(handle.db, dir);
        expect(await count(courses)).toBe(51);
        const [row] = await handle.db.select({ name: courses.name }).from(courses).where(eq(courses.id, "2110101"));
        expect(row?.name).toBe("RENAMED");
      },
    );
    await seedCurricula(handle.db);
    expect(await count(courses)).toBe(52);
  });

  it("keeps the curriculum row so future plans stay attached", async () => {
    const before = await handle.db.select().from(curricula).where(eq(curricula.id, ID));
    await seedCurricula(handle.db);
    expect(await handle.db.select().from(curricula).where(eq(curricula.id, ID))).toEqual(before);
  });

  it("changes nothing when the file is invalid", async () => {
    await withData(
      (cur) => {
        const c = cur.courses[0];
        if (c) c.prereq = ["ghost"];
      },
      async (dir) => {
        await expect(seedCurricula(handle.db, dir)).rejects.toThrow();
      },
    );
    expect(await count(courses)).toBe(52);
  });

  it("rolls back everything when a write fails midway", async () => {
    await withData(
      (cur) => {
        const [first, second] = cur.courses;
        if (first) first.name = "SHOULD NOT STAY";
        // ผ่าน schema แต่เกินช่วงของคอลัมน์ integer จึงล้มตอน insert courses
        // ซึ่งเกิดหลังจากลบข้อมูลเดิมไปแล้วใน transaction เดียวกัน
        if (second) second.credits = 99_999_999_999;
      },
      async (dir) => {
        const err = await seedCurricula(handle.db, dir).then(
          () => null,
          (e: Error & { cause?: Error }) => e,
        );
        expect(err?.cause?.message ?? err?.message).toMatch(/out of range/);
      },
    );
    expect(await count(courses)).toBe(52);
    const [row] = await handle.db.select({ name: courses.name }).from(courses).where(eq(courses.id, "2110101"));
    expect(row?.name).not.toBe("SHOULD NOT STAY");
  });
});
