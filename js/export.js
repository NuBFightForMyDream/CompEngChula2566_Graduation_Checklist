// export.js — บันทึกรูป PNG (วาดตารางลง canvas) และบันทึก PDF (จัดหน้าสำหรับพิมพ์ A4 แนวนอน)

// ---------- บันทึกรูป PNG: วาดตาราง roadmap ลง canvas จากตำแหน่งจริงบนหน้าจอ ----------
async function exportPng() {
  const keep = selectedId;
  selectedId = hoverId = null; applyFocus();
  await document.fonts.ready;
  const board = $("board"), box = board.getBoundingClientRect();
  const css = getComputedStyle(document.documentElement), tok = n => css.getPropertyValue(n).trim();
  const scale = 2, pad = 24, headH = 64, W = box.width, H = box.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((W + pad * 2) * scale);
  canvas.height = Math.ceil((H + pad * 2 + headH) * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  const rel = el => { const r = el.getBoundingClientRect(); return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height }; };
  const roundRect = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

  // หัวรูป
  ctx.fillStyle = tok("--bg"); ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = tok("--fg"); ctx.font = `700 22px ${tok("--font-display")}`; ctx.textBaseline = "top";
  ctx.fillText(`Graduation Roadmap · ${cur.name}`, pad, pad);
  ctx.fillStyle = tok("--muted"); ctx.font = `400 13px ${tok("--font-body")}`;
  ctx.fillText(`ผ่านแล้ว ${$("total-got").textContent}/${cur.totalCredits} หน่วยกิต · ${$("total-note").textContent} · บันทึกเมื่อ ${new Date().toLocaleDateString("th-TH")}`, pad, pad + 32);
  ctx.translate(pad, pad + headH);

  // พื้นตาราง + คอลัมน์
  ctx.fillStyle = tok("--surface"); roundRect(0, 0, W, H, 12); ctx.fill();
  ctx.save(); roundRect(0, 0, W, H, 12); ctx.clip();
  for (const col of board.querySelectorAll(".col")) {
    const r = rel(col);
    if (col.classList.contains("odd-year")) { ctx.fillStyle = tok("--year-band"); ctx.fillRect(r.x, r.y, r.w, r.h); }
    drawText(ctx, col.querySelector(".col-head b"), rel, 1);
    drawText(ctx, col.querySelector(".col-head span"), rel, 1);
  }
  ctx.restore();

  // ลูกศร prereq (ใช้ path เดียวกับ SVG บนหน้าจอ)
  for (const e of board.querySelectorAll("path.edge")) {
    const bad = e.classList.contains("bad");
    ctx.strokeStyle = bad ? tok("--bad") : tok("--muted");
    ctx.globalAlpha = bad ? 1 : .55; ctx.lineWidth = bad ? 2.4 : 1.6; ctx.setLineDash(bad ? [6, 4] : []);
    const d = e.getAttribute("d");
    ctx.stroke(new Path2D(d));
    const n = d.match(/-?[\d.]+/g).map(Number), [cx, cy, x, y] = n.slice(-4), a = Math.atan2(y - cy, x - cx);
    ctx.setLineDash([]); ctx.fillStyle = ctx.strokeStyle; ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - 8 * Math.cos(a - .45), y - 8 * Math.sin(a - .45)); ctx.lineTo(x - 8 * Math.cos(a + .45), y - 8 * Math.sin(a + .45)); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.setLineDash([]);

  // การ์ดวิชา
  for (const card of board.querySelectorAll(".card")) {
    const r = rel(card), cs = getComputedStyle(card);
    const locked = card.classList.contains("locked"), passedCard = card.classList.contains("passed");
    roundRect(r.x, r.y, r.w, r.h, 8);
    ctx.fillStyle = cs.backgroundColor; ctx.fill();
    ctx.strokeStyle = cs.borderTopColor; ctx.lineWidth = 2;
    ctx.setLineDash(cs.borderTopStyle === "dashed" ? [5, 3] : cs.borderTopStyle === "dotted" ? [2, 2] : []);
    roundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 7); ctx.stroke(); ctx.setLineDash([]);
    if (card.classList.contains("conflict")) { ctx.strokeStyle = tok("--bad"); ctx.lineWidth = 3; roundRect(r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5, 10); ctx.stroke(); }
    const alpha = locked ? .5 : 1;
    for (const el of card.querySelectorAll(".slot-tag, .nm, .cd > span")) drawText(ctx, el, rel, alpha * (el.classList.contains("slot-tag") ? .75 : 1));
    // วงกลม / เครื่องหมายถูก
    const t = rel(card.querySelector(".tick")), cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    ctx.globalAlpha = passedCard ? 1 : .45; ctx.strokeStyle = ctx.fillStyle = cs.color;
    const grade = card.querySelector(".tick").dataset.grade;
    if (grade) {
      ctx.globalAlpha = 1; ctx.fillStyle = PASSING.has(grade) ? cs.color : tok("--bad");
      ctx.font = `700 12px ${tok("--font-mono")}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(grade, cx, cy); ctx.textAlign = "left"; ctx.textBaseline = "top";
    }
    else if (passedCard) { ctx.font = `700 14px ${tok("--font-body")}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("✓", cx, cy); ctx.textAlign = "left"; ctx.textBaseline = "top"; }
    else if (!locked) { ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
  download(blob, `roadmap-${cur.id}.png`);
  selectedId = keep; applyFocus();
  say("บันทึกรูปแล้ว ถ้าไฟล์ไม่ดาวน์โหลด ให้เปิดหน้าเว็บจาก GitHub Pages หรือจากไฟล์ในเครื่อง");
}

// วาดข้อความของ element ลง canvas: ตัดบรรทัดตามความกว้างจริง ใช้ฟอนต์และสีจาก CSS
function drawText(ctx, el, rel, alpha) {
  if (!el || !el.textContent.trim()) return;
  const cs = getComputedStyle(el), r = rel(el);
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.fillStyle = cs.color; ctx.globalAlpha = alpha; ctx.textBaseline = "top";
  if ("letterSpacing" in ctx) ctx.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
  const lines = [];
  let line = "";
  for (const w of el.textContent.trim().split(/\s+/)) {
    const test = line ? line + " " + w : w;
    if (line && ctx.measureText(test).width > r.w + 1) { lines.push(line); line = w; } else line = test;
  }
  lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, r.x, r.y + i * lh + (lh - parseFloat(cs.fontSize)) / 2));
  ctx.globalAlpha = 1;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- บันทึก PDF: สั่งพิมพ์แล้วเลือก "Save as PDF" (ตัวหนังสือคมชัด เลือก/ค้นข้อความได้) ----------
// ก่อนพิมพ์ จัดหน้าให้กว้างเท่ากระดาษ A4 แนวนอน แล้ววาดลูกศรใหม่ให้ตรงกับตำแหน่งการ์ดตอนพิมพ์
function enterPrint() {
  const root = document.documentElement;
  if (root.classList.contains("printing")) return;
  selectedId = hoverId = null; applyFocus();
  const cols = [...$("board").querySelectorAll(".col")];
  for (const col of cols) col.classList.toggle("empty-col", col.dataset.sem[0] === "5" && !col.querySelector(".card"));
  $("board").style.setProperty("--cols", cols.filter(c => !c.classList.contains("empty-col")).length);
  $("notices").open = true;
  root.classList.add("printing");
  drawEdges();
}

function exitPrint() {
  document.documentElement.classList.remove("printing");
  drawEdges();
}

function printPage() {
  enterPrint();
  requestAnimationFrame(() => { window.print(); setTimeout(exitPrint, 500); });
}
