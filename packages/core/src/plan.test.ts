import data from "@cp/curricula/data/comp-eng-2566.json";
import { describe, expect, it } from "vitest";
import {
  addExtra,
  importGrades,
  moveCourse,
  removeExtra,
  resetPlacement,
  sampleYear1,
  setChoice,
  setGrade,
  togglePassed,
} from "./actions.ts";
import { prereqChain } from "./graph.ts";
import { createModel, emptyPlan, extraCategories, hasProgress, normalizePlan, samePlan } from "./model.ts";
import { availableCourses, creditSummary, gpax, remainingPlan } from "./summary.ts";
import type { Choice, Curriculum, PlanState } from "./types.ts";

const cur = data as unknown as Curriculum;
const fresh = () => createModel(cur, emptyPlan(cur));
const model = (state: PlanState) => createModel(cur, state);
const auto = { autoShift: true };

const optionChoice = (pool: string, id: string): Choice => {
  const o = cur.pools?.[pool]?.options.find((x) => x.id === id);
  if (!o) throw new Error(id);
  return { id: o.id, code: o.code, name: o.name, credits: o.credits };
};

/** ผ่านสายบังคับทั้งหมดของวิชานี้ตามลำดับ */
function passChain(state: PlanState, ids: string[]) {
  let s = state;
  for (const id of ids) s = togglePassed(model(s), id).state;
  return s;
}

describe("the curriculum file", () => {
  it("starts empty for a new user", () => {
    const m = fresh();
    expect(m.passed.size).toBe(0);
    expect(creditSummary(m).remaining).toBe(cur.totalCredits);
    expect(m.conflicts).toEqual([]);
  });

  it("plans every course within the credit limit", () => {
    const plan = remainingPlan(fresh());
    expect(plan.flatMap((t) => t.term)).toHaveLength(cur.courses.length);
    for (const t of plan) expect(t.credits).toBeLessThanOrEqual(cur.maxCreditsPerSemester);
  });
});

describe("extra course categories follow the JSON", () => {
  it("includes 21st and approved and drops keys that do not exist", () => {
    expect(extraCategories(cur)).toEqual(["gened", "21st", "approved", "elective", "free", "extra"]);
  });
});

describe("togglePassed", () => {
  it("blocks a course whose prereq is not passed", () => {
    const { outcome, state } = togglePassed(fresh(), "2110211");
    expect(outcome).toMatchObject({ type: "prereqMissing", id: "2110211" });
    expect(state.passed).toEqual([]);
  });

  it("cascades when a prereq is cancelled and removes passing grades", () => {
    let s = togglePassed(fresh(), "2110101").state;
    s = setGrade(model(s), "2110211", "A").state;
    expect(s.passed).toContain("2110211");
    const res = togglePassed(model(s), "2110101");
    expect(res.outcome).toMatchObject({ type: "unpassed", cascade: ["2110211"] });
    expect(res.state.passed).toEqual([]);
    expect(res.state.grades).toEqual({});
  });
});

describe("setGrade", () => {
  it("marks passing grades as passed", () => {
    const { state } = setGrade(fresh(), "2110101", "B+");
    expect(state.passed).toEqual(["2110101"]);
    expect(gpax(model(state)).gpa).toBe(3.5);
  });

  it("refuses a passing grade before the prereq", () => {
    expect(setGrade(fresh(), "2110211", "A").outcome.type).toBe("prereqMissing");
  });

  it("allows a failing grade on a locked course", () => {
    const { state } = setGrade(fresh(), "2110211", "F");
    expect(state.grades["2110211"]).toBe("F");
    expect(state.passed).toEqual([]);
  });

  it("a failing grade unpasses dependents but keeps its own grade", () => {
    let s = togglePassed(fresh(), "2110101").state;
    s = togglePassed(model(s), "2110211").state;
    const res = setGrade(model(s), "2110101", "F");
    expect(res.outcome).toMatchObject({ type: "gradeSet", cascade: ["2110211"] });
    expect(res.state.grades).toEqual({ "2110101": "F" });
    expect(res.state.passed).toEqual([]);
  });

  it("ticking after a failing grade clears it", () => {
    const s = setGrade(fresh(), "2110101", "F").state;
    expect(togglePassed(model(s), "2110101").state.grades).toEqual({});
  });
});

describe("importGrades", () => {
  it("applies in dependency order regardless of input order", () => {
    const r = importGrades(fresh(), "2110211 A\n2110101 B");
    expect(r.done).toBe(2);
    expect(r.failed).toEqual([]);
  });

  it("reports unknown codes and courses blocked by a prereq", () => {
    const r = importGrades(fresh(), "9999999 A\n2110211 A");
    expect(r.unknown).toEqual(["9999999"]);
    expect(r.failed).toEqual(["2110211"]);
  });
});

describe("moveCourse", () => {
  it("rejects a term the course is not offered in", () => {
    const res = moveCourse(fresh(), "2110211", "2/2", auto);
    expect(res.outcome.type).toBe("notOffered");
  });

  it("shifts dependents when autoShift is on", () => {
    const res = moveCourse(fresh(), "2110211", "3/1", auto);
    expect(res.state.place["2110211"]).toBe("3/1");
    expect(res.outcome).toMatchObject({ type: "moved" });
    expect(model(res.state).conflicts).toEqual([]);
  });

  it("leaves a conflict for the user when autoShift is off", () => {
    const res = moveCourse(fresh(), "2110211", "3/1", { autoShift: false });
    expect(model(res.state).conflicts.length).toBeGreaterThan(0);
  });
});

describe("elective slots use the chosen option's rules", () => {
  it("takes prereq and offered from the option", () => {
    const res = setChoice(fresh(), "APPR-2", optionChoice("approved", "2110413"), auto);
    const m = model(res.state);
    expect(m.graph.prereqs.get("APPR-2")).toEqual(["2110313", "2110471"]);
    expect(m.course("APPR-2").offered).toEqual(["1"]);
    expect(m.statusOf("APPR-2")).toBe("locked");
    expect(m.codeOf("APPR-2")).toBe("2110413");
  });

  it("relocates the slot when the option is not offered in its term", () => {
    // APPR-2 อยู่ 4/1 แต่ HIGH PERFORMANCE ARCH เปิดเฉพาะเทอมปลาย
    const res = setChoice(fresh(), "APPR-2", optionChoice("approved", "2110452"), auto);
    expect(res.state.place["APPR-2"]).toBe("4/2");
    expect(res.outcome).toMatchObject({ type: "choiceSet", relocatedTo: "4/2" });
    expect(model(res.state).isMoved("APPR-2")).toBe(false);
  });

  it("unpasses the slot when the new option's prereq is not met", () => {
    const passed = togglePassed(fresh(), "APPR-2").state;
    const res = setChoice(model(passed), "APPR-2", optionChoice("approved", "2110413"), auto);
    expect(res.state.passed).not.toContain("APPR-2");
    expect(res.outcome).toMatchObject({ type: "choiceSet", unpassed: true });
  });

  it("keeps the slot passed once the option's prereq is met", () => {
    const chain = createModel(cur, setChoice(fresh(), "APPR-2", optionChoice("approved", "2110413"), auto).state);
    const needed = chain.order.filter((id) => prereqChain(chain.graph.prereqs, "APPR-2").has(id));
    const s = passChain(chain.state, [...needed, "APPR-2"]);
    expect(s.passed).toContain("APPR-2");
    const res = setChoice(model(s), "APPR-2", optionChoice("approved", "2110415"), auto);
    expect(res.state.passed).toContain("APPR-2");
    expect(res.outcome).toMatchObject({ type: "choiceSet", unpassed: false });
  });

  it("refuses an option already used by another slot, even across pools", () => {
    // 2110431 อยู่ทั้งใน elective และ approved นับซ้ำไม่ได้
    const s = setChoice(fresh(), "ELEC-1", optionChoice("elective", "2110431"), auto).state;
    const res = setChoice(model(s), "APPR-1", optionChoice("approved", "2110431"), auto);
    expect(res.outcome.type).toBe("optionUsed");
    expect(res.state.choices["APPR-1"]).toBeUndefined();
  });

  it("restores the slot rules when the choice is cleared", () => {
    const s = setChoice(fresh(), "APPR-2", optionChoice("approved", "2110413"), auto).state;
    const m = model(setChoice(model(s), "APPR-2", null, auto).state);
    expect(m.graph.prereqs.get("APPR-2")).toEqual([]);
    expect(m.course("APPR-2").offered).toBeUndefined();
  });

  it("accepts a custom course and keeps the slot's rules", () => {
    const res = setChoice(fresh(), "FREE-1", { id: null, code: "9999", name: "MINE", credits: 2 }, auto);
    const m = model(res.state);
    expect(m.creditsOf("FREE-1")).toBe(2);
    expect(m.graph.prereqs.get("FREE-1")).toEqual([]);
  });
});

describe("creditSummary", () => {
  it("does not let surplus credits hide a missing category", () => {
    let s = emptyPlan(cur);
    // เรียนเพิ่มในหมวด free จนยอดรวมเกิน 138 แต่หมวดอื่นยังว่าง
    for (let i = 0; i < 50; i++) {
      s = addExtra(model(s), {
        id: `X${i}`,
        code: `X${i}`,
        name: "X",
        credits: 3,
        category: "free",
        semester: "1/1",
      }).state;
      s = togglePassed(model(s), `X${i}`).state;
    }
    const sum = creditSummary(model(s));
    expect(sum.earned).toBe(150);
    expect(sum.counted).toBe(6);
    expect(sum.remaining).toBe(132);
    expect(sum.complete).toBe(false);
  });

  it("does not count extras outside the curriculum", () => {
    const s = addExtra(fresh(), {
      id: "X",
      code: "X",
      name: "X",
      credits: 3,
      category: "extra",
      semester: "1/1",
    }).state;
    const t = togglePassed(model(s), "X").state;
    const sum = creditSummary(model(t));
    expect(sum.earned).toBe(0);
    expect(sum.extrasOutside).toBe(3);
  });
});

describe("extras", () => {
  it("removing clears passed, grade and placement", () => {
    let s = addExtra(fresh(), { id: "X", code: "X", name: "X", credits: 3, category: "free", semester: "2/1" }).state;
    s = setGrade(model(s), "X", "A").state;
    const after = removeExtra(model(s), "X").state;
    expect(after.extras).toEqual([]);
    expect(after.passed).toEqual([]);
    expect(after.grades).toEqual({});
    expect(after.place.X).toBeUndefined();
  });

  it("moving updates the stored semester", () => {
    const s = addExtra(fresh(), { id: "X", code: "X", name: "X", credits: 3, category: "free", semester: "2/1" }).state;
    expect(moveCourse(model(s), "X", "3/1", auto).state.extras[0]?.semester).toBe("3/1");
  });
});

describe("normalizePlan", () => {
  it("removes data that no longer matches the curriculum", () => {
    const s = normalizePlan(cur, {
      passed: ["2110211", "ghost"],
      place: { "2110101": "9/9", "2110211": "2/2" },
      grades: { ghost: "A", "2110101": "Z" as never },
      choices: {
        "2110101": { id: "x", code: "x", name: "x", credits: 3 },
        "ELEC-1": { id: "ghost", code: "g", name: "g", credits: 3 },
      },
      extras: [
        { id: "E", code: "E", name: "E", credits: 3, category: "nope", semester: "1/1" },
        { id: "F", code: "F", name: "F", credits: 3, category: "free", semester: "bad" },
      ],
    });
    expect(s.passed).toEqual([]);
    expect(s.grades).toEqual({});
    expect(s.choices).toEqual({});
    expect(s.place["2110101"]).toBe("1/1");
    expect(s.place["2110211"]).toBe("2/1");
    expect(s.extras.map((e) => [e.id, e.category])).toEqual([["E", "extra"]]);
  });

  it("drops a passing grade from a course that is not passed", () => {
    expect(normalizePlan(cur, { grades: { "2110101": "A" } }).grades).toEqual({});
  });

  it("refreshes option details from the current curriculum", () => {
    const s = normalizePlan(cur, { choices: { "ELEC-1": { id: "2110431", code: "old", name: "old", credits: 9 } } });
    expect(s.choices["ELEC-1"]?.credits).toBe(3);
    expect(s.choices["ELEC-1"]?.code).toBe("2110431");
  });

  it("is stable when run twice", () => {
    const once = sampleYear1(fresh());
    expect(normalizePlan(cur, once)).toEqual(once);
  });
});

describe("helpers", () => {
  it("sampleYear1 passes first-year courses only", () => {
    const m = model(sampleYear1(fresh()));
    expect(m.passed.size).toBeGreaterThan(0);
    for (const id of m.passed) expect(m.state.place[id]?.startsWith("1/")).toBe(true);
    expect(availableCourses(m).length).toBeGreaterThan(0);
  });

  it("resetPlacement returns moved courses to the plan", () => {
    const moved = moveCourse(fresh(), "2110211", "3/1", auto).state;
    const m = model(resetPlacement(model(moved)));
    expect(m.isMoved("2110211")).toBe(false);
    expect(m.conflicts).toEqual([]);
  });
});

describe("hasProgress and samePlan", () => {
  it("a new plan has no progress", () => {
    expect(hasProgress(cur, emptyPlan(cur))).toBe(false);
  });

  it("any real change counts as progress", () => {
    const m = fresh();
    expect(hasProgress(cur, togglePassed(m, "2110101").state)).toBe(true);
    expect(hasProgress(cur, setGrade(m, "2110211", "F").state)).toBe(true);
    expect(hasProgress(cur, moveCourse(m, "2110211", "3/1", auto).state)).toBe(true);
    expect(hasProgress(cur, setChoice(m, "ELEC-1", optionChoice("elective", "2110431"), auto).state)).toBe(true);
  });

  it("samePlan ignores key order but notices real differences", () => {
    const a = togglePassed(fresh(), "2110101").state;
    const reordered = { ...a, place: Object.fromEntries(Object.entries(a.place).reverse()) };
    expect(samePlan(a, reordered)).toBe(true);
    expect(samePlan(a, emptyPlan(cur))).toBe(false);
  });
});
