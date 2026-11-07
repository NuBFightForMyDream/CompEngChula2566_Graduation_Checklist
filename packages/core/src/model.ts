// รวมหลักสูตรกับแผนของผู้ใช้เป็นมุมมองเดียว
// จุดสำคัญ: ช่องวิชาเลือกที่เลือกวิชาแล้ว จะได้ prereq และ offered ของวิชาที่เลือก ตาม JSON หลักสูตร

import { isGrade, PASSING } from "./grades.ts";
import { buildGraph, findConflicts, type Graph, isSem, offeredIn, SEMS, semIdx, topoSort } from "./graph.ts";
import type {
  Choice,
  Course,
  CourseStatus,
  Curriculum,
  ExtraCourse,
  Grade,
  PlanState,
  PoolOption,
  Sem,
} from "./types.ts";

/** category ของวิชาเรียนเพิ่มที่ไม่นับเข้าหมวดใดในหลักสูตร */
export const EXTRA_CATEGORY = "extra";
const EXTRA_CATEGORY_ORDER = ["gened", "21st", "approved", "elective", "free"];

/** หมวดที่วิชาเรียนเพิ่มเลือกนับเข้าได้ ใช้เฉพาะหมวดที่มีจริงใน JSON */
export const extraCategories = (cur: Curriculum) => [
  ...EXTRA_CATEGORY_ORDER.filter((k) => cur.categories[k]),
  EXTRA_CATEGORY,
];

export const optionOf = (cur: Curriculum, slot: Course, optionId: string | null): PoolOption | undefined =>
  optionId === null || !slot.pool ? undefined : cur.pools?.[slot.pool]?.options.find((o) => o.id === optionId);

const extraToCourse = (e: ExtraCourse): Course => ({ ...e, prereq: [], extra: true });

/** วิชาจริงที่มีผลในแผนนี้ รวม prereq / offered ของวิชาที่เลือกลงช่อง และวิชาเรียนเพิ่ม */
export function effectiveCourses(cur: Curriculum, choices: Record<string, Choice>, extras: ExtraCourse[]): Course[] {
  const slots = cur.courses.map((c) => {
    const choice = choices[c.id];
    const option = choice ? optionOf(cur, c, choice.id) : undefined;
    if (!option) return c;
    return { ...c, prereq: option.prereq ?? c.prereq, offered: option.offered ?? c.offered };
  });
  return [...slots, ...extras.map(extraToCourse)];
}

/** เทอมเริ่มต้นของวิชา ถ้าเทอมในแผนไม่เปิดสอนจะหาเทอมถัดไปที่เปิด */
export function defaultSemOf(course: Course): Sem {
  if (offeredIn(course, course.semester)) return course.semester;
  const later = SEMS.find((s) => semIdx(s) > semIdx(course.semester) && offeredIn(course, s));
  return later ?? SEMS.find((s) => offeredIn(course, s)) ?? course.semester;
}

export const defaultPlace = (courses: Course[]) => Object.fromEntries(courses.map((c) => [c.id, defaultSemOf(c)]));

export const emptyPlan = (cur: Curriculum): PlanState => ({
  passed: [],
  place: defaultPlace(cur.courses),
  choices: {},
  extras: [],
  grades: {},
});

/** เก็บเฉพาะวิชาที่ prereq ผ่านครบ เดินตาม topological order รอบเดียว */
export function cleanPassed(g: Graph, order: string[], passed: Iterable<string>): Set<string> {
  const wanted = new Set(passed);
  const ok = new Set<string>();
  for (const v of order) {
    if (wanted.has(v) && (g.prereqs.get(v) ?? []).every((p) => ok.has(p))) ok.add(v);
  }
  return ok;
}

/** ทำความสะอาดแผนที่โหลดมา (จากเบราว์เซอร์ ไฟล์ หรือ API) ให้ตรงกับหลักสูตรปัจจุบัน */
export function normalizePlan(cur: Curriculum, raw: Partial<PlanState> | null | undefined): PlanState {
  const extras = (raw?.extras ?? [])
    .filter((e) => e?.id && isSem(e.semester))
    .map((e) => ({ ...e, category: cur.categories[e.category] ? e.category : EXTRA_CATEGORY }));

  const choices: Record<string, Choice> = {};
  for (const [id, choice] of Object.entries(raw?.choices ?? {})) {
    const slot = cur.courses.find((c) => c.id === id);
    if (!slot?.pool || !choice) continue;
    if (choice.id === null) {
      choices[id] = choice;
      continue;
    }
    const option = optionOf(cur, slot, choice.id);
    if (option) choices[id] = { id: option.id, code: option.code, name: option.name, credits: option.credits };
  }

  const courses = effectiveCourses(cur, choices, extras);
  const g = buildGraph(courses);
  const order = topoSort(g);
  const passed = cleanPassed(g, order, raw?.passed ?? []);

  const place = defaultPlace(courses);
  for (const c of courses) {
    const sem = raw?.place?.[c.id];
    if (isSem(sem) && offeredIn(c, sem)) place[c.id] = sem;
  }

  const grades: Record<string, Grade> = {};
  for (const [id, grade] of Object.entries(raw?.grades ?? {})) {
    if (g.courses.has(id) && isGrade(grade) && PASSING.has(grade) === passed.has(id)) grades[id] = grade;
  }

  // ลำดับใน passed ไม่สำคัญ แต่ทำให้คงที่เพื่อเทียบ state กันได้
  return { passed: order.filter((id) => passed.has(id)), place, choices, extras, grades };
}

export interface PlanModel {
  curriculum: Curriculum;
  state: PlanState;
  courses: Course[];
  graph: Graph;
  order: string[];
  passed: Set<string>;
  conflicts: [string, string][];
  course(id: string): Course;
  codeOf(id: string): string;
  nameOf(id: string): string;
  creditsOf(id: string): number;
  label(id: string): string;
  statusOf(id: string): CourseStatus;
  missingPrereqs(id: string): string[];
  isMoved(id: string): boolean;
}

export function createModel(curriculum: Curriculum, state: PlanState): PlanModel {
  const courses = effectiveCourses(curriculum, state.choices, state.extras);
  const graph = buildGraph(courses);
  const passed = new Set(state.passed);
  const course = (id: string) => {
    const found = graph.courses.get(id);
    if (!found) throw new Error(`ไม่พบวิชา ${id}`);
    return found;
  };
  const codeOf = (id: string) => {
    const c = course(id);
    return state.choices[id]?.code ?? c.code ?? c.id;
  };
  const nameOf = (id: string) => state.choices[id]?.name ?? course(id).name;
  const missingPrereqs = (id: string) => (graph.prereqs.get(id) ?? []).filter((p) => !passed.has(p));
  return {
    curriculum,
    state,
    courses,
    graph,
    order: topoSort(graph),
    passed,
    conflicts: findConflicts(graph.prereqs, state.place),
    course,
    codeOf,
    nameOf,
    creditsOf: (id) => state.choices[id]?.credits ?? course(id).credits,
    label: (id) => `${codeOf(id)} ${nameOf(id)}`,
    statusOf: (id) => (passed.has(id) ? "passed" : missingPrereqs(id).length ? "locked" : "available"),
    missingPrereqs,
    isMoved: (id) => state.place[id] !== defaultSemOf(course(id)),
  };
}
