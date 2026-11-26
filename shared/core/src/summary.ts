// สรุปหน่วยกิต: นับรายหมวด เพราะหน่วยกิตส่วนเกินของหมวดหนึ่งชดเชยหมวดอื่นไม่ได้

import { gpaOf } from "./grades.ts";
import { SEMS } from "./graph.ts";
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
  SEMS.filter((s) => m.courses.some((c) => m.state.place[c.id] === s)).at(-1) ?? null;

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
