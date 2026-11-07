// นำไฟล์หลักสูตรเข้าฐานข้อมูล รันซ้ำกี่ครั้งก็ได้ผลเหมือนเดิม
// แถวใน curricula ใช้ upsert และไม่ลบ เพราะแผนของผู้ใช้ในเฟส 4 จะอ้างถึงแถวนี้
// ส่วนข้อมูลลูกจะลบแล้วใส่ใหม่ใน transaction เดียว ผู้อ่านจึงไม่เห็นข้อมูลครึ่ง ๆ กลาง ๆ

import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Curriculum, curriculumIndexSchema, curriculumSchema } from "@cp/contracts";
import { eq, sql } from "drizzle-orm";
import type { PgInsertValue, PgTable } from "drizzle-orm/pg-core";
import type { Db } from "./client.ts";
import {
  categories,
  courses,
  curricula,
  curriculumNotices,
  groups,
  notices,
  poolOptionPrerequisites,
  poolOptions,
  pools,
  prerequisites,
} from "./schema.ts";

export const DEFAULT_DATA_DIR = fileURLToPath(new URL("../../../../packages/curricula/data", import.meta.url));

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const insertAll = async <T extends PgTable>(tx: Tx, table: T, rows: PgInsertValue<T>[]) => {
  if (rows.length) await tx.insert(table).values(rows);
};

const noticeSlug = (file: string) => basename(file, ".md");

async function writeCurriculum(tx: Tx, cur: Curriculum, listName: string, position: number, noticeFiles: string[]) {
  const curriculumId = cur.id;
  const row = {
    listName,
    name: cur.name,
    totalCredits: cur.totalCredits,
    maxCreditsPerSemester: cur.maxCreditsPerSemester,
    note: cur.note ?? null,
    offeredNote: cur.offeredNote ?? null,
    position,
  };
  await tx
    .insert(curricula)
    .values({ id: curriculumId, ...row })
    .onConflictDoUpdate({ target: curricula.id, set: row });

  // ลบ courses ก่อน เพราะอ้างถึง categories, groups และ pools
  await tx.delete(courses).where(eq(courses.curriculumId, curriculumId));
  await tx.delete(pools).where(eq(pools.curriculumId, curriculumId));
  await tx.delete(categories).where(eq(categories.curriculumId, curriculumId));
  await tx.delete(groups).where(eq(groups.curriculumId, curriculumId));
  await tx.delete(curriculumNotices).where(eq(curriculumNotices.curriculumId, curriculumId));

  await insertAll(
    tx,
    categories,
    Object.entries(cur.categories).map(([key, c], i) => ({ curriculumId, key, ...c, position: i })),
  );
  await insertAll(
    tx,
    groups,
    Object.entries(cur.groups ?? {}).map(([key, g], i) => ({ curriculumId, key, ...g, position: i })),
  );
  const poolEntries = Object.entries(cur.pools ?? {});
  await insertAll(
    tx,
    pools,
    poolEntries.map(([key, p], i) => ({ curriculumId, key, label: p.label, note: p.note ?? null, position: i })),
  );
  await insertAll(
    tx,
    poolOptions,
    poolEntries.flatMap(([poolKey, p]) =>
      p.options.map((o, i) => ({
        curriculumId,
        poolKey,
        id: o.id,
        code: o.code,
        name: o.name,
        credits: o.credits,
        offered: o.offered ?? null,
        position: i,
      })),
    ),
  );
  await insertAll(
    tx,
    courses,
    cur.courses.map((c, i) => ({
      curriculumId,
      id: c.id,
      code: c.code ?? null,
      name: c.name,
      credits: c.credits,
      categoryKey: c.category,
      groupKey: c.group ?? null,
      poolKey: c.pool ?? null,
      semester: c.semester,
      offered: c.offered ?? null,
      position: i,
    })),
  );
  await insertAll(
    tx,
    prerequisites,
    cur.courses.flatMap((c) =>
      c.prereq.map((prereqId, i) => ({ curriculumId, courseId: c.id, prereqId, position: i })),
    ),
  );
  await insertAll(
    tx,
    poolOptionPrerequisites,
    poolEntries.flatMap(([poolKey, p]) =>
      p.options.flatMap((o) =>
        (o.prereq ?? []).map((prereqId, i) => ({ curriculumId, poolKey, optionId: o.id, prereqId, position: i })),
      ),
    ),
  );
  await insertAll(
    tx,
    curriculumNotices,
    noticeFiles.map((file, i) => ({ curriculumId, noticeSlug: noticeSlug(file), position: i })),
  );
}

/** อ่านและตรวจไฟล์ทั้งหมดให้ผ่านก่อน จึงเริ่มแตะฐานข้อมูล */
export async function seedCurricula(db: Db, dataDir: string = DEFAULT_DATA_DIR) {
  const read = (file: string) => readFile(join(dataDir, file), "utf8");
  const entries = curriculumIndexSchema.parse(JSON.parse(await read("index.json")));
  const loaded = await Promise.all(
    entries.map(async (entry) => ({
      entry,
      curriculum: curriculumSchema.parse(JSON.parse(await read(entry.file))),
    })),
  );
  const noticeFiles = [...new Set(entries.flatMap((e) => e.notices ?? []))];
  const noticeRows = await Promise.all(noticeFiles.map(async (f) => ({ slug: noticeSlug(f), body: await read(f) })));

  await db.transaction(async (tx) => {
    if (noticeRows.length) {
      await tx
        .insert(notices)
        .values(noticeRows)
        .onConflictDoUpdate({ target: notices.slug, set: { body: sql`excluded.body` } });
    }
    for (const [i, { entry, curriculum }] of loaded.entries()) {
      await writeCurriculum(tx, curriculum, entry.name, i, entry.notices ?? []);
    }
  });
  return { curricula: loaded.length, notices: noticeRows.length };
}
