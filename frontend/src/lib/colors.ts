// สีของวิชาและหมวด: ค่าจาก JSON หลักสูตร โดยสีที่ผู้ใช้ปรับเองจะทับค่าเดิม

import type { PlanSettings } from "@cp/contracts";
import type { Course, Curriculum } from "@cp/core";

const EXTRA_COLOR = "var(--extra)";
// สีดำของวิชาเลือกเสรีใช้ token เพื่อให้ยังเห็นได้ในโหมดมืด
const ink = (hex: string) => (/^#(000000|111111)$/i.test(hex) ? "var(--ink)" : hex);

export const rawCategoryColor = (cur: Curriculum, s: PlanSettings, key: string) =>
  s.colors[`cat:${key}`] ?? cur.categories[key]?.color ?? "#5f6b7a";

export const rawGroupColor = (cur: Curriculum, s: PlanSettings, key: string) =>
  s.colors[`group:${key}`] ?? cur.groups?.[key]?.color ?? "#5f6b7a";

export function courseColor(cur: Curriculum, s: PlanSettings, c: Course) {
  if (c.group && cur.groups?.[c.group]) return ink(rawGroupColor(cur, s, c.group));
  if (!cur.categories[c.category]) return EXTRA_COLOR;
  return ink(rawCategoryColor(cur, s, c.category));
}

const luminance = (r: number, g: number, b: number) => {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** พื้นการ์ดที่ผ่านแล้ว ตัวอักษรเป็นสีขาวเสมอ สีอ่อนจะถูกผสมดำจนตัวขาวอ่านได้ (contrast อย่างน้อย 4.5:1) */
export function passedFill(color: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  // สีที่เป็นตัวแปร CSS เปลี่ยนตามโหมดมืด คำนวณล่วงหน้าไม่ได้ จึงเข้มลงเท่ากันทุกครั้ง
  if (!m) return `color-mix(in srgb, ${color} 75%, #000)`;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => Number.parseInt(h as string, 16) / 255) as [number, number, number];
  let keep = 100;
  while (keep > 0 && 1.05 / (luminance((r * keep) / 100, (g * keep) / 100, (b * keep) / 100) + 0.05) < 4.5) keep -= 2;
  return keep === 100 ? color : `color-mix(in srgb, ${color} ${keep}%, #000)`;
}

/** แถบสีของหมวด ถ้าหมวดมีหลายกลุ่มย่อยจะแสดงสีทุกกลุ่ม */
export function categorySwatch(cur: Curriculum, s: PlanSettings, key: string) {
  const colors = [
    ...new Set(
      cur.courses.filter((c) => c.category === key && c.group).map((c) => rawGroupColor(cur, s, c.group as string)),
    ),
  ];
  if (colors.length < 2) return ink(rawCategoryColor(cur, s, key));
  const stops = colors.map((col, i) => `${col} ${(100 * i) / colors.length}% ${(100 * (i + 1)) / colors.length}%`);
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

export const coreGroups = (cur: Curriculum) =>
  Object.entries(cur.groups ?? {}).filter(([k]) => cur.courses.some((c) => c.group === k && c.category === "core"));
