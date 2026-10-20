// state.js — ข้อมูลที่ผู้ใช้กำลังใช้อยู่ (หลักสูตร, วิชาที่ผ่าน, เทอมที่วาง, วิชาที่เลือก, วิชาเรียนเพิ่ม, สี)
// การบันทึกลง localStorage และฟังก์ชันช่วยที่ทุกไฟล์ใช้ ($, label, color, statusOf ...)

// ---------- state ----------
let dragId = null;
let cur, g, order, passed = new Set(), place = {}, choices = {}, extras = [], addingSem = null, selectedId = null, hoverId = null, conflicts = [];

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const save = () => { store.set("passed:" + cur.id, [...passed]); store.set("place:" + cur.id, place); store.set("choice:" + cur.id, choices); store.set("extra:" + cur.id, extras); store.set("grade:" + cur.id, grades); };
const $ = id => document.getElementById(id);
// วิชาเรียนเพิ่ม: node ที่ไม่มีลูกศร prereq เลือกได้ว่านับเข้าหมวดไหน (category "extra" = ไม่นับในหลักสูตร)
// นับเป็นภาระหน่วยกิตต่อเทอมเสมอ
const EXTRA = { label: "นอกหลักสูตร (ไม่นับ)", color: "var(--extra)" };
const EXTRA_GROUPS = ["gened", "elective", "free", "c21", "it", "extra"];
const groupOptions = sel => EXTRA_GROUPS.filter(k => k === "extra" || cur.categories[k])
  .map(k => `<option value="${k}" ${k === sel ? "selected" : ""}>${(cur.categories[k] ?? EXTRA).label}</option>`).join("");
const catOf = c => cur.categories[c.category] ?? EXTRA;
// สีการ์ด: ใช้สีกลุ่มย่อยก่อน (เช่น แกนสาขา Programming / Hardware / System / Software) แล้วค่อยสีหมวด
// สีดำของวิชาเลือกเสรีใช้ token --ink เพื่อให้ยังเห็นได้ใน dark mode
// สีที่ผู้ใช้เลือกเอง (กล่อง "ปรับสีวิชา") ทับสีจากไฟล์หลักสูตร  key = "cat:core" หรือ "group:prog"
let colorOverrides = {};
const ink = hex => /^#(000000|111111)$/i.test(hex) ? "var(--ink)" : hex;
const catColor = k => colorOverrides["cat:" + k] ?? (cur.categories[k] ?? EXTRA).color;
const groupColor = k => colorOverrides["group:" + k] ?? cur.groups[k].color;
const color = c => ink(cur.groups?.[c.group] ? groupColor(c.group) : catColor(c.category));
const allCourses = () => [...cur.courses, ...extras];
function rebuild() { g = buildGraph(allCourses()); order = topoSort(g); }
// ช่องวิชาเลือก (ELECTIVE / APPROVED / FREE) แสดงวิชาที่ผู้ใช้เลือกแทนชื่อช่อง
const codeOf = c => choices[c.id]?.code ?? (c.code || c.id);
const nameOf = c => choices[c.id]?.name ?? c.name;
const creditsOf = id => choices[id]?.credits ?? g.courses.get(id).credits;
const label = id => { const c = g.courses.get(id); return `${codeOf(c)} ${nameOf(c)}`; };
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const defaultPlace = () => Object.fromEntries(allCourses().map(c => [c.id, c.semester]));
const semName = s => `ปี ${s[0]} เทอม ${s[2]}`;

function statusOf(id) {
  const ok = g.prereqs.get(id).every(p => passed.has(p));
  if (passed.has(id)) return ok ? "passed" : "passed broken";
  return ok ? "available" : "locked";
}
