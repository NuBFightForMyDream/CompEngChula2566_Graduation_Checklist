// จัดแผนเทอมที่เหลือแบบ greedy: แต่ละรอบคือเทอมจริง จึงหยิบเฉพาะวิชาที่เปิดเทอมนั้น

import { chainDepth, type Graph, offeredIn, semAt, semIdx } from "./graph.ts";
import type { Sem } from "./types.ts";

export interface PlannedTerm {
  sem: Sem;
  term: string[];
  credits: number;
}

export function planRemaining(
  g: Graph,
  order: string[],
  passed: Set<string>,
  place: Record<string, Sem>,
  maxCredits: number,
  creditsOf: (id: string) => number,
): PlannedTerm[] {
  const done = new Set(passed);
  const remaining = new Set([...g.courses.keys()].filter((c) => !done.has(c)));
  const depth = chainDepth(order, g.unlocks, remaining);
  const semOf = (id: string) => semIdx(place[id] as Sem);
  const plan: PlannedTerm[] = [];
  let now = passed.size ? Math.floor(Math.max(...[...passed].map(semOf))) + 1 : 0;

  while (remaining.size) {
    const sem = semAt(now++);
    const unlocked = [...remaining].filter((c) => (g.prereqs.get(c) ?? []).every((p) => done.has(p)));
    if (!unlocked.length) break;
    // ลำดับความสำคัญ: เทอมบนกระดาน → สายยาวกว่า → หน่วยกิตมากกว่า
    const ready = unlocked
      .filter((c) => offeredIn(g.courses.get(c) as { offered?: string[] }, sem))
      .sort((a, b) => semOf(a) - semOf(b) || (depth.get(b) ?? 0) - (depth.get(a) ?? 0) || creditsOf(b) - creditsOf(a));
    const term: string[] = [];
    let credits = 0;
    for (const c of ready) {
      const cr = creditsOf(c);
      if (credits + cr <= maxCredits) {
        term.push(c);
        credits += cr;
      }
    }
    if (!term.length && ready.length) break;
    plan.push({ sem, term, credits });
    for (const c of term) {
      done.add(c);
      remaining.delete(c);
    }
  }
  return plan;
}
