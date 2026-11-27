// บันทึกรูป PNG: วาดตาราง roadmap ลง canvas จากตำแหน่งจริงบนหน้าจอ

import { type Grade, PASSING } from "@cp/core";
import { download } from "./download.ts";

export interface Header {
  title: string;
  subtitle: string;
}

export type Rel = (el: Element) => { x: number; y: number; w: number; h: number };

/** วาดข้อความของ element ตัดบรรทัดตามความกว้างจริง ใช้ฟอนต์และสีจาก CSS */
export function drawText(ctx: CanvasRenderingContext2D, el: Element | null, rel: Rel, alpha: number) {
  if (!el?.textContent?.trim()) return;
  const cs = getComputedStyle(el);
  const r = rel(el);
  const lh = Number.parseFloat(cs.lineHeight) || Number.parseFloat(cs.fontSize) * 1.3;
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.fillStyle = cs.color;
  ctx.globalAlpha = alpha;
  ctx.textBaseline = "top";
  const lines: string[] = [];
  let line = "";
  for (const word of el.textContent.trim().split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > r.w + 1) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  lines.push(line);
  lines.forEach((l, i) => {
    ctx.fillText(l, r.x, r.y + i * lh + (lh - Number.parseFloat(cs.fontSize)) / 2);
  });
  ctx.globalAlpha = 1;
}

export async function exportPng({ fileName, ...header }: Header & { fileName: string }) {
  const canvas = await renderBoard(header);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("เบราว์เซอร์สร้างไฟล์ไม่สำเร็จ");
  download(blob, fileName);
}

/** วาดหัวเรื่องและตาราง รวมแถว GenEd ลง canvas ขนาด 2 เท่าของหน้าจอ */
export async function renderBoard({ title, subtitle }: Header) {
  await document.fonts.ready;
  const board = document.getElementById("board") as HTMLElement;
  const box = board.getBoundingClientRect();
  const css = getComputedStyle(document.documentElement);
  const tok = (n: string) => css.getPropertyValue(n).trim();
  const scale = 2;
  const pad = 24;
  const headH = 64;
  const W = box.width;
  const H = box.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((W + pad * 2) * scale);
  canvas.height = Math.ceil((H + pad * 2 + headH) * scale);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.scale(scale, scale);
  const rel: Rel = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
  };
  const round = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };

  ctx.fillStyle = tok("--bg");
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = tok("--fg");
  ctx.font = `700 22px ${tok("--font-display")}`;
  ctx.textBaseline = "top";
  ctx.fillText(title, pad, pad);
  ctx.fillStyle = tok("--muted");
  ctx.font = `400 13px ${tok("--font-body")}`;
  ctx.fillText(subtitle, pad, pad + 32);
  ctx.translate(pad, pad + headH);

  ctx.fillStyle = tok("--surface");
  round(0, 0, W, H, 12);
  ctx.fill();
  ctx.save();
  round(0, 0, W, H, 12);
  ctx.clip();
  for (const col of board.querySelectorAll(".col")) {
    const r = rel(col);
    if (col.classList.contains("odd-year")) {
      ctx.fillStyle = tok("--year-band");
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    drawText(ctx, col.querySelector(".col-head b"), rel, 1);
    drawText(ctx, col.querySelector(".col-head span"), rel, 1);
  }
  const strip = board.querySelector(".gened-strip");
  if (strip) {
    const r = rel(strip);
    ctx.fillStyle = tok("--line");
    ctx.fillRect(r.x, r.y, r.w, 1);
    for (const el of strip.querySelectorAll(".gened-head b, .gened-head .gened-count")) drawText(ctx, el, rel, 1);
  }
  ctx.restore();

  for (const e of board.querySelectorAll("path.edge")) {
    const bad = e.classList.contains("bad");
    ctx.strokeStyle = bad ? tok("--bad") : tok("--muted");
    ctx.globalAlpha = bad ? 1 : 0.55;
    ctx.lineWidth = bad ? 2.4 : 1.6;
    ctx.setLineDash(bad ? [6, 4] : []);
    const d = e.getAttribute("d") as string;
    ctx.stroke(new Path2D(d));
    const [cx, cy, x, y] = (d.match(/-?[\d.]+/g) as string[]).map(Number).slice(-4) as [number, number, number, number];
    const a = Math.atan2(y - cy, x - cx);
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 8 * Math.cos(a - 0.45), y - 8 * Math.sin(a - 0.45));
    ctx.lineTo(x - 8 * Math.cos(a + 0.45), y - 8 * Math.sin(a + 0.45));
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  for (const card of board.querySelectorAll(".card")) {
    const r = rel(card);
    const cs = getComputedStyle(card);
    const locked = card.classList.contains("locked");
    const passed = card.classList.contains("passed");
    round(r.x, r.y, r.w, r.h, 8);
    ctx.fillStyle = cs.backgroundColor;
    ctx.fill();
    ctx.strokeStyle = cs.borderTopColor;
    ctx.lineWidth = 2;
    ctx.setLineDash(cs.borderTopStyle === "dashed" ? [5, 3] : cs.borderTopStyle === "dotted" ? [2, 2] : []);
    round(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    if (card.classList.contains("conflict")) {
      ctx.strokeStyle = tok("--bad");
      ctx.lineWidth = 3;
      round(r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5, 10);
      ctx.stroke();
    }
    const alpha = locked ? 0.5 : 1;
    for (const el of card.querySelectorAll(".slot-tag, .nm, .cd > span")) {
      drawText(ctx, el, rel, alpha * (el.classList.contains("slot-tag") ? 0.75 : 1));
    }
    const tick = card.querySelector<HTMLElement>(".tick") as HTMLElement;
    const t = rel(tick);
    const cx = t.x + t.w / 2;
    const cy = t.y + t.h / 2;
    ctx.globalAlpha = passed ? 1 : 0.45;
    ctx.strokeStyle = cs.color;
    ctx.fillStyle = cs.color;
    const centered = (text: string, font: string) => {
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cx, cy);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
    };
    const grade = tick.dataset.grade as Grade | undefined;
    if (grade) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = PASSING.has(grade) ? cs.color : tok("--bad");
      centered(grade, `700 12px ${tok("--font-mono")}`);
    } else if (passed) {
      centered("✓", `700 14px ${tok("--font-body")}`);
    } else if (!locked) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  return canvas;
}
