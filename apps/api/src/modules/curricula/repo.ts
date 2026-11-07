// อ่านหลักสูตรจากฐานข้อมูล แล้วประกอบกลับเป็นรูปเดียวกับไฟล์ JSON

import { type Curriculum, curriculumSchema } from "@cp/contracts";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client.ts";
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
} from "../../db/schema.ts";

export function listCurricula(db: Db) {
  return db.select({ id: curricula.id, name: curricula.listName }).from(curricula).orderBy(asc(curricula.position));
}

const groupBy = <T>(rows: T[], keyOf: (row: T) => string) => {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = out.get(key);
    if (list) list.push(row);
    else out.set(key, [row]);
  }
  return out;
};

const present = <K extends string, V>(key: K, value: V | null): { [P in K]?: V } =>
  (value === null ? {} : { [key]: value }) as { [P in K]?: V };

export async function getCurriculum(db: Db, id: string): Promise<Curriculum | null> {
  // อ่านหลายตารางจาก snapshot เดียวกัน ถ้ามีการ seed แทรกกลางทางจะไม่เห็นข้อมูลครึ่ง ๆ กลาง ๆ
  const raw = await db.transaction(
    async (tx) => {
      const [cur] = await tx.select().from(curricula).where(eq(curricula.id, id));
      if (!cur) return null;
      return {
        cur,
        categoryRows: await tx
          .select()
          .from(categories)
          .where(eq(categories.curriculumId, id))
          .orderBy(asc(categories.position)),
        groupRows: await tx.select().from(groups).where(eq(groups.curriculumId, id)).orderBy(asc(groups.position)),
        poolRows: await tx.select().from(pools).where(eq(pools.curriculumId, id)).orderBy(asc(pools.position)),
        optionRows: await tx
          .select()
          .from(poolOptions)
          .where(eq(poolOptions.curriculumId, id))
          .orderBy(asc(poolOptions.position)),
        optionPrereqRows: await tx
          .select()
          .from(poolOptionPrerequisites)
          .where(eq(poolOptionPrerequisites.curriculumId, id))
          .orderBy(asc(poolOptionPrerequisites.position)),
        courseRows: await tx.select().from(courses).where(eq(courses.curriculumId, id)).orderBy(asc(courses.position)),
        prereqRows: await tx
          .select()
          .from(prerequisites)
          .where(eq(prerequisites.curriculumId, id))
          .orderBy(asc(prerequisites.position)),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  if (!raw) return null;

  const optionsByPool = groupBy(raw.optionRows, (o) => o.poolKey);
  const optionPrereqs = groupBy(raw.optionPrereqRows, (p) => `${p.poolKey}/${p.optionId}`);
  const coursePrereqs = groupBy(raw.prereqRows, (p) => p.courseId);

  // ตรวจอีกครั้งตอนส่งออก ถ้าข้อมูลในฐานไม่ตรงสัญญา API จะตอบ error แทนการส่งข้อมูลผิดให้หน้าเว็บ
  return curriculumSchema.parse({
    id: raw.cur.id,
    name: raw.cur.name,
    totalCredits: raw.cur.totalCredits,
    maxCreditsPerSemester: raw.cur.maxCreditsPerSemester,
    ...present("note", raw.cur.note),
    ...present("offeredNote", raw.cur.offeredNote),
    categories: Object.fromEntries(
      raw.categoryRows.map((c) => [c.key, { label: c.label, required: c.required, color: c.color }]),
    ),
    groups: Object.fromEntries(raw.groupRows.map((g) => [g.key, { label: g.label, color: g.color }])),
    pools: Object.fromEntries(
      raw.poolRows.map((p) => [
        p.key,
        {
          label: p.label,
          ...present("note", p.note),
          options: (optionsByPool.get(p.key) ?? []).map((o) => ({
            id: o.id,
            code: o.code,
            name: o.name,
            credits: o.credits,
            prereq: (optionPrereqs.get(`${p.key}/${o.id}`) ?? []).map((x) => x.prereqId),
            ...present("offered", o.offered),
          })),
        },
      ]),
    ),
    courses: raw.courseRows.map((c) => ({
      id: c.id,
      ...present("code", c.code),
      name: c.name,
      credits: c.credits,
      category: c.categoryKey,
      ...present("group", c.groupKey),
      ...present("pool", c.poolKey),
      semester: c.semester,
      prereq: (coursePrereqs.get(c.id) ?? []).map((x) => x.prereqId),
      ...present("offered", c.offered),
    })),
  });
}

export async function getNotices(db: Db, curriculumId: string) {
  return db
    .select({ slug: notices.slug, body: notices.body })
    .from(curriculumNotices)
    .innerJoin(notices, eq(curriculumNotices.noticeSlug, notices.slug))
    .where(eq(curriculumNotices.curriculumId, curriculumId))
    .orderBy(asc(curriculumNotices.position));
}

export async function curriculumExists(db: Db, id: string) {
  const [row] = await db.select({ id: curricula.id }).from(curricula).where(eq(curricula.id, id));
  return !!row;
}

export async function courseExists(db: Db, curriculumId: string, courseId: string) {
  const [row] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.curriculumId, curriculumId), eq(courses.id, courseId)));
  return !!row;
}

/**
 * เดินกราฟด้วย recursive CTE ได้ผลเดียวกับ prereqChain และ affected ใน @cp/core
 * UNION ตัดแถวซ้ำให้ จึงจบเสมอแม้ข้อมูลจะมีวงวน
 */
export async function getCourseChain(db: Db, curriculumId: string, courseId: string) {
  const prereqs = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE chain(id) AS (
      SELECT prereq_id FROM prerequisites
      WHERE curriculum_id = ${curriculumId} AND course_id = ${courseId}
      UNION
      SELECT p.prereq_id FROM prerequisites p
      JOIN chain ON p.course_id = chain.id
      WHERE p.curriculum_id = ${curriculumId}
    )
    SELECT id FROM chain ORDER BY id
  `);
  const dependents = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE chain(id) AS (
      SELECT course_id FROM prerequisites
      WHERE curriculum_id = ${curriculumId} AND prereq_id = ${courseId}
      UNION
      SELECT p.course_id FROM prerequisites p
      JOIN chain ON p.prereq_id = chain.id
      WHERE p.curriculum_id = ${curriculumId}
    )
    SELECT id FROM chain ORDER BY id
  `);
  return { courseId, prereqs: prereqs.map((r) => r.id), dependents: dependents.map((r) => r.id) };
}
