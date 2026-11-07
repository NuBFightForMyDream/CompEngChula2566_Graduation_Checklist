// Zod schema ของข้อมูลที่ข้ามขอบเขตระบบ: ไฟล์หลักสูตร, แผนที่โหลดจากเบราว์เซอร์หรือไฟล์ และ API ในอนาคต

import { buildGraph, GRADES, type Grade, SEMS, topoSort } from "@cp/core";
import { z } from "zod";

const offered = z.array(z.enum(["1", "2"])).min(1);
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);
const semester = z.enum(SEMS);

export const courseSchema = z.object({
  id: z.string().min(1),
  code: z.string().optional(),
  name: z.string().min(1),
  credits: z.number().int().positive(),
  category: z.string().min(1),
  semester,
  prereq: z.array(z.string()),
  group: z.string().optional(),
  pool: z.string().optional(),
  offered: offered.optional(),
});

export const poolOptionSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  credits: z.number().int().positive(),
  prereq: z.array(z.string()).optional(),
  offered: offered.optional(),
});

export const curriculumSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    totalCredits: z.number().int().positive(),
    maxCreditsPerSemester: z.number().int().positive(),
    note: z.string().optional(),
    offeredNote: z.string().optional(),
    categories: z.record(
      z.string(),
      z.object({ label: z.string(), required: z.number().int().nonnegative(), color: hexColor }),
    ),
    groups: z.record(z.string(), z.object({ label: z.string(), color: hexColor })).optional(),
    pools: z
      .record(
        z.string(),
        z.object({ label: z.string(), note: z.string().optional(), options: z.array(poolOptionSchema) }),
      )
      .optional(),
    courses: z.array(courseSchema).min(1),
  })
  .superRefine((cur, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const ids = new Set(cur.courses.map((c) => c.id));
    if (ids.size !== cur.courses.length) fail("มีรหัสวิชาซ้ำใน courses");
    for (const c of cur.courses) {
      if (!cur.categories[c.category]) fail(`${c.id}: ไม่มีหมวด ${c.category}`);
      if (c.group && !cur.groups?.[c.group]) fail(`${c.id}: ไม่มีกลุ่ม ${c.group}`);
      if (c.pool && !cur.pools?.[c.pool]) fail(`${c.id}: ไม่มี pool ${c.pool}`);
      for (const p of c.prereq) if (!ids.has(p)) fail(`${c.id}: ไม่มี prereq ${p}`);
    }
    for (const [key, pool] of Object.entries(cur.pools ?? {})) {
      for (const o of pool.options) {
        for (const p of o.prereq ?? []) if (!ids.has(p)) fail(`pool ${key} / ${o.id}: ไม่มี prereq ${p}`);
      }
    }
    const refsOk = cur.courses.every((c) => c.prereq.every((p) => ids.has(p)));
    if (refsOk && ids.size === cur.courses.length && topoSort(buildGraph(cur.courses)).length !== cur.courses.length) {
      fail("มีวิชาบังคับก่อนที่วนกัน");
    }
  });

export type Curriculum = z.infer<typeof curriculumSchema>;

/** data/index.json */
export const curriculumIndexSchema = z.array(
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    file: z.string().min(1),
    notices: z.array(z.string()).optional(),
  }),
);

// ---------- API ----------
export const curriculumSummarySchema = z.object({ id: z.string(), name: z.string() });
export const curriculumListSchema = z.array(curriculumSummarySchema);
export type CurriculumSummary = z.infer<typeof curriculumSummarySchema>;

export const noticeSchema = z.object({ slug: z.string(), body: z.string() });
export const noticeListSchema = z.array(noticeSchema);

export const courseChainSchema = z.object({
  courseId: z.string(),
  /** ทุกวิชาที่ต้องผ่านก่อน รวมทุกชั้น */
  prereqs: z.array(z.string()),
  /** ทุกวิชาที่ได้รับผลกระทบถ้าไม่ผ่านวิชานี้ รวมทุกชั้น */
  dependents: z.array(z.string()),
});

export const apiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const choiceSchema = z.object({
  id: z.string().nullable(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  credits: z.number().int().min(1).max(6),
});

const extraSchema = z.object({
  id: z.string().min(1).max(64),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  credits: z.number().int().min(1).max(6),
  category: z.string(),
  semester,
});

export const gradeSchema = z.enum(GRADES as [Grade, ...Grade[]]);

export const planStateSchema = z.object({
  passed: z.array(z.string().max(64)).max(500),
  place: z.record(z.string(), semester),
  choices: z.record(z.string(), choiceSchema),
  extras: z.array(extraSchema).max(50),
  grades: z.record(z.string(), gradeSchema),
});

export const planSettingsSchema = z.object({
  autoShift: z.boolean(),
  showEdges: z.boolean(),
  colors: z.record(z.string(), hexColor),
});

export type PlanSettings = z.infer<typeof planSettingsSchema>;

export const defaultSettings: PlanSettings = { autoShift: true, showEdges: true, colors: {} };

/** ไฟล์สำรองข้อมูลที่ผู้ใช้ดาวน์โหลดและนำเข้าได้ */
export const planFileSchema = z.object({
  app: z.literal("cp-graduation-roadmap"),
  version: z.literal(1),
  curriculumId: z.string(),
  exportedAt: z.string(),
  plan: planStateSchema,
  settings: planSettingsSchema,
});

export type PlanFile = z.infer<typeof planFileSchema>;

// ---------- API ของบัญชีและแผน ----------
export const userSchema = z.object({ id: z.string(), email: z.string(), name: z.string() });
export type User = z.infer<typeof userSchema>;

/** ไม่ login ก็ตอบ 200 เพราะเป็นสถานะปกติ ไม่ใช่ error */
export const meSchema = z.object({ user: userSchema.nullable(), loginAvailable: z.boolean() });

const planName = z.string().trim().min(1).max(60);

export const planSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  curriculumId: z.string(),
  version: z.number().int(),
  updatedAt: z.string(),
});
export const planListSchema = z.array(planSummarySchema);

export const planDetailSchema = planSummarySchema.extend({
  state: planStateSchema,
  settings: planSettingsSchema,
});
export type PlanDetail = z.infer<typeof planDetailSchema>;

export const createPlanSchema = z.object({
  curriculumId: z.string().min(1).max(64),
  name: planName,
  /** ส่งมาด้วยเมื่อย้ายแผนจากเบราว์เซอร์ ถ้าไม่ส่งจะได้แผนว่าง */
  state: planStateSchema.optional(),
  settings: planSettingsSchema.optional(),
});

export const savePlanSchema = z.object({
  /** version ที่ผู้ใช้เห็นล่าสุด ถ้าไม่ตรงกับในฐานข้อมูลแปลว่ามีเครื่องอื่นบันทึกไปก่อนแล้ว */
  version: z.number().int().positive(),
  state: planStateSchema,
  settings: planSettingsSchema,
});

export const savedPlanSchema = z.object({ version: z.number().int(), updatedAt: z.string() });

export const planConflictSchema = apiErrorSchema.extend({ plan: planDetailSchema });

export const planInvalidSchema = apiErrorSchema.extend({
  problems: z.array(z.object({ code: z.string(), id: z.string() })),
});

export const accountExportSchema = z.object({
  exportedAt: z.string(),
  user: userSchema.extend({ createdAt: z.string() }),
  plans: z.array(planDetailSchema.extend({ deletedAt: z.string().nullable() })),
});
