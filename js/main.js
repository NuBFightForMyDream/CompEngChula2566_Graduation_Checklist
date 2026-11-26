// main.js — จุดเริ่มต้น: โหลดรายชื่อหลักสูตร, โหลดหลักสูตร + ข้อมูลที่บันทึกไว้, ผูกปุ่มต่างๆ
// ต้องโหลดเป็นไฟล์สุดท้าย เพราะเรียกใช้ฟังก์ชันจากทุกไฟล์ก่อนหน้า

async function loadCurriculum(file) {
  cur = await (await fetch("data/" + file, { cache: "no-cache" })).json();
  extras = (store.get("extra:" + cur.id) ?? []).filter(c => c && c.id && SEMS.includes(c.semester))
    .map(c => ({ ...c, category: cur.categories[c.category] ? c.category : "extra", prereq: [], extra: true }));
  rebuild();
  colorOverrides = store.get("colors:" + cur.id) ?? {};
  passed = cleanPassed(new Set(store.get("passed:" + cur.id) ?? sampleYear1()));
  place = { ...defaultPlace(), ...(store.get("place:" + cur.id) ?? {}) };
  choices = store.get("choice:" + cur.id) ?? {};
  grades = store.get("grade:" + cur.id) ?? {};
  for (const id of Object.keys(grades))
    if (!g.courses.has(id) || !GRADES.includes(grades[id]) || (PASSING.has(grades[id]) && !passed.has(id))) delete grades[id];
  for (const id of Object.keys(choices)) if (!g.courses.get(id)?.pool) delete choices[id];
  for (const id of Object.keys(place)) if (!g.courses.has(id) || !SEMS.includes(place[id])) delete place[id];
  for (const c of allCourses()) if (!place[c.id] || !offeredIn(c, place[c.id])) place[c.id] = c.semester;
  $("cur-name").textContent = cur.name;
  $("cur-note").textContent = cur.note || "";
  selectedId = hoverId = addingSem = null;
  renderPalette();
  renderBoard();
  update();
}

const sampleYear1 = () => cur.courses.filter(c => c.semester.startsWith("1/")).map(c => c.id);

async function init() {
  const list = await (await fetch("data/index.json", { cache: "no-cache" })).json();
  const sel = $("cur-select");
  sel.innerHTML = list.map(c => `<option value="${c.file}">${c.name}</option>`).join("");
  const pick = file => { loadNotices(list.find(c => c.file === file)?.notices); return loadCurriculum(file); };
  sel.addEventListener("change", () => pick(sel.value));
  $("btn-sample").addEventListener("click", () => { passed = new Set(sampleYear1()); save(); update(); });
  $("btn-reset").addEventListener("click", () => { passed.clear(); extras = []; rebuild(); place = defaultPlace(); choices = {}; grades = {}; selectedId = null; save(); renderBoard(); update(); });
  $("btn-reset-plan").addEventListener("click", () => { place = defaultPlace(); save(); renderBoard(); update(); });
  $("btn-demo-move").addEventListener("click", () => {
    if (!g.courses.has("2110211")) return;
    place = defaultPlace(); passed.delete("2110211"); moveCourse("2110211", "3/1");
  });
  $("btn-shift-all").addEventListener("click", () => shift());
  $("auto-shift").checked = autoShift;
  $("auto-shift").addEventListener("change", e => { autoShift = e.target.checked; store.set("autoShift", autoShift); });
  $("btn-palette").addEventListener("click", e => {
    const box = $("palette"); box.hidden = !box.hidden;
    e.target.setAttribute("aria-expanded", !box.hidden);
  });
  $("btn-palette-reset").addEventListener("click", () => {
    colorOverrides = {}; store.set("colors:" + cur.id, colorOverrides);
    renderPalette(); renderBoard(); update();
  });
  $("board").addEventListener("click", e => {
    if (!e.target.closest(".card, .add-slot") && selectedId) { selectedId = null; applyFocus(); renderInfo(); }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && (selectedId || hoverId)) { selectedId = hoverId = null; applyFocus(); renderInfo(); }
  });
  bindGradeImport();
  $("btn-png").addEventListener("click", () => exportPng().catch(err => say("สร้างรูปไม่สำเร็จ: " + err.message, true)));
  $("btn-pdf").addEventListener("click", printPage);
  window.addEventListener("beforeprint", enterPrint);
  window.addEventListener("afterprint", exitPrint);
  new ResizeObserver(() => cur && drawEdges()).observe($("board"));
  await pick(list[0].file);
}
init().catch(err => { $("cur-name").textContent = "โหลดข้อมูลหลักสูตรไม่สำเร็จ: " + err.message; });
