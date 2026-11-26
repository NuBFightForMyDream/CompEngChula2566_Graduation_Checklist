// แปลงผลลัพธ์จาก core เป็นข้อความภาษาไทย

import type { Outcome, PlanModel, Sem } from "@cp/core";

export const semName = (s: Sem) => `ปี ${s.charAt(0)} เทอม ${s.charAt(2)}`;

const termWord: Record<string, string> = { "1": "เทอมต้น", "2": "เทอมปลาย" };
export const offeredText = (offered?: string[]) =>
  !offered || offered.length > 1 ? "เปิดทุกเทอม" : `เปิดเฉพาะ${termWord[offered[0] as string]}`;

const names = (m: PlanModel, ids: string[]) => ids.map(m.label).join(", ");

function shiftText(m: PlanModel, moved: [string, Sem, Sem][], stuck: string[]) {
  const parts: string[] = [];
  if (moved.length) parts.push(`เลื่อนตาม: ${moved.map(([v, , to]) => `${m.label(v)} → ${to}`).join(", ")}`);
  if (stuck.length) parts.push(`เลื่อนไม่ได้เพราะเกินปี 5: ${names(m, stuck)}`);
  return parts.join(" · ");
}

export interface ToastText {
  text: string;
  bad?: boolean;
}

/** m คือ model หลังเปลี่ยนแปลงแล้ว */
export function describeOutcome(m: PlanModel, o: Outcome): ToastText | null {
  switch (o.type) {
    case "moved": {
      const extra = shiftText(m, o.moved, o.stuck);
      return {
        text: `ย้าย ${m.label(o.id)} ไป${semName(o.sem)} แล้ว${extra ? ` · ${extra}` : ""}`,
        bad: o.stuck.length > 0,
      };
    }
    case "notOffered":
      return {
        text: `ย้าย ${m.label(o.id)} ไป${semName(o.sem)} ไม่ได้ วิชานี้${offeredText(m.course(o.id).offered)} (เลื่อนข้ามปีได้ แต่ข้ามเทอมไม่ได้)`,
        bad: true,
      };
    case "prereqMissing":
      return {
        text: `${o.grade ? `ใส่เกรด ${o.grade} ให้` : "ติ๊กผ่าน"} ${m.label(o.id)} ไม่ได้ ต้องผ่าน ${names(m, o.missing)} ก่อน`,
        bad: true,
      };
    case "passed":
      return null;
    case "unpassed":
      return o.cascade.length ? { text: `ยกเลิก ${m.label(o.id)} และวิชาที่ต่อจากนี้แล้ว: ${names(m, o.cascade)}` } : null;
    case "gradeSet": {
      const base = o.grade ? `ใส่เกรด ${o.grade} ให้ ${m.label(o.id)} แล้ว` : `ล้างเกรด ${m.label(o.id)} แล้ว`;
      return { text: o.cascade.length ? `${base} · ยกเลิกผ่านวิชาที่ต่อจากนี้: ${names(m, o.cascade)}` : base };
    }
    case "shifted": {
      const text = shiftText(m, o.moved, o.stuck);
      return { text: text || "ไม่มีวิชาที่ต้องเลื่อน", bad: o.stuck.length > 0 };
    }
    case "extraAdded":
      return { text: `เพิ่ม ${m.label(o.id)} ใน${semName(o.sem)} แล้ว` };
    case "extraRemoved":
      return { text: `ลบ ${o.label} แล้ว` };
    case "choiceSet": {
      const parts = [`บันทึกวิชาสำหรับช่องนี้แล้ว`];
      if (o.relocatedTo) parts.push(`ย้ายไป${semName(o.relocatedTo)} เพราะ${offeredText(m.course(o.id).offered)}`);
      if (o.unpassed) parts.push("ยกเลิกการผ่าน เพราะยังไม่ผ่านวิชาบังคับก่อนของวิชาที่เลือก");
      const extra = shiftText(m, o.moved, o.stuck);
      if (extra) parts.push(extra);
      return { text: parts.join(" · "), bad: o.stuck.length > 0 };
    }
    case "optionUsed":
      return { text: "วิชานี้ถูกเลือกในช่องอื่นแล้ว นับซ้ำไม่ได้", bad: true };
    case "noop":
      return null;
  }
}
