// บันทึก PDF / พิมพ์: หน้าเดียว เนื้อหาแนวนอนหมุนลงกระดาษแนวตั้ง แล้ววาดลูกศรใหม่ให้ตรงกับตำแหน่งการ์ดตอนพิมพ์

import { requestEdgeRedraw } from "../board/useEdges.ts";

/** ความกว้างของเนื้อหาหลังหมุน (= ความสูงของกล่องหน้าใน print.css) */
const PAGE_W = 950;
/** ความสูงของเนื้อหาหลังหมุน (= ความกว้างของกล่องหน้าใน print.css 690px) เผื่อไว้นิดหน่อย */
const PAGE_H = 675;

/**
 * ย่อตารางให้อยู่ในหน้าเดียว และขยายความกว้างก่อนย่อ เพื่อให้ตารางยังเต็มความกว้างกระดาษ
 * ย่อที่ .board-scroll ไม่ใช่ที่ตัว panel เพราะ panel อาจถูกหมุนตอนพิมพ์แนวตั้ง และ zoom จะไปย่อระยะของ transform ด้วย
 */
function fitBoard(el: HTMLElement) {
  const heightAt = (width: number) => {
    el.style.width = `${width}px`;
    // offsetHeight คือความสูงใน layout ไม่โดนการหมุนของหน้า
    return el.offsetHeight;
  };
  let width = PAGE_W;
  let zoom = 1;
  for (let i = 0; i < 4; i++) {
    zoom = Math.min(1, PAGE_H / heightAt(width));
    if (zoom === 1) break;
    width = PAGE_W / zoom;
  }
  zoom = Math.min(1, PAGE_H / heightAt(width), PAGE_W / width);
  el.style.zoom = String(zoom);
}

export function enterPrint() {
  const root = document.documentElement;
  if (root.classList.contains("printing")) return;
  const board = document.getElementById("board");
  if (board) {
    const cols = [...board.querySelectorAll<HTMLElement>(".col")];
    for (const col of cols) {
      col.classList.toggle("empty-col", col.dataset.sem?.charAt(0) === "5" && !col.querySelector(".card"));
    }
    board.style.setProperty("--cols", String(cols.filter((c) => !c.classList.contains("empty-col")).length));
  }
  root.classList.add("printing");
  const scroll = document.querySelector<HTMLElement>('[data-panel="board"] .board-scroll');
  if (scroll) fitBoard(scroll);
  requestEdgeRedraw();
}

export function exitPrint() {
  document.documentElement.classList.remove("printing");
  const scroll = document.querySelector<HTMLElement>('[data-panel="board"] .board-scroll');
  if (scroll) {
    scroll.style.zoom = "";
    scroll.style.width = "";
  }
  requestEdgeRedraw();
}

export function printPage() {
  enterPrint();
  requestAnimationFrame(() => {
    window.print();
    setTimeout(exitPrint, 500);
  });
}
