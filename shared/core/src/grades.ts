// เกรดที่นับในเกรดเฉลี่ย: A=4 ... F=0 · S / U / W ไม่นับ
// เกรดผ่าน (A–D, S) ติ๊กผ่านให้อัตโนมัติ · F / U / W = ไม่ผ่าน

import type { Grade } from "./types.ts";

export const GRADE_POINTS: Partial<Record<Grade, number>> = {
  A: 4,
  "B+": 3.5,
  B: 3,
  "C+": 2.5,
  C: 2,
  "D+": 1.5,
  D: 1,
  F: 0,
};
export const GRADES: Grade[] = ["A", "B+", "B", "C+", "C", "D+", "D", "F", "S", "U", "W"];
export const PASSING = new Set<Grade>(["A", "B+", "B", "C+", "C", "D+", "D", "S"]);
export const isGrade = (g: unknown): g is Grade => GRADES.includes(g as Grade);

/** GPA = Σ(แต้มเกรด × หน่วยกิต) / Σหน่วยกิต เฉพาะวิชาที่มีเกรด A–F */
export function gpaOf(ids: Iterable<string>, grades: Record<string, Grade>, creditsOf: (id: string) => number) {
  let points = 0;
  let credits = 0;
  for (const id of ids) {
    const grade = grades[id];
    const gp = grade === undefined ? undefined : GRADE_POINTS[grade];
    if (gp === undefined) continue;
    points += gp * creditsOf(id);
    credits += creditsOf(id);
  }
  return { gpa: credits ? points / credits : null, credits };
}

/** แสดง 2 ตำแหน่งโดยตัดทศนิยมที่เหลือทิ้ง ไม่ปัดขึ้น */
export const fmtGpa = (x: number) => (Math.floor(x * 100 + 1e-9) / 100).toFixed(2);

/** รับได้ทั้ง "2110101 A" บรรทัดละวิชา และรูปแบบ {"2110101","A"} จากโค้ด C++ */
export function parseGradeTokens(text: string): [code: string, grade: Grade][] {
  const tokens = text
    .replace(/["'{}()[\],;:=]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const pairs: [string, Grade][] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const grade = (tokens[i + 1] as string).toUpperCase();
    if (!isGrade(grade)) continue;
    pairs.push([tokens[i] as string, grade]);
    i++;
  }
  return pairs;
}
