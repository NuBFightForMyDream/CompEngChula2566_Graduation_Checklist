import { describe, expect, it } from "vitest";
import data from "../../../data/comp-eng-2566.json";
import {
  addExtra,
  importGrades,
  moveCourse,
  removeExtra,
  resetPlacement,
  sampleYear1,
  setChoice,
  setExtraCategory,
  setGrade,
  shiftCourses,
  togglePassed,
} from "./actions.ts";
import { GRADES } from "./grades.ts";
import { SEMS } from "./graph.ts";
import { createModel, emptyPlan, normalizePlan } from "./model.ts";
import type { Curriculum, PlanState } from "./types.ts";
import { validatePlan } from "./validate.ts";

const cur = data as unknown as Curriculum;
const base = () => emptyPlan(cur);
const codes = (state: PlanState) => validatePlan(cur, state).map((p) => p.code);

describe("validatePlan accepts", () => {
  it("a new plan", () => {
    expect(codes(base())).toEqual([]);
  });

  it("a wrong term order, which the user may fix later", () => {
    const moved = moveCourse(createModel(cur, base()), "2110211", "3/1", { autoShift: false }).state;
    expect(createModel(cur, moved).conflicts.length).toBeGreaterThan(0);
    expect(codes(moved)).toEqual([]);
  });
});

describe("validatePlan rejects", () => {
  it("a course passed without its prereq", () => {
    expect(codes({ ...base(), passed: ["2110211"] })).toEqual(["PREREQ_NOT_PASSED"]);
  });

  it("a passed course that does not exist", () => {
    expect(codes({ ...base(), passed: ["ghost"] })).toEqual(["UNKNOWN_COURSE"]);
  });

  it("a term the course is not offered in", () => {
    const s = base();
    expect(codes({ ...s, place: { ...s.place, "2110211": "2/2" } })).toEqual(["NOT_OFFERED"]);
  });

  it("a term outside the plan", () => {
    const s = base();
    expect(codes({ ...s, place: { ...s.place, "2110101": "9/9" } })).toEqual(["INVALID_SEMESTER"]);
  });

  it("a missing placement and a placement for an unknown course", () => {
    const { "2110101": _gone, ...place } = base().place;
    expect(codes({ ...base(), place })).toEqual(["MISSING_PLACEMENT"]);
    expect(codes({ ...base(), place: { ...base().place, ghost: "1/1" } })).toEqual(["UNKNOWN_COURSE"]);
  });

  it("a passing grade on a course that is not passed, and the reverse", () => {
    expect(codes({ ...base(), grades: { "2110101": "A" } })).toEqual(["GRADE_MISMATCH"]);
    expect(codes({ ...base(), passed: ["2110101"], grades: { "2110101": "F" } })).toEqual(["GRADE_MISMATCH"]);
  });

  it("a grade that does not exist", () => {
    expect(codes({ ...base(), grades: { "2110101": "Z" as never } })).toEqual(["INVALID_GRADE"]);
  });

  it("an option outside the slot's pool, or a choice on a course that is not a slot", () => {
    const choice = { id: "ghost", code: "x", name: "x", credits: 3 };
    expect(codes({ ...base(), choices: { "ELEC-1": choice } })).toEqual(["INVALID_CHOICE"]);
    expect(codes({ ...base(), choices: { "2110101": { ...choice, id: null } } })).toEqual(["INVALID_CHOICE"]);
  });

  it("one option in two slots, even across pools", () => {
    const choice = { id: "2110431", code: "2110431", name: "x", credits: 3 };
    expect(codes({ ...base(), choices: { "ELEC-1": choice, "APPR-2": choice } })).toEqual(["OPTION_REUSED"]);
  });

  it("the option's own prereq and term", () => {
    const choice = { id: "2110452", code: "2110452", name: "x", credits: 3 };
    const s = base();
    // ตัวเลือกนี้เปิดเฉพาะเทอมปลาย แต่ APPR-2 อยู่ 4/1
    expect(codes({ ...s, choices: { "APPR-2": choice } })).toEqual(["NOT_OFFERED"]);
    const placed = { ...s, place: { ...s.place, "APPR-2": "4/2" }, choices: { "APPR-2": choice } };
    expect(codes({ ...placed, passed: ["APPR-2"] })).toEqual(["PREREQ_NOT_PASSED"]);
  });

  it("an extra that collides with a course, repeats, or uses a closed category", () => {
    const s = base();
    const extra = { id: "X", code: "X", name: "X", credits: 3, category: "free", semester: "1/1" };
    const place = { ...s.place, X: "1/1" };
    expect(codes({ ...s, place, extras: [{ ...extra, id: "2110101" }] })).toEqual(["INVALID_EXTRA"]);
    expect(codes({ ...s, place, extras: [extra, extra] })).toEqual(["INVALID_EXTRA"]);
    expect(codes({ ...s, place, extras: [{ ...extra, category: "core" }] })).toEqual(["INVALID_EXTRA"]);
    expect(codes({ ...s, place: { ...place, X: "2/1" }, extras: [extra] })).toEqual(["INVALID_EXTRA"]);
  });
});

describe("every state the app can produce is accepted", () => {
  // ถ้าข้อนี้พัง ผู้ใช้จะบันทึกแผนไม่ได้ทั้งที่กดตามปกติ
  it("survives thousands of random actions", () => {
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const pick = <T>(list: readonly T[]) => list[rnd(list.length)] as T;
    const pools = cur.pools ?? {};

    for (let run = 0; run < 40; run++) {
      let s = base();
      let nextExtra = 0;
      for (let step = 0; step < 120; step++) {
        const m = createModel(cur, s);
        const id = pick(m.courses).id;
        const autoShift = rnd(2) === 0;
        const action = rnd(11);
        if (action === 0) s = togglePassed(m, id).state;
        else if (action === 1) s = setGrade(m, id, pick(GRADES)).state;
        else if (action === 2) s = setGrade(m, id, null).state;
        else if (action === 3) s = moveCourse(m, id, pick(SEMS), { autoShift }).state;
        else if (action === 4) s = shiftCourses(m, null).state;
        else if (action === 5) {
          const slot = pick(cur.courses.filter((c) => c.pool));
          const o = pick(pools[slot.pool as string]?.options ?? []);
          s = setChoice(m, slot.id, { id: o.id, code: o.code, name: o.name, credits: o.credits }, { autoShift }).state;
        } else if (action === 6) {
          s = setChoice(m, pick(cur.courses.filter((c) => c.pool)).id, null, { autoShift }).state;
        } else if (action === 7) {
          const semester = pick(SEMS);
          s = addExtra(m, {
            id: `X${nextExtra++}`,
            code: "X",
            name: "X",
            credits: 3,
            category: pick(["free", "21st", "extra"]),
            semester,
          }).state;
        } else if (action === 8 && m.state.extras.length) {
          const extra = pick(m.state.extras);
          s = rnd(2) ? removeExtra(m, extra.id).state : setExtraCategory(m, extra.id, "gened").state;
        } else if (action === 9) s = importGrades(m, `${id} ${pick(GRADES)}`).state;
        else if (action === 10) s = rnd(8) === 0 ? resetPlacement(m) : rnd(8) === 0 ? sampleYear1(m) : s;
        expect(validatePlan(cur, s), `run ${run} step ${step} action ${action}`).toEqual([]);
        // ค่าที่อ่านกลับจากฐานข้อมูลผ่าน normalize ต้องไม่เปลี่ยนแผนที่ถูกต้องอยู่แล้ว
        expect(validatePlan(cur, normalizePlan(cur, s))).toEqual([]);
      }
    }
  });
});
