// แอนิเมชันตอนการ์ดเปลี่ยนเทอม ด้วยเทคนิค FLIP
//   First: จำตำแหน่งจากรอบก่อน · Last: React วาดตำแหน่งใหม่แล้ว
//   Invert: ดันการ์ดกลับที่เดิมด้วย transform · Play: ปล่อยให้เลื่อนมาที่ใหม่

import type { PlanState } from "@cp/core";
import { type RefObject, useLayoutEffect, useRef } from "react";
import { requestEdgeRedraw } from "./useEdges.ts";

const MOVE_MS = 420;

interface Pos {
  x: number;
  y: number;
  sem: string;
}

export function useFlip(boardRef: RefObject<HTMLDivElement | null>, place: PlanState["place"], visible: boolean) {
  const last = useRef(new Map<string, Pos>());
  /** การ์ดที่ผู้ใช้ลากเอง ไม่ต้องเลื่อนจากที่เดิม */
  const dropped = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: วัดใหม่เฉพาะตอนตำแหน่งวิชาเปลี่ยนหรือกลับมาที่แท็บนี้
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board || !visible) return;
    const box = board.getBoundingClientRect();
    const before = last.current;
    const now = new Map<string, Pos>();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let moved = false;
    for (const el of board.querySelectorAll<HTMLElement>(".card")) {
      const id = el.dataset.id as string;
      const r = el.getBoundingClientRect();
      const pos: Pos = {
        x: r.left - box.left,
        y: r.top - box.top,
        sem: el.closest<HTMLElement>(".col")?.dataset.sem ?? "",
      };
      now.set(id, pos);
      const old = before.get(id);
      if (reduce || !before.size) continue;
      if (!old) {
        el.animate(
          [
            { opacity: 0, transform: "scale(.92)" },
            { opacity: 1, transform: "none" },
          ],
          {
            duration: 260,
            easing: "ease-out",
          },
        );
        continue;
      }
      const dx = old.x - pos.x;
      const dy = old.y - pos.y;
      if (id !== dropped.current && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
        moved = true;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: MOVE_MS,
          easing: "cubic-bezier(.2, .7, .2, 1)",
        });
      }
    }
    last.current = now;
    dropped.current = null;
    if (!moved) return;
    const end = performance.now() + MOVE_MS + 30;
    const frame = () => {
      requestEdgeRedraw();
      if (performance.now() < end) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [place, visible]);

  return dropped;
}
