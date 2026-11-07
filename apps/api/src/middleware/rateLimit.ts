// จำกัดจำนวน request แบบ fixed window เก็บในหน่วยความจำ
// พอสำหรับเซิร์ฟเวอร์ตัวเดียว ถ้ารันหลายตัวต้องย้ายไปเก็บที่ส่วนกลาง เช่น Redis

import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";

export interface RateLimits {
  /** จำนวนครั้งที่เริ่ม login ได้ต่อนาที ต่อ IP */
  auth: number;
  /** จำนวนครั้งที่เขียนข้อมูลได้ต่อนาที ต่อผู้ใช้ */
  writes: number;
}

// หน้าเว็บรอให้หยุดแก้สักครู่ก่อนบันทึก การใช้งานปกติจึงไม่ถึงเพดานนี้
export const DEFAULT_RATE_LIMITS: RateLimits = { auth: 30, writes: 120 };

const WINDOW_MS = 60_000;

export const clientAddress = (c: Context) => {
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    // app.request() ใน test ไม่มี socket จริง
    return "unknown";
  }
};

export function rateLimit(limit: number, keyOf: (c: Context) => string): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return async (c, next) => {
    const now = Date.now();
    // ล้างรายการเก่า หน่วยความจำจะได้ไม่โตเรื่อย ๆ ตามจำนวน IP
    if (hits.size > 10_000) {
      for (const [key, hit] of hits) if (hit.resetAt <= now) hits.delete(key);
    }
    const key = keyOf(c);
    const hit = hits.get(key);
    if (!hit || hit.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return next();
    }
    if (hit.count >= limit) {
      c.header("Retry-After", String(Math.ceil((hit.resetAt - now) / 1000)));
      return c.json({ error: { code: "RATE_LIMITED", message: "ส่งคำขอถี่เกินไป" } }, 429);
    }
    hit.count++;
    return next();
  };
}
