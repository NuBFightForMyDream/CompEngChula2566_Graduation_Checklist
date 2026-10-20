// graph.js — อัลกอริทึมกราฟล้วนๆ (ไม่แตะหน้าเว็บ) ตรงกับ cp52_checklist_graduation.py
// วิชา = node, prereq = ลูกศร · buildGraph, topological sort (Kahn), DFS/BFS, DP บน DAG,
// ตรวจลำดับเทอม, เลื่อนวิชาตาม, จัดแผนเทอมที่เหลือ (greedy)

const SEMS = ["1/1", "1/2", "2/1", "2/2", "3/1", "3/2", "4/1", "4/2", "5/1", "5/2"];
const semIdx = s => (+s[0] - 1) * 2 + (+s[2] - 1);
const semAt = i => `${Math.floor(i / 2) + 1}/${i % 2 + 1}`;
// offered = ["1"] เปิดเฉพาะเทอมต้น, ["2"] เฉพาะเทอมปลาย, ไม่ใส่ = ทุกเทอม (ข้ามปีได้ ข้ามเทอมไม่ได้)
const offeredIn = (course, sem) => !course.offered || course.offered.includes(sem[2]);

function buildGraph(list) {
  const courses = new Map(list.map(c => [c.id, c]));
  const prereqs = new Map(list.map(c => [c.id, c.prereq]));
  const unlocks = new Map(list.map(c => [c.id, []]));
  for (const [id, pres] of prereqs) for (const p of pres) unlocks.get(p).push(id);
  return { courses, prereqs, unlocks };
}

function topoSort({ prereqs, unlocks }) {
  const indeg = new Map([...prereqs].map(([k, v]) => [k, v.length]));
  const q = [...prereqs.keys()].filter(k => indeg.get(k) === 0);
  const order = [];
  for (let i = 0; i < q.length; i++) {
    const u = q[i]; order.push(u);
    for (const v of unlocks.get(u)) { indeg.set(v, indeg.get(v) - 1); if (indeg.get(v) === 0) q.push(v); }
  }
  return order;
}

function prereqChain(prereqs, target) {
  const seen = new Set(), stack = [target];
  while (stack.length) for (const p of prereqs.get(stack.pop())) if (!seen.has(p)) { seen.add(p); stack.push(p); }
  return seen;
}

function affected(unlocks, target) {
  const seen = new Set(), q = [target];
  for (let i = 0; i < q.length; i++) for (const v of unlocks.get(q[i])) if (!seen.has(v)) { seen.add(v); q.push(v); }
  return seen;
}

function chainDepth(order, unlocks, remaining) {
  const depth = new Map();
  for (const v of [...order].reverse()) {
    if (!remaining.has(v)) continue;
    let best = 0;
    for (const w of unlocks.get(v)) if (remaining.has(w)) best = Math.max(best, depth.get(w));
    depth.set(v, best + 1);
  }
  return depth;
}

// prereq ต้องอยู่เทอมก่อนหน้าแบบเคร่ง: คืน [prereq, วิชา] ที่ผิดลำดับ
function findConflicts(prereqs, place) {
  const bad = [];
  for (const [id, pres] of prereqs) for (const p of pres) if (semIdx(place[p]) >= semIdx(place[id])) bad.push([p, id]);
  return bad;
}

// เดินตาม topological order แล้วดันวิชาที่ผิดลำดับไปเทอมถัดจาก prereq ที่ช้าที่สุด
// (รวมวิชาที่ติ๊กผ่านแล้วด้วย เพราะผู้ใช้เป็นคนจัดแผนเอง) ถ้าเทอมนั้นไม่เปิดสอนให้ขยับต่อ
// only = ถ้าส่ง Set มา จะเลื่อนเฉพาะวิชาในเซตนั้น · stuck = วิชาที่ต้องเลื่อนเกินปี 5 (เลื่อนไม่ได้)
function shiftDependents(order, prereqs, place, only, courses) {
  const next = { ...place }, moved = [], stuck = [];
  for (const v of order) {
    const pres = prereqs.get(v);
    if (!pres.length || (only && !only.has(v))) continue;
    let need = Math.max(...pres.map(p => semIdx(next[p]))) + 1;
    while (need < SEMS.length && !offeredIn(courses.get(v), SEMS[need])) need++;
    if (semIdx(next[v]) >= need) continue;
    if (need >= SEMS.length) { stuck.push(v); continue; }
    moved.push([v, next[v], SEMS[need]]); next[v] = SEMS[need];
  }
  return { place: next, moved, stuck };
}

function planRemaining(g, order, passed, place, maxCredits, credOf) {
  const done = new Set(passed);
  const remaining = new Set([...g.courses.keys()].filter(c => !done.has(c)));
  const depth = chainDepth(order, g.unlocks, remaining);
  const plan = [];
  // เริ่มเทอมถัดจากเทอมสุดท้ายที่มีวิชาผ่านแล้ว แต่ละรอบ = เทอมจริง จึงหยิบเฉพาะวิชาที่เปิดเทอมนั้น
  let now = passed.size ? Math.max(...[...passed].map(c => semIdx(place[c]))) + 1 : 0;
  while (remaining.size) {
    const sem = semAt(now++);
    // priority: เทอมบนกระดาน → สายยาวกว่า → หน่วยกิตมากกว่า
    const unlocked = [...remaining].filter(c => g.prereqs.get(c).every(p => done.has(p)));
    if (!unlocked.length) break;
    const ready = unlocked.filter(c => offeredIn(g.courses.get(c), sem));
    ready.sort((a, b) =>
      semIdx(place[a]) - semIdx(place[b]) || depth.get(b) - depth.get(a) || credOf(b) - credOf(a));
    const term = []; let credits = 0;
    for (const c of ready) {
      const cr = credOf(c);
      if (credits + cr <= maxCredits) { term.push(c); credits += cr; }
    }
    if (!term.length && ready.length) break;
    plan.push({ sem, term, credits });
    for (const c of term) { done.add(c); remaining.delete(c); }
  }
  return plan;
}
