import { buildGraph, topoSort } from "@cp/core";
import data from "@cp/curricula/data/comp-eng-2566.json";
import { describe, expect, it } from "vitest";
import { curriculumSchema } from "./index.ts";

describe("comp-eng-2566.json", () => {
  const cur = curriculumSchema.parse(data);

  it("has category requirements that add up to the total", () => {
    const sum = Object.values(cur.categories).reduce((s, c) => s + c.required, 0);
    expect(sum).toBe(cur.totalCredits);
  });

  it("has courses that add up to each category requirement", () => {
    for (const [key, c] of Object.entries(cur.categories)) {
      const got = cur.courses.filter((x) => x.category === key).reduce((s, x) => s + x.credits, 0);
      expect(got, key).toBe(c.required);
    }
  });

  it("has no prerequisite cycle", () => {
    expect(topoSort(buildGraph(cur.courses))).toHaveLength(cur.courses.length);
  });

  it("gives every elective slot options to choose from", () => {
    for (const c of cur.courses.filter((x) => x.pool)) {
      expect(cur.pools?.[c.pool as string]?.options.length, c.id).toBeGreaterThan(0);
    }
  });
});

describe("curriculumSchema", () => {
  it("rejects a reference to a missing course", () => {
    const broken = JSON.parse(JSON.stringify(data)) as { courses: { prereq: string[] }[] };
    (broken.courses[0] as { prereq: string[] }).prereq = ["ghost"];
    expect(curriculumSchema.safeParse(broken).success).toBe(false);
  });
});
