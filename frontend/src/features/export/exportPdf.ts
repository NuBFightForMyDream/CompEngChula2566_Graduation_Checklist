// บันทึก PDF แนวนอน 2 หน้า โดยสร้างไฟล์เองในเบราว์เซอร์ ไม่ผ่านหน้าต่างพิมพ์
// เพราะบางเบราว์เซอร์ (เช่น Dia, Safari) ไม่สนขนาดหน้าใน CSS และพิมพ์เป็นแนวตั้ง
//   หน้า 1: สรุปหน่วยกิตและความคืบหน้าแต่ละหมวด
//   หน้า 2: ตารางเรียนและแถว GenEd

import { download } from "./download.ts";
import { type Header, type Rel, renderBoard } from "./exportPng.ts";

const SCALE = 2;
const PAD = 24;
const HEAD_H = 64;

const tok = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const visibleColor = (c: string) => c && c !== "transparent" && !/rgba\(.*,\s*0\)$/.test(c);

function drawHeader(ctx: CanvasRenderingContext2D, { title, subtitle }: Header) {
  ctx.fillStyle = tok("--fg");
  ctx.font = `700 22px ${tok("--font-display")}`;
  ctx.textBaseline = "top";
  ctx.fillText(title, PAD, PAD);
  ctx.fillStyle = tok("--muted");
  ctx.font = `400 13px ${tok("--font-body")}`;
  ctx.fillText(subtitle, PAD, PAD + 32);
}

/** พื้นหลังแบบ linear-gradient ของแถบหมวดที่มีหลายกลุ่ม แปลงเป็น gradient ของ canvas */
function gradientFill(ctx: CanvasRenderingContext2D, image: string, x: number, w: number) {
  const stops = [...image.matchAll(/(rgba?\([^)]*\))\s+([\d.]+)%(?:\s+([\d.]+)%)?/g)];
  if (!stops.length) return null;
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  for (const [, color, a, b] of stops) {
    g.addColorStop(Number(a) / 100, color as string);
    if (b !== undefined) g.addColorStop(Number(b) / 100, color as string);
  }
  return g;
}

/** วาดกล่อง แถบ และข้อความทุกชิ้นใน root ลง canvas ตามตำแหน่งจริงบนหน้าจอ */
function paintDom(ctx: CanvasRenderingContext2D, root: HTMLElement, rel: Rel) {
  for (const el of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = rel(el);
    if (!r.w || !r.h) continue;
    const radius = Math.min(Number.parseFloat(cs.borderTopLeftRadius) || 0, r.h / 2, r.w / 2);
    const fill = cs.backgroundImage.includes("gradient")
      ? gradientFill(ctx, cs.backgroundImage, r.x, r.w)
      : visibleColor(cs.backgroundColor)
        ? cs.backgroundColor
        : null;
    if (fill) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, radius);
      ctx.fill();
    }
    const bw = Number.parseFloat(cs.borderTopWidth) || 0;
    if (bw && visibleColor(cs.borderTopColor) && cs.borderTopStyle !== "none") {
      ctx.strokeStyle = cs.borderTopColor;
      ctx.lineWidth = bw;
      ctx.beginPath();
      ctx.roundRect(r.x + bw / 2, r.y + bw / 2, r.w - bw, r.h - bw, radius);
      ctx.stroke();
    }
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) drawTextNode(ctx, node as Text, cs, rel);
    }
  }
}

/** วาดข้อความทีละคำ ตามตำแหน่งที่เบราว์เซอร์จัดไว้ คำที่ถูกตัดขึ้นบรรทัดใหม่จะวาดทีละตัวอักษร */
function drawTextNode(ctx: CanvasRenderingContext2D, node: Text, cs: CSSStyleDeclaration, rel: Rel) {
  const text = node.textContent as string;
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.fillStyle = cs.color;
  ctx.textBaseline = "middle";
  const range = document.createRange();
  const put = (start: number, end: number) => {
    range.setStart(node, start);
    range.setEnd(node, end);
    const rects = range.getClientRects();
    if (rects.length > 1 && end - start > 1) {
      for (let i = start; i < end; i++) put(i, i + 1);
      return;
    }
    const box = rects[0];
    if (!box) return;
    const r = rel({ getBoundingClientRect: () => box } as Element);
    ctx.fillText(text.slice(start, end), r.x, r.y + r.h / 2);
  };
  for (const m of text.matchAll(/\S+/g)) put(m.index, m.index + m[0].length);
}

/** หน้าสรุป: ส่วนบนของหน้าเว็บ (การ์ดสรุปและความคืบหน้าแต่ละหมวด) */
function renderSummary(header: Header) {
  const overview = document.querySelector<HTMLElement>(".overview") as HTMLElement;
  const cats = overview.querySelector<HTMLDetailsElement>(".cats-box");
  const wasOpen = cats?.open;
  if (cats) cats.open = true;
  try {
    const box = overview.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil((box.width + PAD * 2) * SCALE);
    canvas.height = Math.ceil((box.height + PAD * 2 + HEAD_H) * SCALE);
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = tok("--bg");
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawHeader(ctx, header);
    ctx.translate(PAD, PAD + HEAD_H);
    paintDom(ctx, overview, (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
    });
    return canvas;
  } finally {
    if (cats && wasOpen !== undefined) cats.open = wasOpen;
  }
}

async function jpegOf(canvas: HTMLCanvasElement) {
  // พื้นหลังของ canvas โปร่งใส JPEG จะกลายเป็นสีดำ จึงรองพื้นด้วยสีหน้าเว็บก่อน
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = tok("--bg") || "#fff";
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  const blob = await new Promise<Blob | null>((res) => flat.toBlob(res, "image/jpeg", 0.92));
  if (!blob) throw new Error("เบราว์เซอร์สร้างไฟล์ไม่สำเร็จ");
  // สีมุมซ้ายบนคือสีพื้นหลัง ใช้ถมทั้งหน้า PDF ให้กลืนกับรูป
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  const bg = [r, g, b].map((v) => ((v ?? 255) / 255).toFixed(3)).join(" ");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: flat.width, h: flat.height, bg };
}

/** A4 แนวนอน หน่วยเป็น point (1/72 นิ้ว) */
const PAGE = { w: 842, h: 595, margin: 20 };

/** PDF ขั้นต่ำ: แต่ละหน้ามีรูป JPEG หนึ่งรูป ย่อให้พอดีหน้าและชิดด้านบน ถมพื้นหน้าด้วยสีพื้นของรูป */
export function buildPdf(images: { bytes: Uint8Array; w: number; h: number; bg?: string }[]) {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === "string" ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string | Uint8Array[]) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    if (typeof body === "string") push(body);
    else for (const b of body) push(b);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const pageIds = images.map((_, i) => 3 + i * 3);
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${images.length} >>`);
  images.forEach((img, i) => {
    const [pageId, contentId, imageId] = [3 + i * 3, 4 + i * 3, 5 + i * 3];
    const fit = Math.min((PAGE.w - PAGE.margin * 2) / img.w, (PAGE.h - PAGE.margin * 2) / img.h);
    const w = img.w * fit;
    const h = img.h * fit;
    const x = (PAGE.w - w) / 2;
    const y = PAGE.h - PAGE.margin - h;
    const page = img.bg ? `${img.bg} rg 0 0 ${PAGE.w} ${PAGE.h} re f ` : "";
    const draw = `${page}q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im Do Q`;
    object(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /XObject << /Im ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    object(contentId, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    object(imageId, [
      enc.encode(
        `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`,
      ),
      img.bytes,
      enc.encode("\nendstream"),
    ]);
  });
  const count = 3 + images.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

export async function exportPdf({ fileName, ...header }: Header & { fileName: string }) {
  await document.fonts.ready;
  const pages = [renderSummary(header), await renderBoard(header)];
  const images = await Promise.all(pages.map(jpegOf));
  download(buildPdf(images), fileName);
}
