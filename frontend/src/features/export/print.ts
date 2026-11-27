// พิมพ์จากเบราว์เซอร์ (Ctrl/Cmd+P): จัดหน้าเป็น A4 แนวนอน 2 หน้าก่อนพิมพ์ แล้ววาดลูกศรใหม่ให้ตรงกับตำแหน่งการ์ดตอนพิมพ์

import { requestEdgeRedraw } from "../board/useEdges.ts";

/** ความกว้างของเนื้อหาตอนพิมพ์ ตรงกับ .wrap ใน print.css */
const PAGE_W = 1060;
/** ความสูงที่ใช้ได้ใน A4 แนวนอนหลังหักขอบ 8mm (ประมาณ 733px) เผื่อไว้นิดหน่อย */
const PAGE_H = 715;

let catsWasOpen: boolean | null = null;

/** ย่อตารางให้อยู่ในหน้าเดียว และขยายความกว้างก่อนย่อ เพื่อให้ตารางยังเต็มความกว้างกระดาษ */
function fitBoard(panel: HTMLElement) {
  const heightAt = (width: number) => {
    panel.style.width = `${width}px`;
    return panel.getBoundingClientRect().height;
  };
  let width = PAGE_W;
  let zoom = 1;
  for (let i = 0; i < 4; i++) {
    zoom = Math.min(1, PAGE_H / heightAt(width));
    if (zoom === 1) break;
    width = PAGE_W / zoom;
  }
  zoom = Math.min(1, PAGE_H / heightAt(width), PAGE_W / width);
  panel.style.zoom = String(zoom);
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
  // หน้าแรกต้องเห็นทุกหมวด แม้บนมือถือจะยุบไว้
  const cats = document.querySelector<HTMLDetailsElement>(".cats-box");
  if (cats) {
    catsWasOpen = cats.open;
    cats.open = true;
  }
  root.classList.add("printing");
  const panel = document.querySelector<HTMLElement>('[data-panel="board"]');
  if (panel) fitBoard(panel);
  requestEdgeRedraw();
}

export function exitPrint() {
  document.documentElement.classList.remove("printing");
  const panel = document.querySelector<HTMLElement>('[data-panel="board"]');
  if (panel) {
    panel.style.zoom = "";
    panel.style.width = "";
  }
  const cats = document.querySelector<HTMLDetailsElement>(".cats-box");
  if (cats && catsWasOpen !== null) cats.open = catsWasOpen;
  catsWasOpen = null;
  requestEdgeRedraw();
}
