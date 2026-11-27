// อัลกอริทึมกราฟล้วน ๆ: วิชา = node, prereq = ลูกศร
// ไม่รู้จักหน้าเว็บหรือฐานข้อมูล จึงทดสอบและใช้ซ้ำได้ทั้งสองฝั่ง

import type { Course, Sem } from "./types.ts";

/** ภาคปกติ: คอลัมน์บนตาราง และเทอมที่ใช้จัดแผน */
export const SEMS = ["1/1", "1/2", "2/1", "2/2", "3/1", "3/2", "4/1", "4/2", "5/1", "5/2"] as const;
/** ภาคฤดูร้อน "ปี/3" ใช้กับแถว GenEd เท่านั้น */
export const SUMMERS = ["1/3", "2/3", "3/3", "4/3", "5/3"] as const;
/** ทุกภาคเรียงตามเวลา: ต้น ปลาย ฤดูร้อน ของแต่ละปี */
export const ALL_TERMS = [
  "1/1",
  "1/2",
  "1/3",
  "2/1",
  "2/2",
  "2/3",
  "3/1",
  "3/2",
  "3/3",
  "4/1",
  "4/2",
  "4/3",
  "5/1",
  "5/2",
  "5/3",
] as const;

export const isSem = (s: unknown): s is Sem => typeof s === "string" && (ALL_TERMS as readonly string[]).includes(s);
export const isSummer = (s: Sem) => s.charAt(2) === "3";
/** ลำดับเวลาของภาค ภาคฤดูร้อนได้ค่า .5 อยู่ระหว่างเทอมปลายกับเทอมต้นของปีถัดไป */
export const semIdx = (s: Sem) => (Number(s.charAt(0)) - 1) * 2 + (isSummer(s) ? 1.5 : Number(s.charAt(2)) - 1);
/** ภาคปกติลำดับที่ i (ไม่มีภาคฤดูร้อน) */
export const semAt = (i: number): Sem => `${Math.floor(i / 2) + 1}/${(i % 2) + 1}`;

/** วิชาที่ระบุ offered เลื่อนข้ามปีได้ แต่ข้ามเทอมไม่ได้ ภาคฤดูร้อนต้องระบุ "3" หรือไม่ระบุ offered เลย */
export const offeredIn = (course: Pick<Course, "offered">, sem: Sem) =>
  !course.offered || course.offered.includes(sem.charAt(2));

export interface Graph {
  courses: Map<string, Course>;
  prereqs: Map<string, string[]>;
  unlocks: Map<string, string[]>;
}

export function buildGraph(list: Course[]): Graph {
  const courses = new Map(list.map((c) => [c.id, c]));
  const prereqs = new Map(list.map((c) => [c.id, c.prereq]));
  const unlocks = new Map<string, string[]>(list.map((c) => [c.id, []]));
  for (const [id, pres] of prereqs) {
    for (const p of pres) {
      const out = unlocks.get(p);
      if (!out) throw new Error(`${id} อ้างถึง prereq ${p} ที่ไม่มีในหลักสูตร`);
      out.push(id);
    }
  }
  return { courses, prereqs, unlocks };
}

/** Kahn's algorithm ถ้าผลลัพธ์สั้นกว่าจำนวนวิชา แปลว่ากราฟมีวงวน */
export function topoSort({ prereqs, unlocks }: Pick<Graph, "prereqs" | "unlocks">): string[] {
  const indeg = new Map([...prereqs].map(([k, v]) => [k, v.length]));
  const queue = [...prereqs.keys()].filter((k) => indeg.get(k) === 0);
  for (let i = 0; i < queue.length; i++) {
    for (const v of unlocks.get(queue[i] as string) ?? []) {
      const left = (indeg.get(v) ?? 0) - 1;
      indeg.set(v, left);
      if (left === 0) queue.push(v);
    }
  }
  return queue;
}

/** DFS ย้อนกลับ: ทุกวิชาที่ต้องผ่านก่อนจะลง target ได้ */
export function prereqChain(prereqs: Graph["prereqs"], target: string): Set<string> {
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    for (const p of prereqs.get(stack.pop() as string) ?? []) {
      if (!seen.has(p)) {
        seen.add(p);
        stack.push(p);
      }
    }
  }
  return seen;
}

/** BFS ไปข้างหน้า: ถ้าตก target จะกระทบวิชาไหนบ้าง */
export function affected(unlocks: Graph["unlocks"], target: string): Set<string> {
  const seen = new Set<string>();
  const queue = [target];
  for (let i = 0; i < queue.length; i++) {
    for (const v of unlocks.get(queue[i] as string) ?? []) {
      if (!seen.has(v)) {
        seen.add(v);
        queue.push(v);
      }
    }
  }
  return seen;
}

/** DP บน DAG: ความยาวสายวิชาที่เหลือ นับจากแต่ละวิชา */
export function chainDepth(order: string[], unlocks: Graph["unlocks"], remaining: Set<string>) {
  const depth = new Map<string, number>();
  for (const v of [...order].reverse()) {
    if (!remaining.has(v)) continue;
    let best = 0;
    for (const w of unlocks.get(v) ?? []) {
      if (remaining.has(w)) best = Math.max(best, depth.get(w) ?? 0);
    }
    depth.set(v, best + 1);
  }
  return depth;
}

/** prereq ต้องอยู่เทอมก่อนหน้าแบบเคร่ง: คืนคู่ [prereq, วิชา] ที่ผิดลำดับ */
export function findConflicts(prereqs: Graph["prereqs"], place: Record<string, Sem>) {
  const bad: [string, string][] = [];
  for (const [id, pres] of prereqs) {
    for (const p of pres) {
      if (semIdx(place[p] as Sem) >= semIdx(place[id] as Sem)) bad.push([p, id]);
    }
  }
  return bad;
}

export interface ShiftResult {
  place: Record<string, Sem>;
  moved: [id: string, from: Sem, to: Sem][];
  /** วิชาที่ต้องเลื่อนเกินปี 5 จึงเลื่อนไม่ได้ */
  stuck: string[];
}

/**
 * เดินตาม topological order แล้วดันวิชาที่ผิดลำดับไปเทอมถัดจาก prereq ที่ช้าที่สุด
 * ถ้าเทอมนั้นไม่เปิดสอนให้ขยับต่อ · only = เลื่อนเฉพาะวิชาในเซตนี้
 */
export function shiftDependents(
  order: string[],
  prereqs: Graph["prereqs"],
  place: Record<string, Sem>,
  only: Set<string> | null,
  courses: Graph["courses"],
): ShiftResult {
  const next = { ...place };
  const moved: ShiftResult["moved"] = [];
  const stuck: string[] = [];
  for (const v of order) {
    const pres = prereqs.get(v) ?? [];
    if (!pres.length || (only && !only.has(v))) continue;
    const course = courses.get(v) as Course;
    let need = Math.floor(Math.max(...pres.map((p) => semIdx(next[p] as Sem)))) + 1;
    while (need < SEMS.length && !offeredIn(course, SEMS[need] as Sem)) need++;
    if (semIdx(next[v] as Sem) >= need) continue;
    if (need >= SEMS.length) {
      stuck.push(v);
      continue;
    }
    moved.push([v, next[v] as Sem, SEMS[need] as Sem]);
    next[v] = SEMS[need] as Sem;
  }
  return { place: next, moved, stuck };
}
