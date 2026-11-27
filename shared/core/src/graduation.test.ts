import { describe, expect, it } from "vitest";
import data from "../../../data/comp-eng-2566.json";
import { moveCourse, setChoice, togglePassed } from "./actions.ts";
import { semIdx } from "./graph.ts";
import { createModel, emptyPlan, inGenEdRow, isGenEdPick, normalizePlan } from "./model.ts";
import { finishSem, graduationStatus, remainingPlan } from "./summary.ts";
import type { Curriculum, Grade, PlanState } from "./types.ts";

const cur = data as unknown as Curriculum;
const ids = cur.courses.map((c) => c.id);

/** ผ่านทุกวิชาในหลักสูตร ทุกวิชาได้เกรด grade ยกเว้นที่ระบุใน override */
function finished(grade: Grade, override: Record<string, Grade> = {}, place: Record<string, string> = {}): PlanState {
  const base = emptyPlan(cur);
  const grades = Object.fromEntries(ids.map((id) => [id, override[id] ?? grade]));
  return normalizePlan(cur, { ...base, passed: ids, grades, place: { ...base.place, ...place } });
}
const status = (s: PlanState) => graduationStatus(createModel(cur, s));

describe("graduationStatus", () => {
  it("cannot graduate with an empty plan", () => {
    expect(status(emptyPlan(cur))).toMatchObject({ canGraduate: false, honors: null });
  });

  it("all A in four years is first-class honours", () => {
    expect(status(finished("A"))).toMatchObject({ canGraduate: true, honors: 1, gpa: 4 });
  });

  it("all B+ (3.50) is second-class honours", () => {
    expect(status(finished("B+"))).toMatchObject({ canGraduate: true, honors: 2 });
  });

  it("all B (3.00) graduates without honours", () => {
    expect(status(finished("B"))).toMatchObject({ canGraduate: true, honors: null, gpa: 3 });
  });

  it("a course passed in year 5 loses honours", () => {
    const late = cur.courses.find((c) => !c.offered || c.offered.includes("1"));
    if (!late) throw new Error("no course");
    const s = status(finished("A", {}, { [late.id]: "5/1" }));
    expect(s).toMatchObject({ canGraduate: true, onTime: false, honors: null });
  });

  it("an F anywhere in the plan loses honours", () => {
    const base = finished("A");
    const s = status({ ...base, grades: { ...base.grades, "2110101": "F" } });
    expect(s.noFail).toBe(false);
    expect(s.honors).toBeNull();
  });

  it("a U loses honours", () => {
    const sCourse = ids.find((id) => id.startsWith("2100")) ?? (ids[0] as string);
    const base = finished("A");
    const s = status({ ...base, grades: { ...base.grades, [sCourse]: "U" } });
    expect(s.honors).toBeNull();
  });
});

describe("GenEd picks", () => {
  it("are the self-chosen GenEd slots, not the fixed GenEd courses", () => {
    const picks = createModel(cur, emptyPlan(cur))
      .courses.filter(isGenEdPick)
      .map((c) => c.id);
    expect(picks).toEqual(["GENED-1", "GENED-2", "GENED-3", "GENED-4"]);
  });

  it("accept a typed-in course and keep it after a reload", () => {
    const m = createModel(cur, emptyPlan(cur));
    const { state } = setChoice(
      m,
      "GENED-1",
      { id: null, code: "0201101", name: "MAN AND SOCIETY", credits: 3 },
      {
        autoShift: true,
      },
    );
    const again = createModel(cur, normalizePlan(cur, JSON.parse(JSON.stringify(state))));
    expect(again.label("GENED-1")).toBe("0201101 MAN AND SOCIETY");
  });
});

describe("summer terms", () => {
  it("sit between the second term and the next year", () => {
    expect(semIdx("1/2")).toBeLessThan(semIdx("1/3"));
    expect(semIdx("1/3")).toBeLessThan(semIdx("2/1"));
  });

  it("take a GenEd pick and keep it after a reload", () => {
    const { outcome, state } = moveCourse(createModel(cur, emptyPlan(cur)), "GENED-1", "1/3", { autoShift: true });
    expect(outcome.type).not.toBe("notOffered");
    const again = normalizePlan(cur, JSON.parse(JSON.stringify(state)));
    expect(again.place["GENED-1"]).toBe("1/3");
    expect(inGenEdRow(createModel(cur, again).course("GENED-1"), again.place)).toBe(true);
  });

  it("year-4 summer still counts as finishing in four years", () => {
    const base = finished("A");
    const s = status({ ...base, place: { ...base.place, "GENED-4": "4/3" } });
    expect(s).toMatchObject({ onTime: true, honors: 1 });
  });

  it("show up as the expected finishing term and do not break the planner", () => {
    let s = moveCourse(createModel(cur, emptyPlan(cur)), "GENED-4", "5/3", { autoShift: true }).state;
    expect(finishSem(createModel(cur, s))).toBe("5/3");
    s = togglePassed(createModel(cur, s), "GENED-4").state;
    const plan = remainingPlan(createModel(cur, s));
    expect(plan.every((t) => /^[1-9]\/[12]$/.test(t.sem))).toBe(true);
  });
});
