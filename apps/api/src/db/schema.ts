// โครงสร้างฐานข้อมูลของหลักสูตร
// ใช้ composite key เพราะรหัสวิชาซ้ำกันได้ข้ามหลักสูตร และ position รักษาลำดับตามไฟล์ JSON
// กฎสำคัญบังคับที่ฐานข้อมูลด้วย ข้อมูลจึงผิดไม่ได้แม้เขียนผ่านช่องทางอื่นที่ไม่ใช่ API

import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const curricula = pgTable(
  "curricula",
  {
    id: text().primaryKey(),
    listName: text("list_name").notNull(),
    name: text().notNull(),
    totalCredits: integer("total_credits").notNull(),
    maxCreditsPerSemester: integer("max_credits_per_semester").notNull(),
    note: text(),
    offeredNote: text("offered_note"),
    position: integer().notNull(),
  },
  (t) => [
    check("curricula_total_credits_positive", sql`${t.totalCredits} > 0`),
    check("curricula_max_credits_positive", sql`${t.maxCreditsPerSemester} > 0`),
  ],
);

const curriculumRef = () =>
  text("curriculum_id")
    .notNull()
    .references(() => curricula.id, { onDelete: "cascade" });

export const categories = pgTable(
  "categories",
  {
    curriculumId: curriculumRef(),
    key: text().notNull(),
    label: text().notNull(),
    required: integer().notNull(),
    color: text().notNull(),
    position: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.curriculumId, t.key] }),
    check("categories_required_not_negative", sql`${t.required} >= 0`),
  ],
);

export const groups = pgTable(
  "groups",
  {
    curriculumId: curriculumRef(),
    key: text().notNull(),
    label: text().notNull(),
    color: text().notNull(),
    position: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.curriculumId, t.key] })],
);

export const pools = pgTable(
  "pools",
  {
    curriculumId: curriculumRef(),
    key: text().notNull(),
    label: text().notNull(),
    note: text(),
    position: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.curriculumId, t.key] })],
);

const OFFERED_VALID = (offered: unknown) =>
  sql`${offered} IS NULL OR (cardinality(${offered}) > 0 AND ${offered} <@ ARRAY['1','2']::text[])`;

/** วิชาเดียวกันอยู่ได้หลาย pool เช่น 2110431 จึงต้องมี pool_key ใน key */
export const poolOptions = pgTable(
  "pool_options",
  {
    curriculumId: text("curriculum_id").notNull(),
    poolKey: text("pool_key").notNull(),
    id: text().notNull(),
    code: text().notNull(),
    name: text().notNull(),
    credits: integer().notNull(),
    offered: text().array(),
    position: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.curriculumId, t.poolKey, t.id] }),
    foreignKey({ columns: [t.curriculumId, t.poolKey], foreignColumns: [pools.curriculumId, pools.key] }).onDelete(
      "cascade",
    ),
    check("pool_options_credits_positive", sql`${t.credits} > 0`),
    check("pool_options_offered_valid", OFFERED_VALID(t.offered)),
  ],
);

export const courses = pgTable(
  "courses",
  {
    curriculumId: curriculumRef(),
    id: text().notNull(),
    code: text(),
    name: text().notNull(),
    credits: integer().notNull(),
    categoryKey: text("category_key").notNull(),
    groupKey: text("group_key"),
    poolKey: text("pool_key"),
    semester: text().notNull(),
    offered: text().array(),
    position: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.curriculumId, t.id] }),
    foreignKey({ columns: [t.curriculumId, t.categoryKey], foreignColumns: [categories.curriculumId, categories.key] }),
    foreignKey({ columns: [t.curriculumId, t.groupKey], foreignColumns: [groups.curriculumId, groups.key] }),
    foreignKey({ columns: [t.curriculumId, t.poolKey], foreignColumns: [pools.curriculumId, pools.key] }),
    check("courses_credits_positive", sql`${t.credits} > 0`),
    check("courses_semester_format", sql`${t.semester} ~ '^[1-5]/[12]$'`),
    check("courses_offered_valid", OFFERED_VALID(t.offered)),
  ],
);

/** edge ของกราฟ: course_id ต้องผ่าน prereq_id ก่อน */
export const prerequisites = pgTable(
  "prerequisites",
  {
    curriculumId: text("curriculum_id").notNull(),
    courseId: text("course_id").notNull(),
    prereqId: text("prereq_id").notNull(),
    position: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.curriculumId, t.courseId, t.prereqId] }),
    foreignKey({ columns: [t.curriculumId, t.courseId], foreignColumns: [courses.curriculumId, courses.id] }).onDelete(
      "cascade",
    ),
    foreignKey({ columns: [t.curriculumId, t.prereqId], foreignColumns: [courses.curriculumId, courses.id] }).onDelete(
      "cascade",
    ),
    check("prerequisites_not_self", sql`${t.courseId} <> ${t.prereqId}`),
    // ใช้ตอนเดินกราฟย้อนทิศ หาวิชาที่ต่อจากวิชานี้
    index("prerequisites_reverse_idx").on(t.curriculumId, t.prereqId),
  ],
);

export const poolOptionPrerequisites = pgTable(
  "pool_option_prerequisites",
  {
    curriculumId: text("curriculum_id").notNull(),
    poolKey: text("pool_key").notNull(),
    optionId: text("option_id").notNull(),
    prereqId: text("prereq_id").notNull(),
    position: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.curriculumId, t.poolKey, t.optionId, t.prereqId] }),
    foreignKey({
      columns: [t.curriculumId, t.poolKey, t.optionId],
      foreignColumns: [poolOptions.curriculumId, poolOptions.poolKey, poolOptions.id],
    }).onDelete("cascade"),
    foreignKey({ columns: [t.curriculumId, t.prereqId], foreignColumns: [courses.curriculumId, courses.id] }).onDelete(
      "cascade",
    ),
  ],
);

export const notices = pgTable("notices", {
  slug: text().primaryKey(),
  body: text().notNull(),
});

/** ประกาศหนึ่งใช้ได้หลายหลักสูตร เช่น ประกาศของภาควิชา */
export const curriculumNotices = pgTable(
  "curriculum_notices",
  {
    curriculumId: curriculumRef(),
    noticeSlug: text("notice_slug")
      .notNull()
      .references(() => notices.slug, { onDelete: "cascade" }),
    position: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.curriculumId, t.noticeSlug] })],
);
