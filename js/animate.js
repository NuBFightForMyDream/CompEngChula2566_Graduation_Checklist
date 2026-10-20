// animate.js — แอนิเมชันตอนการ์ดเปลี่ยนตำแหน่ง ด้วยเทคนิค FLIP
//   First:  จำตำแหน่งการ์ดทุกใบก่อนวาดตารางใหม่
//   Last:   วาดตารางใหม่ การ์ดอยู่ตำแหน่งใหม่แล้ว
//   Invert: เลื่อนการ์ดกลับไปตำแหน่งเดิมด้วย transform
//   Play:   ปล่อยให้เลื่อนกลับมาที่ใหม่อย่างนุ่มนวล (ลูกศรวาดตามทุกเฟรม)
// การ์ดที่เปลี่ยนเทอมจะมีวงแสงกระพริบเบาๆ ให้เห็นว่าไปอยู่ไหน · ปิดเองถ้าเครื่องตั้ง "ลดการเคลื่อนไหว"

const MOVE_MS = 420;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
let droppedId = null;   // การ์ดที่ผู้ใช้ลากไปวางเอง ไม่ต้องเลื่อนจากที่เดิม (เห็นตอนลากอยู่แล้ว)

function cardPositions() {
  const pos = new Map();
  document.querySelectorAll("#board .card").forEach(el =>
    pos.set(el.dataset.id, { rect: el.getBoundingClientRect(), sem: el.closest(".col").dataset.sem }));
  return pos;
}

function playBoardAnimation(before) {
  const skip = droppedId;
  droppedId = null;
  if (!before.size || reduceMotion.matches) return;
  // วัดตำแหน่งใหม่หลัง update() เติมหัวคอลัมน์/ข้อความเสร็จแล้ว (ก่อนเบราว์เซอร์วาดภาพเฟรมถัดไป)
  requestAnimationFrame(() => animateFrom(before, skip));
}

function animateFrom(before, skip) {
  let anyMoved = false;
  document.querySelectorAll("#board .card").forEach(el => {
    const id = el.dataset.id, old = before.get(id);
    if (!old) {   // การ์ดใหม่ (เช่น วิชาเรียนเพิ่ม) ค่อยๆ ปรากฏ
      el.animate([{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" });
      return;
    }
    const now = el.getBoundingClientRect();
    const dx = old.rect.left - now.left, dy = old.rect.top - now.top;
    const changedTerm = old.sem !== el.closest(".col").dataset.sem;
    if (id !== skip && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
      anyMoved = true;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: MOVE_MS, easing: "cubic-bezier(.2, .7, .2, 1)" });
    }
    if (changedTerm) {
      const c = getComputedStyle(el).borderTopColor;
      el.animate([{ boxShadow: `0 0 0 0 ${c}` }, { boxShadow: `0 0 0 6px ${c}`, offset: .35 }, { boxShadow: "0 0 0 0 transparent" }],
        { duration: 900, delay: id === skip ? 0 : MOVE_MS - 120, easing: "ease-out" });
    }
  });
  if (!anyMoved) return;
  const end = performance.now() + MOVE_MS + 30;
  const frame = () => { drawEdges(); if (performance.now() < end) requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
}
