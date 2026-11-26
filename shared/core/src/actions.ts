// การเปลี่ยนแผนทุกแบบ เป็นฟังก์ชันล้วน: รับ model คืน state ใหม่พร้อมผลลัพธ์
// ไม่มีข้อความภาษาไทยในชั้นนี้ หน้าเว็บเป็นคนแปลงผลลัพธ์เป็นข้อความเอง

import { PASSING, parseGradeTokens } from "./grades.ts";
import { affected, offeredIn, SEMS, type ShiftResult, semIdx, shiftDependents } from "./graph.ts";
import {
  createModel,
  defaultPlace,
  defaultSemOf,
  emptyPlan,
  normalizePlan,
  optionOf,
  type PlanModel,
} from "./model.ts";
import type { Choice, Curriculum, ExtraCourse, Grade, PlanState, Sem } from "./types.ts";

export type Outcome =
  | { type: "moved"; id: string; sem: Sem; moved: ShiftResult["moved"]; stuck: string[] }
  | { type: "notOffered"; id: string; sem: Sem }
  | { type: "prereqMissing"; id: string; missing: string[]; grade?: Grade }
  | { type: "passed"; id: string }
  | { type: "unpassed"; id: string; cascade: string[] }
  | { type: "gradeSet"; id: string; grade: Grade | null; cascade: string[] }
  | { type: "shifted"; moved: ShiftResult["moved"]; stuck: string[] }
  | { type: "extraAdded"; id: string; sem: Sem }
  | { type: "extraRemoved"; label: string }
  | {
      type: "choiceSet";
      id: string;
      relocatedTo: Sem | null;
      unpassed: boolean;
      moved: ShiftResult["moved"];
      stuck: string[];
    }
  | { type: "optionUsed"; id: string; optionId: string }
  | { type: "noop" };

export interface ActionResult {
  state: PlanState;
  outcome: Outcome;
}

const blocked = (m: PlanModel, outcome: Outcome): ActionResult => ({ state: m.state, outcome });

export function moveCourse(m: PlanModel, id: string, sem: Sem, opts: { autoShift: boolean }): ActionResult {
  const { state } = m;
  if (state.place[id] === sem) return blocked(m, { type: "noop" });
  if (!offeredIn(m.course(id), sem)) return blocked(m, { type: "notOffered", id, sem });
  const extras = state.extras.map((e) => (e.id === id ? { ...e, semester: sem } : e));
  let place = { ...state.place, [id]: sem };
  let moved: ShiftResult["moved"] = [];
  let stuck: string[] = [];
  if (opts.autoShift) {
    const res = shiftDependents(m.order, m.graph.prereqs, place, affected(m.graph.unlocks, id), m.graph.courses);
    place = res.place;
    moved = res.moved;
    stuck = res.stuck;
  }
  return { state: { ...state, place, extras }, outcome: { type: "moved", id, sem, moved, stuck } };
}

/** ยกเลิกผ่านวิชานี้และวิชาที่ต่อจากนี้ พร้อมลบเกรดผ่านของวิชาเหล่านั้น */
function unpass(m: PlanModel, passed: Set<string>, grades: Record<string, Grade>, id: string): string[] {
  const cascade = [...affected(m.graph.unlocks, id)].filter((x) => passed.has(x));
  for (const x of [id, ...cascade]) {
    passed.delete(x);
    const grade = grades[x];
    if (grade && PASSING.has(grade)) delete grades[x];
  }
  return cascade;
}

export function togglePassed(m: PlanModel, id: string): ActionResult {
  const passed = new Set(m.passed);
  const grades = { ...m.state.grades };
  if (passed.has(id)) {
    const cascade = unpass(m, passed, grades, id);
    return { state: { ...m.state, passed: [...passed], grades }, outcome: { type: "unpassed", id, cascade } };
  }
  const missing = m.missingPrereqs(id);
  if (missing.length) return blocked(m, { type: "prereqMissing", id, missing });
  passed.add(id);
  // เคยได้ F / U / W แล้วติ๊กผ่าน = เรียนใหม่ผ่านแล้ว
  const grade = grades[id];
  if (grade && !PASSING.has(grade)) delete grades[id];
  return { state: { ...m.state, passed: [...passed], grades }, outcome: { type: "passed", id } };
}

function applyGrade(m: PlanModel, passed: Set<string>, grades: Record<string, Grade>, id: string, grade: Grade | null) {
  if (!grade) {
    delete grades[id];
    return { missing: [], cascade: [] };
  }
  if (PASSING.has(grade)) {
    const missing = (m.graph.prereqs.get(id) ?? []).filter((p) => !passed.has(p));
    if (missing.length) return { missing, cascade: [] };
    grades[id] = grade;
    passed.add(id);
    return { missing: [], cascade: [] };
  }
  const cascade = passed.has(id) ? unpass(m, passed, grades, id) : [];
  grades[id] = grade;
  return { missing: [], cascade };
}

export function setGrade(m: PlanModel, id: string, grade: Grade | null): ActionResult {
  const passed = new Set(m.passed);
  const grades = { ...m.state.grades };
  const { missing, cascade } = applyGrade(m, passed, grades, id, grade);
  if (missing.length) return blocked(m, { type: "prereqMissing", id, missing, ...(grade ? { grade } : {}) });
  return { state: { ...m.state, passed: [...passed], grades }, outcome: { type: "gradeSet", id, grade, cascade } };
}

export interface GradeImportResult {
  state: PlanState;
  done: number;
  failed: string[];
  unknown: string[];
}

export function importGrades(m: PlanModel, text: string): GradeImportResult {
  const byCode = new Map<string, string>();
  for (const c of m.courses) {
    byCode.set(c.id, c.id);
    const code = m.codeOf(c.id);
    if (!/[xy]/i.test(code)) byCode.set(code, c.id); // ข้ามรหัสช่องว่างอย่าง 2110xxx
  }
  const wanted = new Map<string, Grade>();
  const unknown: string[] = [];
  for (const [code, grade] of parseGradeTokens(text)) {
    const id = byCode.get(code);
    if (id) wanted.set(id, grade);
    else if (/^\d{7}$/.test(code)) unknown.push(code);
  }
  // ใส่ตาม topological order เพื่อให้ prereq ผ่านก่อนวิชาที่ต่อจากมัน
  const passed = new Set(m.passed);
  const grades = { ...m.state.grades };
  const failed: string[] = [];
  let done = 0;
  for (const id of m.order) {
    const grade = wanted.get(id);
    if (!grade) continue;
    if (applyGrade(m, passed, grades, id, grade).missing.length) failed.push(id);
    else done++;
  }
  return { state: { ...m.state, passed: [...passed], grades }, done, failed, unknown };
}

export function shiftCourses(m: PlanModel, only: Set<string> | null): ActionResult {
  const res = shiftDependents(m.order, m.graph.prereqs, m.state.place, only, m.graph.courses);
  return { state: { ...m.state, place: res.place }, outcome: { type: "shifted", moved: res.moved, stuck: res.stuck } };
}

export function addExtra(m: PlanModel, extra: ExtraCourse): ActionResult {
  return {
    state: {
      ...m.state,
      extras: [...m.state.extras, extra],
      place: { ...m.state.place, [extra.id]: extra.semester },
    },
    outcome: { type: "extraAdded", id: extra.id, sem: extra.semester },
  };
}

export function removeExtra(m: PlanModel, id: string): ActionResult {
  const label = m.label(id);
  const place = { ...m.state.place };
  const grades = { ...m.state.grades };
  delete place[id];
  delete grades[id];
  return {
    state: {
      ...m.state,
      extras: m.state.extras.filter((e) => e.id !== id),
      passed: m.state.passed.filter((p) => p !== id),
      place,
      grades,
    },
    outcome: { type: "extraRemoved", label },
  };
}

export function setExtraCategory(m: PlanModel, id: string, category: string): ActionResult {
  return {
    state: { ...m.state, extras: m.state.extras.map((e) => (e.id === id ? { ...e, category } : e)) },
    outcome: { type: "noop" },
  };
}

/**
 * เลือกวิชาลงช่อง: ช่องจะได้ prereq และ offered ของวิชานั้น จึงอาจต้องย้ายเทอม
 * และถ้าเคยติ๊กผ่านไว้แต่ prereq ใหม่ไม่ครบ ระบบจะยกเลิกการผ่าน
 */
export function setChoice(
  m: PlanModel,
  slotId: string,
  choice: Choice | null,
  opts: { autoShift: boolean },
): ActionResult {
  const { state, curriculum } = m;
  if (choice?.id) {
    const usedElsewhere = Object.entries(state.choices).some(([k, v]) => k !== slotId && v.id === choice.id);
    if (usedElsewhere) return blocked(m, { type: "optionUsed", id: slotId, optionId: choice.id });
    if (!optionOf(curriculum, m.course(slotId), choice.id)) return blocked(m, { type: "noop" });
  }
  const choices = { ...state.choices };
  if (choice) choices[slotId] = choice;
  else delete choices[slotId];

  const next = createModel(curriculum, { ...state, choices });
  const course = next.course(slotId);
  const current = state.place[slotId] as Sem;
  let relocatedTo: Sem | null = null;
  let place = state.place;
  if (!offeredIn(course, current)) {
    relocatedTo =
      SEMS.find((s) => semIdx(s) > semIdx(current) && offeredIn(course, s)) ??
      SEMS.find((s) => offeredIn(course, s)) ??
      null;
    if (relocatedTo) place = { ...place, [slotId]: relocatedTo };
  }
  let moved: ShiftResult["moved"] = [];
  let stuck: string[] = [];
  if (opts.autoShift) {
    const only = new Set([slotId, ...affected(next.graph.unlocks, slotId)]);
    const res = shiftDependents(next.order, next.graph.prereqs, place, only, next.graph.courses);
    place = res.place;
    moved = res.moved;
    stuck = res.stuck;
  }
  const cleaned = normalizePlan(curriculum, { ...state, choices, place });
  return {
    state: cleaned,
    outcome: {
      type: "choiceSet",
      id: slotId,
      relocatedTo,
      moved,
      stuck,
      unpassed: m.passed.has(slotId) && !cleaned.passed.includes(slotId),
    },
  };
}

export const resetPlacement = (m: PlanModel): PlanState => ({ ...m.state, place: defaultPlace(m.courses) });

export const resetAll = (cur: Curriculum): PlanState => emptyPlan(cur);

/** ตัวอย่างสำหรับลองใช้งาน: ผ่านวิชาปี 1 ทั้งหมด */
export function sampleYear1(m: PlanModel): PlanState {
  const passed = m.courses.filter((c) => defaultSemOf(c).startsWith("1/")).map((c) => c.id);
  return normalizePlan(m.curriculum, { ...m.state, passed });
}
