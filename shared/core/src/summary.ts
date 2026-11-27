// สรุปหน่วยกิต: นับรายหมวด เพราะหน่วยกิตส่วนเกินของหมวดหนึ่งชดเชยหมวดอื่นไม่ได้

import { gpaOf } from "./grades.ts";
import { ALL_TERMS } from "./graph.ts";
import type { PlanModel } from "./model.ts";
import { planRemaining } from "./planner.ts";
import type { Sem } from "./types.ts";

export interface CategorySummary {
  key: string;
  label: string;
  color: string;
  required: number;
  got: number;
  done: boolean;
}

export function creditSummary(m: PlanModel) {
  const { curriculum: cur, state } = m;
  const got = Object.fromEntries(Object.keys(cur.categories).map((k) => [k, 0])) as Record<string, number>;
  for (const id of m.passed) {
    const key = m.course(id).category;
    if (key in got) got[key] = (got[key] ?? 0) + m.creditsOf(id);
  }
  const categories: CategorySummary[] = Object.entries(cur.categories).map(([key, c]) => ({
    key,
    label: c.label,
    color: c.color,
    required: c.required,
    got: got[key] ?? 0,
    done: (got[key] ?? 0) >= c.required,
  }));
  const earned = categories.reduce((s, c) => s + c.got, 0);
  const counted = categories.reduce((s, c) => s + Math.min(c.got, c.required), 0);
  const inCategory = (category: string) => category in got;
  return {
    categories,
    earned,
    counted,
    remaining: Math.max(0, cur.totalCredits - counted),
    complete: categories.every((c) => c.done),
    extrasCounted: state.extras.filter((e) => inCategory(e.category)).reduce((s, e) => s + e.credits, 0),
    extrasOutside: state.extras.filter((e) => !inCategory(e.category)).reduce((s, e) => s + e.credits, 0),
  };
}

export function creditsInSem(m: PlanModel, sem: Sem) {
  return m.courses.filter((c) => m.state.place[c.id] === sem).reduce((s, c) => s + m.creditsOf(c.id), 0);
}

/** เทอมสุดท้ายที่มีวิชาวางอยู่ */
export const finishSem = (m: PlanModel) =>
  ALL_TERMS.filter((s) => m.courses.some((c) => m.state.place[c.id] === s)).at(-1) ?? null;

export const gpax = (m: PlanModel) => gpaOf(Object.keys(m.state.grades), m.state.grades, m.creditsOf);

export const termGpa = (m: PlanModel, sem: Sem) =>
  gpaOf(
    m.courses.filter((c) => m.state.place[c.id] === sem).map((c) => c.id),
    m.state.grades,
    m.creditsOf,
  );

export const availableCourses = (m: PlanModel) => m.courses.filter((c) => m.statusOf(c.id) === "available");

export const remainingPlan = (m: PlanModel) =>
  planRemaining(m.graph, m.order, m.passed, m.state.place, m.curriculum.maxCreditsPerSemester, m.creditsOf);

/** จบภายในปีการศึกษาที่ 4 (รวมภาคฤดูร้อนของปี 4) ถือว่าจบใน 4 ปี */
const ON_TIME_YEARS = 4;

export interface GraduationStatus {
  /** ผ่านครบทุกหมวดตามหลักสูตร */
  canGraduate: boolean;
  /** 1 = เกียรตินิยมอันดับ 1, 2 = อันดับ 2, null = จบตามเงื่อนไขปกติ */
  honors: 1 | 2 | null;
  /** GPAX 2 ตำแหน่ง ตัดทศนิยมทิ้งแบบเดียวกับที่แสดง */
  gpa: number | null;
  /** วิชาที่ผ่านทั้งหมดอยู่ภายในปี 4 */
  onTime: boolean;
  /** ไม่มีเกรด F หรือ U ในแผน */
  noFail: boolean;
}

/**
 * เกียรตินิยมอันดับ 1: GPAX ≥ 3.60 · อันดับ 2: GPAX ≥ 3.25
 * ทั้งสองแบบต้องจบใน 4 ปี และไม่เคยได้ F หรือ U
 */
export function graduationStatus(m: PlanModel): GraduationStatus {
  const raw = gpax(m).gpa;
  const gpa = raw === null ? null : Math.floor(raw * 100 + 1e-9) / 100;
  const onTime = [...m.passed].every((id) => {
    const sem = m.state.place[id];
    return sem === undefined || Number(sem.charAt(0)) <= ON_TIME_YEARS;
  });
  const noFail = Object.values(m.state.grades).every((g) => g !== "F" && g !== "U");
  const canGraduate = creditSummary(m).complete;
  const eligible = canGraduate && onTime && noFail && gpa !== null;
  const honors = !eligible ? null : gpa >= 3.6 ? 1 : gpa >= 3.25 ? 2 : null;
  return { canGraduate, honors, gpa, onTime, noFail };
}
