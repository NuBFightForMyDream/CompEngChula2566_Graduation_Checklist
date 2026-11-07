// โครงสร้างฐานข้อมูลของหลักสูตร
// ใช้ composite key เพราะรหัสวิชาซ้ำกันได้ข้ามหลักสูตร และ position รักษาลำดับตามไฟล์ JSON
// กฎสำคัญบังคับที่ฐานข้อมูลด้วย ข้อมูลจึงผิดไม่ได้แม้เขียนผ่านช่องทางอื่นที่ไม่ใช่ API
//
// ทุกตารางต้อง .enableRLS() เพราะ Supabase เปิดตารางใน schema public ผ่าน Data API ด้วยคีย์สาธารณะ
// เปิด RLS โดยไม่มี policy = ปฏิเสธทุกคำขอจากช่องทางนั้น ส่วน API ของเราต่อในฐานะเจ้าของตารางจึงไม่ถูกกระทบ

import type { PlanSettings } from "@cp/contracts";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

export const notices = pgTable("notices", {
  slug: text().primaryKey(),
  body: text().notNull(),
}).enableRLS();

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
).enableRLS();

// ---------- บัญชีผู้ใช้และแผน ----------

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  /** รหัสถาวรจาก Google อีเมลเปลี่ยนได้ จึงใช้ระบุตัวตนไม่ได้ */
  googleSub: text("google_sub").notNull().unique(),
  email: text().notNull(),
  name: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** เก็บเฉพาะ hash ของ token ถ้าฐานข้อมูลรั่ว ค่าที่เห็นจะใช้ login แทนผู้ใช้ไม่ได้ */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
).enableRLS();

export const plans = pgTable(
  "plans",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // ห้ามลบหลักสูตรที่ยังมีแผนอ้างอยู่ แผนของผู้ใช้สำคัญกว่า
    curriculumId: text("curriculum_id")
      .notNull()
      .references(() => curricula.id, { onDelete: "restrict" }),
    name: text().notNull(),
    /** เพิ่มทุกครั้งที่บันทึก ใช้กันการเขียนทับกันระหว่างหลายเครื่อง */
    version: integer().notNull().default(1),
    settings: jsonb().$type<PlanSettings>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("plans_user_idx").on(t.userId),
    check("plans_version_positive", sql`${t.version} >= 1`),
    check("plans_name_length", sql`char_length(${t.name}) BETWEEN 1 AND 60`),
  ],
).enableRLS();

/**
 * หนึ่งแถวต่อหนึ่งวิชาในแผน ทั้งวิชาในหลักสูตรและวิชาเรียนเพิ่ม เพราะมีเทอม สถานะผ่าน และเกรดเหมือนกัน
 * course_id ไม่มี foreign key ไปที่ courses เพราะ seed ลบแล้วใส่ใหม่ได้ และหลักสูตรอาจเปลี่ยนรายวิชา
 * ตอนอ่านแผน ระบบจะปรับให้ตรงกับหลักสูตรปัจจุบันด้วย normalizePlan
 */
export const planItems = pgTable(
  "plan_items",
  {
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull(),
    kind: text({ enum: ["curriculum", "extra"] }).notNull(),
    semester: text().notNull(),
    passed: boolean().notNull().default(false),
    grade: text(),
    // วิชาที่เลือกลงช่อง: choice_id เป็น null เมื่อผู้ใช้กรอกวิชาเอง
    choiceId: text("choice_id"),
    choiceCode: text("choice_code"),
    choiceName: text("choice_name"),
    choiceCredits: integer("choice_credits"),
    // เฉพาะวิชาเรียนเพิ่ม
    extraCode: text("extra_code"),
    extraName: text("extra_name"),
    extraCredits: integer("extra_credits"),
    extraCategory: text("extra_category"),
    extraPosition: integer("extra_position"),
  },
  (t) => [
    primaryKey({ columns: [t.planId, t.courseId] }),
    check("plan_items_semester_format", sql`${t.semester} ~ '^[1-5]/[12]$'`),
    check(
      "plan_items_grade_valid",
      sql`${t.grade} IS NULL OR ${t.grade} IN ('A','B+','B','C+','C','D+','D','F','S','U','W')`,
    ),
    // เกรดผ่านต้องติ๊กผ่าน และเกรดไม่ผ่านต้องไม่ติ๊กผ่าน
    check(
      "plan_items_grade_matches_passed",
      sql`${t.grade} IS NULL OR (${t.grade} IN ('A','B+','B','C+','C','D+','D','S')) = ${t.passed}`,
    ),
    // ข้อมูลวิชาที่เลือกต้องมาครบหรือไม่มีเลย และวิชาเรียนเพิ่มเลือกวิชาลงช่องไม่ได้
    check(
      "plan_items_choice_complete",
      sql`(${t.choiceCode} IS NULL AND ${t.choiceName} IS NULL AND ${t.choiceCredits} IS NULL AND ${t.choiceId} IS NULL)
        OR (${t.kind} = 'curriculum' AND ${t.choiceCode} IS NOT NULL AND ${t.choiceName} IS NOT NULL AND ${t.choiceCredits} BETWEEN 1 AND 6)`,
    ),
    check(
      "plan_items_extra_complete",
      sql`(${t.kind} = 'curriculum' AND ${t.extraCode} IS NULL AND ${t.extraName} IS NULL AND ${t.extraCredits} IS NULL AND ${t.extraCategory} IS NULL AND ${t.extraPosition} IS NULL)
        OR (${t.kind} = 'extra' AND ${t.extraCode} IS NOT NULL AND ${t.extraName} IS NOT NULL AND ${t.extraCredits} BETWEEN 1 AND 6 AND ${t.extraCategory} IS NOT NULL AND ${t.extraPosition} IS NOT NULL)`,
    ),
    // วิชาเดียวกันเลือกซ้ำในหลายช่องของแผนเดียวไม่ได้ แถวที่ไม่ได้เลือกวิชาจะไม่ถูกนับ
    uniqueIndex("plan_items_one_choice_per_plan").on(t.planId, t.choiceId).where(sql`${t.choiceId} IS NOT NULL`),
  ],
).enableRLS();
