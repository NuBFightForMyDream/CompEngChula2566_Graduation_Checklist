// วาดลูกศร prereq ลง SVG โดยตรงจากตำแหน่งจริงของการ์ด
// ไม่ผ่าน React state เพราะต้องวาดใหม่ทุกเฟรมระหว่างการ์ดเคลื่อนไหว

import type { PlanModel } from "@cp/core";
import { type RefObject, useCallback, useEffect, useLayoutEffect } from "react";

export const REDRAW_EVENT = "cp:redraw-edges";
export const requestEdgeRedraw = () => window.dispatchEvent(new Event(REDRAW_EVENT));

const MARKER = `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>`;

export function useEdges(
  boardRef: RefObject<HTMLDivElement | null>,
  svgRef: RefObject<SVGSVGElement | null>,
  m: PlanModel,
  chain: Set<string> | null,
  showAll: boolean,
  visible: boolean,
) {
  const draw = useCallback(() => {
    const board = boardRef.current;
    const svg = svgRef.current;
    if (!board || !svg || !visible) return;
    const box = board.getBoundingClientRect();
    // ตอนพิมพ์ตารางถูกย่อด้วย CSS zoom ตำแหน่งจากเบราว์เซอร์จึงต้องหารกลับ เพราะ SVG ข้างในก็ถูกย่อด้วย
    const zoom = board.currentCSSZoom || 1;
    const rect = (id: string) => {
      const r = board.querySelector(`.card[data-id="${CSS.escape(id)}"]`)?.getBoundingClientRect();
      return r && new DOMRect(r.x / zoom, r.y / zoom, r.width / zoom, r.height / zoom);
    };
    const bad = new Set(m.conflicts.map(([p, c]) => `${p}>${c}`));
    let out = MARKER;
    for (const c of m.courses) {
      for (const p of c.prereq) {
        const isBad = bad.has(`${p}>${c.id}`);
        const on = !!chain && chain.has(p) && chain.has(c.id);
        if (!showAll && !isBad && !on) continue;
        const a = rect(p);
        const b = rect(c.id);
        if (!a || !b) continue;
        const left = box.left / zoom;
        const top = box.top / zoom;
        let x1 = a.right - left;
        const y1 = a.top + a.height / 2 - top;
        let x2 = b.left - left - 2;
        const y2 = b.top + b.height / 2 - top;
        if (x2 < x1) {
          // ลูกศรย้อนกลับเมื่อลำดับเทอมผิด
          x1 = a.left - left;
          x2 = b.right - left + 2;
        }
        const dx = Math.max(30, Math.abs(x2 - x1) / 2) * Math.sign(x2 - x1 || 1);
        const cls = `edge${isBad ? " bad" : ""}${on ? " on" : ""}`;
        out += `<path class="${cls}" marker-end="url(#arr)" d="M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}"/>`;
      }
    }
    svg.innerHTML = out;
  }, [boardRef, svgRef, m, chain, showAll, visible]);

  useLayoutEffect(draw);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const observer = new ResizeObserver(draw);
    observer.observe(board);
    window.addEventListener(REDRAW_EVENT, draw);
    return () => {
      observer.disconnect();
      window.removeEventListener(REDRAW_EVENT, draw);
    };
  }, [boardRef, draw]);
}
