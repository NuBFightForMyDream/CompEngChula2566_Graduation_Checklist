// grades.js — เกรดรายวิชา, GPA รายเทอม และ GPAX
// เกรดที่นับในเกรดเฉลี่ย: A=4, B+=3.5, B=3, C+=2.5, C=2, D+=1.5, D=1, F=0 · S / U / W ไม่นับ
// เกรดผ่าน (A–D, S) = ติ๊กผ่านให้อัตโนมัติ (ต้องผ่าน prereq ก่อน) · F / U / W = ไม่ผ่าน

const GRADE_POINTS = { "A": 4, "B+": 3.5, "B": 3, "C+": 2.5, "C": 2, "D+": 1.5, "D": 1, "F": 0 };
const GRADES = [...Object.keys(GRADE_POINTS), "S", "U", "W"];
const PASSING = new Set(["A", "B+", "B", "C+", "C", "D+", "D", "S"]);
let grades = {};   // id วิชา -> เกรด

// GPA = Σ(แต้มเกรด × หน่วยกิต) / Σหน่วยกิต  เฉพาะวิชาที่มีเกรด A–F
function gpaOf(ids) {
  let points = 0, credits = 0;
  for (const id of ids) {
    const gp = GRADE_POINTS[grades[id]];
    if (gp === undefined || !g.courses.has(id)) continue;
    points += gp * creditsOf(id);
    credits += creditsOf(id);
  }
  return { gpa: credits ? points / credits : null, credits };
}

// แสดง 2 ตำแหน่ง โดยตัดทศนิยมตำแหน่งที่ 3 ทิ้ง (ไม่ปัดขึ้น)
const fmtGpa = x => (Math.floor(x * 100 + 1e-9) / 100).toFixed(2);

// ใส่เกรดให้วิชาเดียว (ไม่บันทึก/ไม่วาดใหม่) คืนข้อความ error ถ้าใส่ไม่ได้
function applyGrade(id, grade) {
  if (!grade) { delete grades[id]; return null; }
  if (PASSING.has(grade)) {
    const miss = g.prereqs.get(id).filter(p => !passed.has(p));
    if (miss.length) return `ใส่เกรด ${grade} ให้ ${label(id)} ไม่ได้ ต้องผ่าน ${miss.map(label).join(", ")} ก่อน`;
    grades[id] = grade;
    passed.add(id);
    return null;
  }
  grades[id] = grade;                       // F / U / W = ไม่ผ่าน
  if (passed.has(id)) unpass(id);           // วิชาที่ต่อจากนี้ถูกยกเลิกผ่านตามด้วย
  return null;
}

function setGrade(id, grade) {
  const err = applyGrade(id, grade);
  if (err) { say(err, true); return; }
  say(grade ? `ใส่เกรด ${grade} ให้ ${label(id)} แล้ว` : `ล้างเกรด ${label(id)} แล้ว`);
  save(); update();
}

// ปุ่มเกรดในกล่อง "วิชาที่เลือก"
function gradeUI(id) {
  return `<div class="grade-row" role="group" aria-label="เกรด">
    <span>เกรด</span>
    ${GRADES.map(gr => `<button type="button" class="grade-chip${grades[id] === gr ? " on" : ""}" data-grade="${gr}" aria-pressed="${grades[id] === gr}">${gr}</button>`).join("")}
    ${grades[id] ? `<button type="button" class="grade-chip clear" data-grade="">ล้าง</button>` : ""}
  </div>`;
}

function bindGradeUI(id) {
  $("info").querySelectorAll(".grade-chip").forEach(btn =>
    btn.addEventListener("click", () => setGrade(id, btn.dataset.grade)));
}

// ---------- กรอกเกรดหลายวิชาทีเดียว ----------
// รับได้ทั้ง "2110101 A" บรรทัดละวิชา และรูปแบบ {"2110101","A"} แบบในโค้ด C++
function importGrades(text) {
  const byCode = new Map();
  for (const c of allCourses()) {
    byCode.set(c.id, c.id);
    const code = codeOf(c);
    if (!/[xy]/i.test(code)) byCode.set(code, c.id);   // ข้ามรหัสช่องว่างอย่าง 2110xxx
  }
  const tokens = text.replace(/["'{}()[\],;:=]/g, " ").split(/\s+/).filter(Boolean);
  const wanted = new Map(), unknown = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const grade = tokens[i + 1].toUpperCase();
    if (!GRADES.includes(grade)) continue;
    const id = byCode.get(tokens[i]);
    if (id) wanted.set(id, grade);
    else if (/^\d{7}$/.test(tokens[i])) unknown.push(tokens[i]);
    i++;
  }
  // ใส่ตาม topological order เพื่อให้ prereq ผ่านก่อนวิชาที่ต่อจากมัน
  const failed = [];
  let done = 0;
  for (const id of order) {
    if (!wanted.has(id)) continue;
    const err = applyGrade(id, wanted.get(id));
    if (err) failed.push(label(id)); else done++;
  }
  save(); update();
  return { done, failed, unknown };
}

function bindGradeImport() {
  $("btn-grades").addEventListener("click", e => {
    const box = $("grade-import");
    box.hidden = !box.hidden;
    e.target.setAttribute("aria-expanded", !box.hidden);
    if (!box.hidden) $("grade-text").focus();
  });
  $("grade-import").addEventListener("submit", e => {
    e.preventDefault();
    const r = importGrades($("grade-text").value);
    const parts = [`ใส่เกรดแล้ว ${r.done} วิชา`];
    if (r.failed.length) parts.push(`ใส่ไม่ได้เพราะยังไม่ผ่าน prereq: ${r.failed.join(", ")}`);
    if (r.unknown.length) parts.push(`ไม่พบรหัสในหลักสูตร: ${r.unknown.join(", ")} (เพิ่มเป็นวิชาเรียนเพิ่มได้ด้วย "+ เพิ่มวิชา")`);
    $("grade-result").textContent = parts.join(" · ");
    $("grade-result").classList.toggle("bad-text", r.failed.length + r.unknown.length > 0);
  });
}

// ใช้ใน update(): GPAX ใต้ยอดหน่วยกิต และ GPA บนหัวคอลัมน์แต่ละเทอม
function renderGpa() {
  const all = gpaOf(Object.keys(grades));
  $("gpax").hidden = all.gpa === null;
  if (all.gpa !== null) $("gpax").innerHTML = `GPAX <b>${fmtGpa(all.gpa)}</b> <span class="muted">· คิดจาก ${all.credits} หน่วยกิตที่มีเกรด</span>`;
  $("board").querySelectorAll(".col").forEach(col => {
    const term = gpaOf(allCourses().filter(c => place[c.id] === col.dataset.sem).map(c => c.id));
    const span = col.querySelector(".col-head span");
    if (term.gpa !== null) span.textContent += ` · GPA ${fmtGpa(term.gpa)}`;
  });
  $("board").querySelectorAll(".card").forEach(el => {
    const tick = el.querySelector(".tick"), gr = grades[el.dataset.id];
    if (gr) { tick.dataset.grade = gr; tick.title = `เกรด ${gr}`; }
    else delete tick.dataset.grade;
  });
}
