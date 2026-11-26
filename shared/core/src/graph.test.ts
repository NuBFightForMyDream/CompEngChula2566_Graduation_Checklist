import { describe, expect, it } from "vitest";
import {
  affected,
  buildGraph,
  chainDepth,
  findConflicts,
  offeredIn,
  prereqChain,
  shiftDependents,
  topoSort,
} from "./graph.ts";
import { planRemaining } from "./planner.ts";
import type { Course } from "./types.ts";

const course = (id: string, prereq: string[] = [], extra: Partial<Course> = {}): Course => ({
  id,
  name: id,
  credits: 3,
  category: "core",
  semester: "1/1",
  prereq,
  ...extra,
});

// a -> b -> d, a -> c, x แยกเดี่ยว
const list = [course("a"), course("b", ["a"]), course("c", ["a"]), course("d", ["b"]), course("x")];
const g = buildGraph(list);
const order = topoSort(g);

describe("graph", () => {
  it("throws when a prereq is missing", () => {
    expect(() => buildGraph([course("a", ["ghost"])])).toThrow("ghost");
  });

  it("topological order puts every prereq first", () => {
    expect(order).toHaveLength(list.length);
    for (const c of list) for (const p of c.prereq) expect(order.indexOf(p)).toBeLessThan(order.indexOf(c.id));
  });

  it("detects a cycle through a short order", () => {
    const cyc = buildGraph([course("a", ["b"]), course("b", ["a"])]);
    expect(topoSort(cyc)).toHaveLength(0);
  });

  it("walks the chain in both directions", () => {
    expect(prereqChain(g.prereqs, "d")).toEqual(new Set(["a", "b"]));
    expect(affected(g.unlocks, "a")).toEqual(new Set(["b", "c", "d"]));
    expect(affected(g.unlocks, "x")).toEqual(new Set());
  });

  it("computes the longest remaining chain", () => {
    const depth = chainDepth(order, g.unlocks, new Set(["a", "b", "c", "d"]));
    expect(depth.get("a")).toBe(3);
    expect(depth.get("c")).toBe(1);
  });

  it("flags a prereq in the same or a later term", () => {
    const place = { a: "2/1", b: "2/1", c: "3/1", d: "3/1", x: "1/1" };
    expect(findConflicts(g.prereqs, place)).toEqual([["a", "b"]]);
  });
});

describe("shiftDependents", () => {
  const place = { a: "3/1", b: "1/2", c: "4/1", d: "2/1", x: "1/1" };

  it("pushes dependents after the latest prereq", () => {
    const res = shiftDependents(order, g.prereqs, place, null, g.courses);
    expect(res.place).toMatchObject({ b: "3/2", c: "4/1", d: "4/1" });
    expect(res.moved).toContainEqual(["b", "1/2", "3/2"]);
    expect(res.stuck).toEqual([]);
  });

  it("skips terms when the course is not offered", () => {
    const g2 = buildGraph([course("a"), course("b", ["a"], { offered: ["2"] })]);
    const res = shiftDependents(topoSort(g2), g2.prereqs, { a: "2/2", b: "1/2" }, null, g2.courses);
    expect(res.place.b).toBe("3/2");
  });

  it("reports courses that cannot fit before the end of year 5", () => {
    const g2 = buildGraph([course("a"), course("b", ["a"])]);
    const res = shiftDependents(topoSort(g2), g2.prereqs, { a: "5/2", b: "1/2" }, null, g2.courses);
    expect(res.stuck).toEqual(["b"]);
    expect(res.place.b).toBe("1/2");
  });

  it("respects the only filter", () => {
    const res = shiftDependents(order, g.prereqs, place, new Set(["d"]), g.courses);
    expect(res.place.b).toBe("1/2");
  });
});

describe("offeredIn", () => {
  it("treats a missing list as every term", () => {
    expect(offeredIn({}, "1/2")).toBe(true);
    expect(offeredIn({ offered: ["1"] }, "3/1")).toBe(true);
    expect(offeredIn({ offered: ["1"] }, "3/2")).toBe(false);
  });
});

describe("planRemaining", () => {
  const credits = () => 3;
  const start = { a: "1/1", b: "1/2", c: "1/2", d: "2/1", x: "1/1" };

  it("respects the credit limit and ordering", () => {
    const plan = planRemaining(g, order, new Set(), start, 6, credits);
    expect(plan.flatMap((t) => t.term)).toHaveLength(list.length);
    for (const t of plan) expect(t.credits).toBeLessThanOrEqual(6);
    const termOf = (id: string) => plan.findIndex((t) => t.term.includes(id));
    expect(termOf("a")).toBeLessThan(termOf("b"));
    expect(termOf("b")).toBeLessThan(termOf("d"));
  });

  it("starts after the last passed term", () => {
    const plan = planRemaining(g, order, new Set(["a"]), start, 22, credits);
    expect(plan[0]?.sem).toBe("1/2");
  });

  it("stops rather than looping when a course exceeds the limit", () => {
    expect(planRemaining(g, order, new Set(), start, 2, credits)).toEqual([]);
  });

  it("leaves a term empty when only an off-term course remains", () => {
    const g2 = buildGraph([course("a", [], { offered: ["2"] })]);
    const plan = planRemaining(g2, ["a"], new Set(), { a: "1/2" }, 22, credits);
    expect(plan.map((t) => t.term.length)).toEqual([0, 1]);
  });
});
