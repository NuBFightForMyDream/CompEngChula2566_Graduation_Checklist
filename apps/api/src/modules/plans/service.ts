// ทุกฟังก์ชันรับ userId และกรองด้วยค่านี้เสมอ แผนของคนอื่นจึงเหมือนไม่มีอยู่

import {
  accountExportSchema,
  defaultSettings,
  type PlanDetail,
  type PlanSettings,
  planDetailSchema,
} from "@cp/contracts";
import { emptyPlan, normalizePlan, type PlanProblem, type PlanState, validatePlan } from "@cp/core";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../../db/client.ts";
import { planItems, plans, users } from "../../db/schema.ts";
import { getCurriculum } from "../curricula/repo.ts";

export const MAX_PLANS_PER_USER = 10;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type ItemRow = typeof planItems.$inferSelect;

function stateToRows(planId: string, state: PlanState): (typeof planItems.$inferInsert)[] {
  const passed = new Set(state.passed);
  const extras = new Map(state.extras.map((e, i) => [e.id, { ...e, position: i }]));
  return Object.entries(state.place).map(([courseId, semester]) => {
    const extra = extras.get(courseId);
    const choice = state.choices[courseId];
    return {
      planId,
      courseId,
      kind: extra ? ("extra" as const) : ("curriculum" as const),
      semester,
      passed: passed.has(courseId),
      grade: state.grades[courseId] ?? null,
      choiceId: choice?.id ?? null,
      choiceCode: choice?.code ?? null,
      choiceName: choice?.name ?? null,
      choiceCredits: choice?.credits ?? null,
      extraCode: extra?.code ?? null,
      extraName: extra?.name ?? null,
      extraCredits: extra?.credits ?? null,
      extraCategory: extra?.category ?? null,
      extraPosition: extra?.position ?? null,
    };
  });
}

function rowsToState(rows: ItemRow[]): PlanState {
  const state: PlanState = { passed: [], place: {}, choices: {}, extras: [], grades: {} };
  const extras: { position: number; extra: PlanState["extras"][number] }[] = [];
  for (const r of rows) {
    state.place[r.courseId] = r.semester;
    if (r.passed) state.passed.push(r.courseId);
    if (r.grade) state.grades[r.courseId] = r.grade as PlanState["grades"][string];
    if (r.choiceCode !== null) {
      state.choices[r.courseId] = {
        id: r.choiceId,
        code: r.choiceCode,
        name: r.choiceName as string,
        credits: r.choiceCredits as number,
      };
    }
    if (r.kind === "extra") {
      extras.push({
        position: r.extraPosition as number,
        extra: {
          id: r.courseId,
          code: r.extraCode as string,
          name: r.extraName as string,
          credits: r.extraCredits as number,
          category: r.extraCategory as string,
          semester: r.semester,
        },
      });
    }
  }
  state.extras = extras.sort((a, b) => a.position - b.position).map((e) => e.extra);
  return state;
}

async function writeItems(tx: Tx, planId: string, state: PlanState) {
  await tx.delete(planItems).where(eq(planItems.planId, planId));
  const rows = stateToRows(planId, state);
  if (rows.length) await tx.insert(planItems).values(rows);
}

const ownedPlan = (userId: string, planId: string) =>
  and(eq(plans.id, planId), eq(plans.userId, userId), isNull(plans.deletedAt));

export function listPlans(db: Db, userId: string) {
  return db
    .select({
      id: plans.id,
      name: plans.name,
      curriculumId: plans.curriculumId,
      version: plans.version,
      updatedAt: plans.updatedAt,
    })
    .from(plans)
    .where(and(eq(plans.userId, userId), isNull(plans.deletedAt)))
    .orderBy(desc(plans.updatedAt))
    .then((rows) => rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })));
}

/** อ่านแผนแล้วปรับให้ตรงกับหลักสูตรปัจจุบัน หลักสูตรอาจเปลี่ยนหลังจากบันทึกแผนไว้ */
export async function getPlan(db: Db, userId: string, planId: string): Promise<PlanDetail | null> {
  const [plan] = await db.select().from(plans).where(ownedPlan(userId, planId));
  if (!plan) return null;
  const curriculum = await getCurriculum(db, plan.curriculumId);
  if (!curriculum) return null;
  const rows = await db.select().from(planItems).where(eq(planItems.planId, planId));
  return planDetailSchema.parse({
    id: plan.id,
    name: plan.name,
    curriculumId: plan.curriculumId,
    version: plan.version,
    updatedAt: plan.updatedAt.toISOString(),
    settings: plan.settings,
    state: normalizePlan(curriculum, rowsToState(rows)),
  });
}

export type CreateResult =
  | { type: "created"; plan: PlanDetail }
  | { type: "unknownCurriculum" }
  | { type: "limitReached" }
  | { type: "invalid"; problems: PlanProblem[] };

export async function createPlan(
  db: Db,
  userId: string,
  input: { curriculumId: string; name: string; state?: PlanState; settings?: PlanSettings },
): Promise<CreateResult> {
  const curriculum = await getCurriculum(db, input.curriculumId);
  if (!curriculum) return { type: "unknownCurriculum" };
  const state = input.state ?? emptyPlan(curriculum);
  const problems = validatePlan(curriculum, state);
  if (problems.length) return { type: "invalid", problems };

  const id = await db.transaction(async (tx) => {
    // ล็อกแถวผู้ใช้ไว้ก่อนนับ ถ้าส่งคำขอพร้อมกันหลายอันจะได้เกินเพดานไม่ได้
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(plans)
      .where(and(eq(plans.userId, userId), isNull(plans.deletedAt)));
    if ((row?.n ?? 0) >= MAX_PLANS_PER_USER) return null;
    const [plan] = await tx
      .insert(plans)
      .values({
        userId,
        curriculumId: input.curriculumId,
        name: input.name,
        settings: input.settings ?? defaultSettings,
      })
      .returning({ id: plans.id });
    await writeItems(tx, (plan as { id: string }).id, state);
    return (plan as { id: string }).id;
  });
  if (!id) return { type: "limitReached" };
  return { type: "created", plan: (await getPlan(db, userId, id)) as PlanDetail };
}

export type SaveResult =
  | { type: "saved"; version: number; updatedAt: string }
  | { type: "notFound" }
  | { type: "conflict"; plan: PlanDetail }
  | { type: "invalid"; problems: PlanProblem[] };

/**
 * Optimistic locking: UPDATE จะสำเร็จก็ต่อเมื่อ version ยังตรงกับที่ผู้ใช้เห็น
 * ฐานข้อมูลล็อกแถวระหว่าง UPDATE ถ้าสองเครื่องบันทึกพร้อมกัน จะมีเครื่องเดียวที่สำเร็จ
 */
export async function savePlan(
  db: Db,
  userId: string,
  planId: string,
  input: { version: number; state: PlanState; settings: PlanSettings },
): Promise<SaveResult> {
  const [plan] = await db.select({ curriculumId: plans.curriculumId }).from(plans).where(ownedPlan(userId, planId));
  if (!plan) return { type: "notFound" };
  const curriculum = await getCurriculum(db, plan.curriculumId);
  if (!curriculum) return { type: "notFound" };
  const problems = validatePlan(curriculum, input.state);
  if (problems.length) return { type: "invalid", problems };

  const saved = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(plans)
      .set({ version: sql`${plans.version} + 1`, settings: input.settings, updatedAt: new Date() })
      .where(and(ownedPlan(userId, planId), eq(plans.version, input.version)))
      .returning({ version: plans.version, updatedAt: plans.updatedAt });
    if (!row) return null;
    await writeItems(tx, planId, input.state);
    return row;
  });
  if (saved) return { type: "saved", version: saved.version, updatedAt: saved.updatedAt.toISOString() };

  const current = await getPlan(db, userId, planId);
  return current ? { type: "conflict", plan: current } : { type: "notFound" };
}

export async function deletePlan(db: Db, userId: string, planId: string) {
  const rows = await db
    .update(plans)
    .set({ deletedAt: new Date() })
    .where(ownedPlan(userId, planId))
    .returning({ id: plans.id });
  return rows.length > 0;
}

/** ข้อมูลทั้งหมดของผู้ใช้ รวมแผนที่ลบไปแล้วแต่ยังเก็บอยู่ เจ้าของข้อมูลมีสิทธิ์เห็นครบ */
export async function exportAccount(db: Db, userId: string) {
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId));
  const rows = await db.select().from(plans).where(eq(plans.userId, userId)).orderBy(asc(plans.createdAt));
  const items = await Promise.all(rows.map((p) => db.select().from(planItems).where(eq(planItems.planId, p.id))));
  return accountExportSchema.parse({
    exportedAt: new Date().toISOString(),
    user: { ...user, createdAt: user?.createdAt.toISOString() },
    plans: rows.map((p, i) => ({
      id: p.id,
      name: p.name,
      curriculumId: p.curriculumId,
      version: p.version,
      updatedAt: p.updatedAt.toISOString(),
      deletedAt: p.deletedAt?.toISOString() ?? null,
      settings: p.settings,
      state: rowsToState(items[i] ?? []),
    })),
  });
}
