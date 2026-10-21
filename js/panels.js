// panels.js — ส่วนรอบตาราง: สรุปหน่วยกิต, ปรับสีวิชา, กล่อง "วิชาที่เลือก", เลือกวิชาให้ช่อง ELECTIVE,
// แถบเตือนลำดับผิด, รายการที่ลงได้ และแผนแนะนำ · update() = วาดทุกอย่างใหม่หลังข้อมูลเปลี่ยน

// กลุ่มย่อยของหมวดแกนสาขา (สีหลายสีในตารางหลักสูตร) — หมวดที่มีกลุ่มย่อยใช้แถบสีไล่ตามกลุ่ม
const subGroups = () => Object.entries(cur.groups ?? {}).filter(([k]) => cur.courses.some(c => c.group === k && c.category === "core"));
function renderPalette() {
  const rows = [
    ...Object.entries(cur.categories).filter(([k]) => !subGroups().length || k !== "core").map(([k, c]) => ["cat:" + k, c.label, catColor(k)]),
    ...Object.entries(cur.groups ?? {}).map(([k, gr]) => ["group:" + k, gr.label, groupColor(k)]),
  ];
  $("palette-grid").innerHTML = rows.map(([key, lab, hex], i) => `
    <label class="pal" for="pal-${i}"><input type="color" id="pal-${i}" data-key="${key}" value="${hex}"><span>${esc(lab)}</span></label>`).join("");
  $("palette-grid").querySelectorAll("input").forEach(inp => inp.addEventListener("input", e => {
    colorOverrides[e.target.dataset.key] = e.target.value;
    store.set("colors:" + cur.id, colorOverrides);
    renderBoard(); update();
  }));
}

function swatch(k) {
  const cols = [...new Set(cur.courses.filter(x => x.category === k && x.group).map(x => groupColor(x.group)))];
  if (cols.length < 2) return ink(catColor(k));
  return `linear-gradient(90deg, ${cols.map((col, i) => `${col} ${100 * i / cols.length}% ${100 * (i + 1) / cols.length}%`).join(", ")})`;
}

function renderInfo() {
  const info = $("info");
  const id = selectedId;
  if (!id) {
    info.innerHTML = `<span class="muted">คลิกชื่อวิชาบนการ์ด เพื่อดูวิชาบังคับก่อน วิชาที่จะกระทบ และย้ายเทอม</span>`;
    return;
  }
  const c = g.courses.get(id);
  const pre = prereqChain(g.prereqs, id), post = affected(g.unlocks, id);
  const names = s => [...s].map(x => esc(label(x))).join(", ") || "ไม่มี";
  const st = { passed: "ผ่านแล้ว", "passed broken": "ติ๊กผ่านแล้ว แต่ prereq ยังไม่ครบ", available: "ลงได้ตอนนี้", locked: "ยังล็อก" }[statusOf(id)];
  const mine = conflicts.filter(([p, v]) => p === id || v === id);
  const moved = place[id] !== c.semester;
  info.innerHTML = `
    <p><b>${esc(label(id))}</b> · ${creditsOf(id)} หน่วยกิต · ${catOf(c).label}</p>
    <p class="muted">สถานะ: ${st} · ${c.offered ? `เปิดสอนเฉพาะเทอม ${c.offered.join(", ")}` : "เปิดทุกเทอม"} · แผนเดิม ${semName(c.semester)}${moved ? ` · ย้ายไป ${semName(place[id])}` : ""}</p>
    <p><span style="color:var(--accent)">ต้องผ่านก่อน:</span> ${names(pre)}</p>
    <p><span style="color:var(--warn)">ถ้าตก จะกระทบ:</span> ${names(post)}</p>
    ${mine.map(([p, v]) => `<p class="bad-text">✗ ${esc(label(v))} อยู่ ${place[v]} แต่วิชาบังคับก่อน ${esc(label(p))} อยู่ ${place[p]}</p>`).join("")}
    ${c.pool ? choiceUI(id, c) : ""}
    ${gradeUI(id)}
    <div class="actions">
      <label for="move-sel">ย้ายไป</label>
      <select id="move-sel">${SEMS.map(s => `<option value="${s}" ${s === place[id] ? "selected" : ""} ${offeredIn(c, s) ? "" : "disabled"}>${semName(s)}${offeredIn(c, s) ? "" : " · ไม่เปิดสอน"}</option>`).join("")}</select>
      <button type="button" id="btn-tick" ${statusOf(id) === "locked" ? 'aria-disabled="true"' : ""}>${passed.has(id) ? "ยกเลิกติ๊กผ่าน" : "ติ๊กว่าผ่านแล้ว"}</button>
      ${moved ? `<button type="button" id="btn-back">คืนเทอมเดิม</button>` : ""}
      ${c.extra ? `<label for="extra-cat">นับเป็น</label><select id="extra-cat">${groupOptions(c.category)}</select>
        <button type="button" id="btn-remove">ลบวิชานี้</button>` : ""}
      ${mine.length ? `<button type="button" class="primary" id="btn-shift-one">เลื่อนวิชาที่ต่อจากนี้ตามไป</button>` : ""}
    </div>`;
  $("move-sel").addEventListener("change", e => moveCourse(id, e.target.value));
  $("btn-tick").addEventListener("click", () => togglePassed(id));
  $("btn-back")?.addEventListener("click", () => moveCourse(id, c.semester));
  $("btn-remove")?.addEventListener("click", () => removeExtra(id));
  $("extra-cat")?.addEventListener("change", e => { c.category = e.target.value; save(); renderBoard(); update(); });
  $("btn-shift-one")?.addEventListener("click", () => shift(new Set([id, ...post])));
  if (c.pool) bindChoice(id, c);
  bindGradeUI(id);
}

// ---------- เลือกวิชาให้ช่อง ELECTIVE / APPROVED / FREE ----------
function choiceUI(id, c) {
  const pool = cur.pools[c.pool], ch = choices[id];
  const used = new Set(Object.entries(choices).filter(([k]) => k !== id).map(([, v]) => v.id).filter(Boolean));
  const custom = ch && !ch.id;
  return `<div class="choose">
    <label for="choice-sel"><b>เลือกวิชาสำหรับช่องนี้</b> <span class="muted">· ${pool.label}</span></label>
    <select id="choice-sel">
      <option value="">— ยังไม่เลือก —</option>
      ${pool.options.map(o => `<option value="${o.id}" ${ch?.id === o.id ? "selected" : ""} ${used.has(o.id) ? "disabled" : ""}>${esc(o.code)} ${esc(o.name)} (${o.credits})${used.has(o.id) ? " · เลือกในช่องอื่นแล้ว" : ""}</option>`).join("")}
      <option value="__custom" ${custom ? "selected" : ""}>กรอกรหัสและชื่อวิชาเอง…</option>
    </select>
    <form class="custom" id="choice-form" ${custom ? "" : "hidden"}>
      <input id="choice-code" placeholder="รหัสวิชา" value="${custom ? esc(ch.code) : ""}" required>
      <input id="choice-name" placeholder="ชื่อวิชา" value="${custom ? esc(ch.name) : ""}" required>
      <input id="choice-credits" type="number" min="1" max="6" value="${custom ? ch.credits : c.credits}" aria-label="หน่วยกิต" required>
      <button type="submit">บันทึก</button>
    </form>
    ${pool.note ? `<p class="note">${pool.note}</p>` : ""}
  </div>`;
}

function bindChoice(id, c) {
  const pool = cur.pools[c.pool];
  const apply = val => { val ? (choices[id] = val) : delete choices[id]; save(); renderBoard(); update(); };
  $("choice-sel").addEventListener("change", e => {
    const v = e.target.value;
    if (v === "__custom") { $("choice-form").hidden = false; $("choice-code").focus(); return; }
    const o = pool.options.find(o => o.id === v);
    apply(o ? { id: o.id, code: o.code, name: o.name, credits: o.credits } : null);
  });
  $("choice-form").addEventListener("submit", e => {
    e.preventDefault();
    const code = $("choice-code").value.trim(), name = $("choice-name").value.trim();
    const credits = Math.max(1, Math.min(6, parseInt($("choice-credits").value, 10) || c.credits));
    if (code && name) apply({ id: null, code, name, credits });
  });
}

function shift(only) {
  const res = shiftDependents(order, g.prereqs, place, only, g.courses);
  place = res.place; save(); renderBoard(); update();
  reportShift(res);
}

function reportShift(res, prefix = "") {
  const parts = [];
  if (res.moved.length) parts.push("เลื่อนตาม: " + res.moved.map(([v, a, b]) => `${label(v)} ${a} → ${b}`).join(", "));
  if (res.stuck.length) parts.push("เลื่อนไม่ได้เพราะเกินปี 5: " + res.stuck.map(label).join(", "));
  say(prefix + parts.join(" · "), res.stuck.length > 0);
}

// ย้ายแล้วให้วิชาที่ต่อเนื่องเลื่อนตามทันที (ปิดได้ที่ช่องติ๊กด้านบน)
let autoShift = store.get("autoShift") ?? true;

function update() {
  conflicts = findConflicts(g.prereqs, place);
  const badIds = new Set(conflicts.flat());
  $("board").querySelectorAll(".card").forEach(el => {
    const id = el.dataset.id;
    const tick = el.querySelector(".tick");
    tick.setAttribute("aria-disabled", statusOf(id) === "locked");
    tick.title = statusOf(id) === "locked" ? "ต้องผ่านวิชาบังคับก่อนก่อน" : "";
    el.className = "card " + statusOf(id) + (g.courses.get(id).extra ? " extra-card" : "")
      + (badIds.has(id) ? " conflict" : "")
      + (place[id] !== g.courses.get(id).semester ? " moved" : "");
  });

  // หน่วยกิตต่อเทอม
  $("board").querySelectorAll(".col").forEach(col => {
    const cr = allCourses().filter(c => place[c.id] === col.dataset.sem).reduce((s, c) => s + creditsOf(c.id), 0);
    const span = col.querySelector(".col-head span");
    const over = cr > cur.maxCreditsPerSemester;
    span.textContent = cr ? `${cr} หน่วยกิต${over ? ` · เกิน ${cur.maxCreditsPerSemester}` : ""}` : "ว่าง";
    span.classList.toggle("over", over);
  });

  renderGpa();   // grades.js: GPAX, GPA รายเทอม, เกรดบนการ์ด

  // banner
  const banner = $("banner");
  banner.hidden = !conflicts.length;
  if (conflicts.length) {
    $("banner-text").innerHTML = `<b>ลำดับวิชาผิด ${conflicts.length} คู่:</b> `
      + conflicts.map(([p, v]) => `${esc(label(v))} (${place[v]}) ลงก่อน ${esc(label(p))} (${place[p]})`).join(" · ");
  }

  // credits per category (hash map นับ)
  const got = Object.fromEntries(Object.keys(cur.categories).map(k => [k, 0]));
  for (const id of passed) { const c = g.courses.get(id); if (c.category in got) got[c.category] += creditsOf(id); }
  const total = Object.values(got).reduce((a, b) => a + b, 0);
  const exIn = extras.filter(c => c.category in got).reduce((a, c) => a + c.credits, 0);
  const exOut = extras.filter(c => !(c.category in got)).reduce((a, c) => a + c.credits, 0);
  $("extra-note").hidden = !extras.length;
  $("extra-note").textContent = `เรียนเพิ่ม ${extras.length} วิชา · นับเข้าหมวด ${exIn} หน่วยกิต`
    + (exOut ? ` · นอกหลักสูตร ${exOut} หน่วยกิต` : "");
  $("total-got").textContent = total;
  $("total-need").textContent = cur.totalCredits;
  $("total-bar").style.width = Math.min(100, 100 * total / cur.totalCredits) + "%";
  const left = cur.totalCredits - total;
  const last = SEMS.filter(s => allCourses().some(c => place[c.id] === s)).pop();
  $("total-note").textContent = (left > 0 ? `เหลืออีก ${left} หน่วยกิต` : "หน่วยกิตครบตามหลักสูตรแล้ว") + ` · จบ${semName(last)}`;
  $("cats").innerHTML = Object.entries(cur.categories).map(([k, c]) => `
    <div class="cat ${got[k] >= c.required ? "done" : ""}">
      <i class="sw" style="background:${swatch(k)}"></i><span>${c.label}</span>
      <span class="num">${got[k]}/${c.required}${got[k] > c.required ? ` (+${got[k] - c.required})` : ""}</span>
      <div class="meter"><i style="width:${Math.min(100, 100 * got[k] / c.required)}%;background:${swatch(k)}"></i></div>
    </div>`).join("")
    + (subGroups().length ? `<div class="groups">${subGroups().map(([k, gr]) => `<span><i style="background:${groupColor(k)}"></i>${gr.label}</span>`).join("")}</div>` : "");

  const avail = allCourses().filter(c => statusOf(c.id) === "available");
  $("avail-count").textContent = `(${avail.length})`;
  $("avail").innerHTML = avail.slice(0, 14).map(c =>
    `<li><i class="dot" style="background:${color(c)}"></i><code>${esc(codeOf(c))}</code><span>${esc(nameOf(c))}</span><span class="cr">${place[c.id]}</span></li>`).join("")
    + (avail.length > 14 ? `<li><span></span><span></span><span class="muted">และอีก ${avail.length - 14} วิชา</span></li>` : "");

  const plan = planRemaining(g, order, passed, place, cur.maxCreditsPerSemester, creditsOf);
  $("plan").innerHTML = plan.length ? plan.map((t, i) => `
    <div class="term"><h3><span>${semName(t.sem)}</span><span class="muted">${t.term.length ? t.credits + " หน่วยกิต" : "ไม่มีวิชาที่เปิดสอน"}</span></h3>
      <ul class="list">${t.term.map(id => { const c = g.courses.get(id);
        return `<li><i class="dot" style="background:${color(c)}"></i><code>${esc(codeOf(c))}</code><span>${esc(nameOf(c))}</span><span class="cr">${creditsOf(id)}</span></li>`; }).join("")}</ul>
    </div>`).join("") : `<p>ผ่านครบทุกวิชาแล้ว</p>`;

  drawEdges();
  renderInfo();
}
