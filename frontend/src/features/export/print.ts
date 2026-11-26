// บันทึก PDF: จัดหน้าเป็น A4 แนวนอนก่อนพิมพ์ แล้ววาดลูกศรใหม่ให้ตรงกับตำแหน่งการ์ดตอนพิมพ์

import { requestEdgeRedraw } from "../board/useEdges.ts";

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
  requestEdgeRedraw();
}

export function exitPrint() {
  document.documentElement.classList.remove("printing");
  requestEdgeRedraw();
}

export function printPage() {
  enterPrint();
  requestAnimationFrame(() => {
    window.print();
    setTimeout(exitPrint, 500);
  });
}
