// จำกัดจำนวน request แบบ fixed window นับใน Postgres
// คำสั่งเดียวทั้งเพิ่มค่าและอ่านผล จึงนับถูกแม้มีหลาย instance ทำงานพร้อมกัน

import { createHash } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import { lt, sql } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import type { Db } from "../db/client.ts";
import { rateLimitCounters } from "../db/schema.ts";

export interface RateLimits {
  /** จำนวนครั้งที่เริ่ม login ได้ต่อนาที ต่อ IP */
  auth: number;
  /** จำนวนครั้งที่เขียนข้อมูลได้ต่อนาที ต่อผู้ใช้ */
  writes: number;
}

// หน้าเว็บรอให้หยุดแก้สักครู่ก่อนบันทึก การใช้งานปกติจึงไม่ถึงเพดานนี้
export const DEFAULT_RATE_LIMITS: RateLimits = { auth: 30, writes: 120 };

const WINDOW_SECONDS = 60;
// ล้างตัวนับที่หมดอายุเป็นครั้งคราว แทนการตั้ง job แยก
const CLEANUP_CHANCE = 0.01;

/**
 * หา IP ของผู้ใช้สำหรับ rate limit
 * X-Forwarded-For เขียนต่อจากซ้ายไปขวา ผู้ใช้ปลอมค่าด้านซ้ายได้ แต่ปลอมค่าที่ proxy ของเราเติมด้านขวาไม่ได้
 * จึงนับจากขวาตามจำนวน proxy ที่ไว้ใจ ถ้าไม่มี proxy จะใช้ IP ของการเชื่อมต่อและไม่เชื่อ header นี้เลย
 */
export const clientAddress =
  (trustedProxyHops: number) =>
  (c: Context): string => {
    if (trustedProxyHops > 0) {
      const chain = (c.req.header("x-forwarded-for") ?? "")
        .split(",")
        .map((ip) => ip.trim())
        .filter(Boolean);
      const ip = chain[chain.length - trustedProxyHops] ?? chain[0];
      if (ip) return ip;
    }
    try {
      return getConnInfo(c).remote.address ?? "unknown";
    } catch {
      // app.request() ใน test และ serverless ไม่มี socket ให้อ่าน
      return "unknown";
    }
  };

export function rateLimit(db: Db, scope: string, limit: number, keyOf: (c: Context) => string): MiddlewareHandler {
  return async (c, next) => {
    const key = createHash("sha256")
      .update(`${scope}:${keyOf(c)}`)
      .digest("hex");
    const [row] = await db
      .insert(rateLimitCounters)
      .values({ key, count: 1, resetAt: sql`now() + make_interval(secs => ${WINDOW_SECONDS})` })
      .onConflictDoUpdate({
        target: rateLimitCounters.key,
        set: {
          count: sql`CASE WHEN ${rateLimitCounters.resetAt} <= now() THEN 1 ELSE ${rateLimitCounters.count} + 1 END`,
          resetAt: sql`CASE WHEN ${rateLimitCounters.resetAt} <= now() THEN now() + make_interval(secs => ${WINDOW_SECONDS}) ELSE ${rateLimitCounters.resetAt} END`,
        },
      })
      .returning({ count: rateLimitCounters.count, resetAt: rateLimitCounters.resetAt });

    if (Math.random() < CLEANUP_CHANCE) {
      await db.delete(rateLimitCounters).where(lt(rateLimitCounters.resetAt, new Date()));
    }

    if ((row?.count ?? 0) > limit) {
      const wait = Math.max(1, Math.ceil(((row?.resetAt.getTime() ?? 0) - Date.now()) / 1000));
      c.header("Retry-After", String(wait));
      return c.json({ error: { code: "RATE_LIMITED", message: "ส่งคำขอถี่เกินไป" } }, 429);
    }
    return next();
  };
}
