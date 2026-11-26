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

/** สีตัวอักษรบนพื้นการ์ดที่ผ่านแล้ว เลือกขาวหรือดำตามความสว่างของพื้น */
export function textOn(color: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return "#ffffff";
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => {
    const v = Number.parseInt(h as string, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05) >= 4.5 ? "#ffffff" : "#111111";
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
