// แผนของผู้ใช้ที่ยังไม่ได้เข้าสู่ระบบ เก็บใน localStorage ของเบราว์เซอร์นี้

import { defaultSettings, type PlanSettings, planSettingsSchema, planStateSchema } from "@cp/contracts";
import type { PlanState } from "@cp/core";

export interface StoredPlan {
  plan: Partial<PlanState> | null;
  settings: PlanSettings;
}

export interface PlanRepository {
  load(curriculumId: string): Promise<StoredPlan>;
  save(curriculumId: string, plan: PlanState, settings: PlanSettings): Promise<void>;
  clear(curriculumId: string): Promise<void>;
}

const read = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
};

/** ข้อมูลรูปแบบเดิมของเว็บเวอร์ชันก่อน แยกเก็บทีละ key */
function readLegacy(id: string): StoredPlan | null {
  const passed = read(`passed:${id}`);
  const grades = read(`grade:${id}`);
  const place = read(`place:${id}`);
  if (passed === null && grades === null && place === null) return null;
  const autoShift = read("autoShift");
  return {
    plan: {
      passed: (passed ?? []) as string[],
      place: (place ?? {}) as PlanState["place"],
      choices: (read(`choice:${id}`) ?? {}) as PlanState["choices"],
      extras: (read(`extra:${id}`) ?? []) as PlanState["extras"],
      grades: (grades ?? {}) as PlanState["grades"],
    },
    settings: {
      ...defaultSettings,
      autoShift: typeof autoShift === "boolean" ? autoShift : defaultSettings.autoShift,
      colors: (read(`colors:${id}`) ?? {}) as PlanSettings["colors"],
    },
  };
}

export const localPlanRepository: PlanRepository = {
  async load(id) {
    const stored = read(`cp:plan:v1:${id}`) as { plan?: unknown; settings?: unknown } | null;
    if (stored) {
      const plan = planStateSchema.safeParse(stored.plan);
      const settings = planSettingsSchema.safeParse(stored.settings);
      return {
        plan: plan.success ? (plan.data as PlanState) : null,
        settings: settings.success ? settings.data : defaultSettings,
      };
    }
    return readLegacy(id) ?? { plan: null, settings: defaultSettings };
  },
  async save(id, plan, settings) {
    try {
      localStorage.setItem(`cp:plan:v1:${id}`, JSON.stringify({ plan, settings }));
    } catch {
      // พื้นที่เต็มหรือถูกบล็อก ยังใช้งานต่อได้ แต่ข้อมูลจะไม่ถูกบันทึก
    }
  },
  /** เรียกหลังย้ายแผนเข้าบัญชีแล้ว คอมพิวเตอร์ที่ใช้ร่วมกันจะได้ไม่มีข้อมูลค้าง */
  async clear(id) {
    try {
      localStorage.removeItem(`cp:plan:v1:${id}`);
      for (const prefix of ["passed", "place", "choice", "extra", "grade", "colors"]) {
        localStorage.removeItem(`${prefix}:${id}`);
      }
    } catch {
      // อ่านไม่ได้ก็ไม่มีอะไรให้ลบ
    }
  },
};
