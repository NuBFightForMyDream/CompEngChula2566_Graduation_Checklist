import { describe, expect, it } from "vitest";
import { fmtGpa, gpaOf, parseGradeTokens } from "./grades.ts";

describe("gpaOf", () => {
  it("weights by credits and ignores S / U / W", () => {
    const grades = { a: "A", b: "C", c: "S", d: "W" } as const;
    const credits = (id: string) => (id === "a" ? 3 : 1);
    expect(gpaOf(["a", "b", "c", "d"], grades, credits)).toEqual({ gpa: 3.5, credits: 4 });
  });

  it("returns null with no graded credits", () => {
    expect(gpaOf(["c"], { c: "S" }, () => 3).gpa).toBeNull();
  });
});

describe("fmtGpa", () => {
  it("truncates instead of rounding", () => {
    expect(fmtGpa(3.999)).toBe("3.99");
    expect(fmtGpa(2.5)).toBe("2.50");
    expect(fmtGpa(3.29)).toBe("3.29");
  });
});

describe("parseGradeTokens", () => {
  it("reads plain lines", () => {
    expect(parseGradeTokens("2110101 A\n2301107 c+")).toEqual([
      ["2110101", "A"],
      ["2301107", "C+"],
    ]);
  });

  it("reads the C++ initializer format", () => {
    expect(parseGradeTokens('{"2110101","A"}, {"2100301","S"}')).toEqual([
      ["2110101", "A"],
      ["2100301", "S"],
    ]);
  });

  it("skips text that is not a grade", () => {
    expect(parseGradeTokens("hello world 2110101 B")).toEqual([["2110101", "B"]]);
  });
});
