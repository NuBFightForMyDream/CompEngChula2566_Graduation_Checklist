// ตรวจ environment variables ตอนเริ่มระบบ ถ้าขาดจะหยุดทันที แทนที่จะไปพังตอนมี request
import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z.url(),
    PORT: z.coerce.number().int().positive().default(8080),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    /** ที่อยู่ที่ผู้ใช้เปิดเว็บ ใช้ตรวจ Origin และสร้าง redirect URI ของ Google */
    PUBLIC_ORIGIN: z.url().default(
      // Vercel บอกโดเมนหลักของโปรเจกต์มาให้ ใช้เป็นค่าเริ่มต้นเมื่อไม่ได้ตั้งเอง
      process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:5173",
    ),
    /** ตั้งให้ต่ำกว่าเพดานของ pooler ฝั่งฐานข้อมูล ถ้าไม่ตั้งจะใช้ค่าตามสภาพแวดล้อม */
    DATABASE_MAX_CONNECTIONS: z.coerce.number().int().positive().optional(),
    /** ตั้งเป็น false เมื่อต่อผ่าน transaction pooler */
    DATABASE_PREPARE: z.stringbool().default(true),
    /** จำนวน proxy ของผู้ให้บริการที่อยู่หน้าเซิร์ฟเวอร์ ใช้หา IP จริงสำหรับ rate limit */
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    /** โฟลเดอร์หน้าเว็บที่ build แล้ว ถ้าตั้งไว้ API จะเสิร์ฟหน้าเว็บด้วย */
    WEB_ROOT: z.string().min(1).optional(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  })
  .refine((e) => !e.GOOGLE_CLIENT_ID === !e.GOOGLE_CLIENT_SECRET, {
    message: "ต้องตั้ง GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET คู่กัน",
  })
  .parse(process.env);
