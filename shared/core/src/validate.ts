// ตรวจแผนฝั่ง server: หน้าเว็บตรวจเพื่อให้ตอบสนองทันที แต่ผู้ใช้ส่งข้อมูลอะไรมาก็ได้ server จึงต้องตรวจเองด้วย
// ลำดับเทอมที่ผิดไม่นับเป็นปัญหา เพราะผู้ใช้ปิดการเลื่อนอัตโนมัติ แล้วเก็บไว้แก้เองได้

import { isGrade, PASSING } from "./grades.ts";
import { buildGraph, isSem, offeredIn } from "./graph.ts";
import { effectiveCourses, extraCategories, optionOf } from "./model.ts";
import type { Curriculum, PlanState } from "./types.ts";

export type PlanProblemCode =
  | "UNKNOWN_COURSE"
  | "MISSING_PLACEMENT"
  | "INVALID_SEMESTER"
  | "NOT_OFFERED"
  | "PREREQ_NOT_PASSED"
  | "INVALID_GRADE"
  | "GRADE_MISMATCH"
  | "INVALID_CHOICE"
  | "OPTION_REUSED"
  | "INVALID_EXTRA";

export interface PlanProblem {
  code: PlanProblemCode;
  id: string;
}

export function validatePlan(cur: Curriculum, state: PlanState): PlanProblem[] {
  const problems: PlanProblem[] = [];
  const add = (code: PlanProblemCode, id: string) => problems.push({ code, id });

  const slots = new Map(cur.courses.map((c) => [c.id, c]));
  const used = new Set<string>();
  for (const [slotId, choice] of Object.entries(state.choices)) {
    const slot = slots.get(slotId);
    if (!slot?.pool || (choice.id !== null && !optionOf(cur, slot, choice.id))) {
      add("INVALID_CHOICE", slotId);
      continue;
    }
    if (choice.id === null) continue;
    if (used.has(choice.id)) add("OPTION_REUSED", slotId);
    used.add(choice.id);
  }

  const allowedCategories = new Set(extraCategories(cur));
  const extraIds = new Set<string>();
  for (const e of state.extras) {
    if (
      slots.has(e.id) ||
      extraIds.has(e.id) ||
      !allowedCategories.has(e.category) ||
      state.place[e.id] !== e.semester
    ) {
      add("INVALID_EXTRA", e.id);
    }
    extraIds.add(e.id);
  }

  // ถ้าโครงสร้างผิดแล้ว กราฟจะไม่น่าเชื่อถือ จึงหยุดตรงนี้
  if (problems.length) return problems;

  const courses = effectiveCourses(cur, state.choices, state.extras);
  const g = buildGraph(courses);
  const passed = new Set(state.passed);

  for (const id of Object.keys(state.place)) if (!g.courses.has(id)) add("UNKNOWN_COURSE", id);
  for (const c of courses) {
    const sem = state.place[c.id];
    if (sem === undefined) add("MISSING_PLACEMENT", c.id);
    else if (!isSem(sem)) add("INVALID_SEMESTER", c.id);
    else if (!offeredIn(c, sem)) add("NOT_OFFERED", c.id);
  }
  for (const id of passed) {
    if (!g.courses.has(id)) add("UNKNOWN_COURSE", id);
    else if ((g.prereqs.get(id) ?? []).some((p) => !passed.has(p))) add("PREREQ_NOT_PASSED", id);
  }
  for (const [id, grade] of Object.entries(state.grades)) {
    if (!g.courses.has(id)) add("UNKNOWN_COURSE", id);
    else if (!isGrade(grade)) add("INVALID_GRADE", id);
    else if (PASSING.has(grade) !== passed.has(id)) add("GRADE_MISMATCH", id);
  }
  return problems;
}
