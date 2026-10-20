// board.js — ตาราง roadmap: วาดคอลัมน์/การ์ด, ลากย้ายเทอม, ติ๊กผ่าน, เพิ่ม/ลบวิชาเรียนเพิ่ม,
// ไฮไลต์สายวิชาตอนชี้เมาส์/เลือก และวาดลูกศร prereq (SVG)

function moveCourse(id, sem) {
  if (place[id] === sem) return;
  const c = g.courses.get(id);
  if (!offeredIn(c, sem)) {
    say(`ย้าย ${label(id)} ไป${semName(sem)} ไม่ได้ วิชานี้เปิดสอนเฉพาะเทอม ${c.offered.join(", ")} (เลื่อนข้ามปีได้ แต่ข้ามเทอมไม่ได้)`, true);
    return;
  }
  if (c.extra) c.semester = sem;
  place[id] = sem;
  let res = null;
  if (autoShift) { res = shiftDependents(order, g.prereqs, place, new Set(affected(g.unlocks, id)), g.courses); place = res.place; }
  save(); renderBoard(); update();
  if (res) reportShift(res, `ย้าย ${label(id)} ไป${semName(sem)} แล้ว${res.moved.length || res.stuck.length ? " · " : ""}`);
  else say("");
}

// ---------- render ----------
function renderBoard() {
  const board = $("board");
  const before = cardPositions();   // animate.js: จำตำแหน่งเดิมไว้ทำแอนิเมชัน
  hoverId = null; clearTimeout(hoverTimer);   // การ์ดถูกสร้างใหม่ทั้งหมด การ์ดเดิมจะไม่ได้รับ mouseleave
  board.querySelectorAll(".col").forEach(n => n.remove());
  SEMS.forEach((sem, i) => {
    const col = document.createElement("div");
    col.className = "col" + (Math.floor(i / 2) % 2 === 0 ? " odd-year" : "");
    col.dataset.sem = sem;
    col.innerHTML = `<div class="col-head"><b>${semName(sem)}</b><span></span></div>`;
    const list = allCourses().filter(c => place[c.id] === sem);
    if (!list.length) col.insertAdjacentHTML("beforeend", `<div class="hint">ลากวิชามาวางที่นี่</div>`);
    for (const c of list) col.appendChild(makeCard(c));
    col.appendChild(addSlot(sem));
    col.addEventListener("dragover", e => {
      if (!dragId || !offeredIn(g.courses.get(dragId), sem)) return;   // ไม่ preventDefault = วางไม่ได้
      e.preventDefault(); col.classList.add("drop");
    });
    col.addEventListener("dragleave", e => { if (!col.contains(e.relatedTarget)) col.classList.remove("drop"); });
    col.addEventListener("drop", e => {
      e.preventDefault(); col.classList.remove("drop");
      const id = e.dataTransfer.getData("text/plain");
      if (g.courses.has(id)) { droppedId = id; moveCourse(id, sem); }
    });
    board.appendChild(col);
  });
  playBoardAnimation(before);
}

// ---------- วิชาเรียนเพิ่ม ----------
function addSlot(sem) {
  const wrap = document.createElement("div");
  wrap.className = "add-slot";
  if (addingSem !== sem) {
    wrap.innerHTML = `<button type="button" class="add-btn">+ เพิ่มวิชา</button>`;
    wrap.firstChild.addEventListener("click", () => { addingSem = sem; renderBoard(); update(); $("add-code").focus(); });
    return wrap;
  }
  wrap.innerHTML = `<form class="add-form" id="add-form">
      <input id="add-code" placeholder="รหัสวิชา" aria-label="รหัสวิชา" required>
      <input id="add-name" placeholder="ชื่อวิชา" aria-label="ชื่อวิชา" required>
      <input id="add-credits" type="number" min="1" max="6" value="3" aria-label="หน่วยกิต" required>
      <select id="add-cat" aria-label="นับเข้าหมวด">${groupOptions("free")}</select>
      <div class="row"><button type="submit">เพิ่ม</button><button type="button" id="add-cancel">ยกเลิก</button></div>
    </form>`;
  wrap.querySelector("form").addEventListener("submit", e => {
    e.preventDefault();
    const code = $("add-code").value.trim(), name = $("add-name").value.trim();
    const credits = Math.max(1, Math.min(6, parseInt($("add-credits").value, 10) || 3));
    if (!code || !name) return;
    const id = "X-" + Date.now().toString(36);
    extras.push({ id, code, name, credits, category: $("add-cat").value, semester: sem, prereq: [], extra: true });
    place[id] = sem; addingSem = null; selectedId = id;
    rebuild(); save(); renderBoard(); update();
    say(`เพิ่ม ${code} ${name} ใน${semName(sem)} แล้ว · นับเป็น ${catOf(g.courses.get(id)).label}`);
  });
  wrap.querySelector("#add-cancel").addEventListener("click", () => { addingSem = null; renderBoard(); update(); });
  return wrap;
}

function removeExtra(id) {
  const c = g.courses.get(id);
  extras = extras.filter(x => x.id !== id);
  passed.delete(id); delete place[id]; delete grades[id];
  if (selectedId === id) selectedId = null;
  rebuild(); save(); renderBoard(); update();
  say(`ลบ ${c.code} ${c.name} แล้ว`);
}

function makeCard(c) {
  const el = document.createElement("div");
  el.className = "card"; el.dataset.id = c.id; el.draggable = true;
  el.style.setProperty("--c", color(c));
  const slot = c.pool ? `<span class="slot-tag">${choices[c.id] ? c.name : "ยังไม่ได้เลือกวิชา"}</span>`
    : c.extra ? `<span class="slot-tag">เรียนเพิ่ม · ${catOf(c).label}</span>` : "";
  el.innerHTML = `<button type="button" class="sel">${slot}<span class="nm">${esc(nameOf(c))}</span><span class="cd"><span>${esc(codeOf(c))} (${creditsOf(c.id)})</span></span></button>
    <button type="button" class="tick" aria-label="ติ๊กว่าผ่าน ${esc(label(c.id))}"></button>`;
  el.querySelector(".sel").addEventListener("click", () => {
    clearTimeout(hoverTimer); hoverId = null;
    selectedId = selectedId === c.id ? null : c.id; applyFocus(); renderInfo();
  });
  el.querySelector(".tick").addEventListener("click", () => togglePassed(c.id));
  el.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") hoverStart(c.id); });
  el.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") hoverEnd(); });
  el.addEventListener("dragstart", e => {
    dragId = c.id; clearTimeout(hoverTimer); hoverId = null; applyFocus();
    $("board").classList.add("is-dragging");
    e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; el.classList.add("dragging");
    $("board").querySelectorAll(".col").forEach(col => col.classList.toggle("nodrop", !offeredIn(c, col.dataset.sem)));
  });
  el.addEventListener("dragend", () => {
    dragId = null; hoverId = null; el.classList.remove("dragging");
    $("board").classList.remove("is-dragging");
    $("board").querySelectorAll(".col").forEach(col => col.classList.remove("nodrop", "drop"));
  });
  return el;
}

// ติ๊กได้เฉพาะวิชาที่ prereq ผ่านครบแล้ว / ยกเลิกติ๊กแล้ววิชาที่ต่อจากนี้ (BFS) ถูกยกเลิกตามด้วย
// ชี้เมาส์ค้างไว้ครู่หนึ่งถึงจะไฮไลต์สายวิชา (กันทั้งตารางกระพริบตอนลากเมาส์ผ่าน)
// ถ้ามีวิชาที่คลิกเลือกไว้ การชี้เมาส์จะไม่ไปทับ · จอสัมผัสใช้การคลิกเลือกอย่างเดียว
let hoverTimer = null;
function hoverStart(id) {
  clearTimeout(hoverTimer);
  if (selectedId || dragId) return;
  hoverTimer = setTimeout(() => { hoverId = id; applyFocus(); }, hoverId ? 0 : 180);
}
function hoverEnd() {
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => { if (hoverId) { hoverId = null; applyFocus(); } }, 60);
}

function togglePassed(id) {
  if (passed.has(id)) {
    const hit = unpass(id);
    say(hit.length ? `ยกเลิก ${label(id)} แล้ว และยกเลิกวิชาที่ต่อจากนี้ด้วย: ${hit.map(label).join(", ")}` : "");
  } else {
    const miss = g.prereqs.get(id).filter(p => !passed.has(p));
    if (miss.length) { say(`ติ๊ก ${label(id)} ไม่ได้ ต้องผ่าน ${miss.map(label).join(", ")} ก่อน`, true); return; }
    passed.add(id);
    if (grades[id] && !PASSING.has(grades[id])) delete grades[id];   // เคยได้ F/U/W แล้วติ๊กผ่าน = เรียนใหม่ผ่านแล้ว
    say("");
  }
  save(); update();
}

// ยกเลิกผ่านวิชานี้ และวิชาที่ต่อจากนี้ (BFS) พร้อมลบเกรดผ่านของวิชาเหล่านั้น · คืนรายชื่อวิชาที่โดนตาม
function unpass(id) {
  const hit = [...affected(g.unlocks, id)].filter(x => passed.has(x));
  for (const x of [id, ...hit]) {
    passed.delete(x);
    if (PASSING.has(grades[x])) delete grades[x];
  }
  return hit;
}

function say(msg, bad) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.toggle("bad-text", !!bad);
}

// ตัดวิชาที่ติ๊กไว้แต่ prereq ไม่ผ่าน (เดินตาม topological order รอบเดียว)
function cleanPassed(set) {
  const ok = new Set();
  for (const v of order) if (set.has(v) && g.prereqs.get(v).every(p => ok.has(p))) ok.add(v);
  return ok;
}

function drawEdges() {
  const svg = $("edges"), board = $("board"), box = board.getBoundingClientRect();
  const pos = id => board.querySelector(`.card[data-id="${id}"]`).getBoundingClientRect();
  const badSet = new Set(conflicts.map(([p, c]) => p + ">" + c));
  let out = `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>`;
  for (const c of cur.courses) for (const p of c.prereq) {
    const a = pos(p), b = pos(c.id);
    let x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top;
    let x2 = b.left - box.left - 2, y2 = b.top + b.height / 2 - box.top;
    if (x2 < x1) { x1 = a.left - box.left; x2 = b.right - box.left + 2; }   // ลูกศรย้อนกลับ (ผิดลำดับ)
    const dx = Math.max(30, Math.abs(x2 - x1) / 2) * Math.sign(x2 - x1 || 1);
    const cls = badSet.has(p + ">" + c.id) ? "edge bad" : "edge";
    out += `<path class="${cls}" data-from="${p}" data-to="${c.id}" marker-end="url(#arr)" d="M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}"/>`;
  }
  svg.innerHTML = out;
  applyFocus();
}

function applyFocus() {
  const focusId = selectedId || hoverId;
  const board = $("board");
  const pre = focusId ? prereqChain(g.prereqs, focusId) : new Set();
  const post = focusId ? affected(g.unlocks, focusId) : new Set();
  board.classList.toggle("focusing", !!focusId);
  board.querySelectorAll(".card").forEach(el => {
    const id = el.dataset.id;
    el.classList.toggle("hl-self", id === focusId);
    el.classList.toggle("hl-pre", pre.has(id));
    el.classList.toggle("hl-post", post.has(id));
  });
  const chain = new Set([focusId, ...pre, ...post]);
  board.querySelectorAll("path.edge").forEach(e =>
    e.classList.toggle("on", !!focusId && chain.has(e.dataset.from) && chain.has(e.dataset.to)));
}
