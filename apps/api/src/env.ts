// ตรวจ environment variables ตอนเริ่มระบบ ถ้าขาดจะหยุดทันที แทนที่จะไปพังตอนมี request
import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z.url(),
    PORT: z.coerce.number().int().positive().default(8080),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    /** ที่อยู่ที่ผู้ใช้เปิดเว็บ ใช้ตรวจ Origin และสร้าง redirect URI ของ Google */
    PUBLIC_ORIGIN: z.url().default("http://localhost:5173"),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  })
  .refine((e) => !e.GOOGLE_CLIENT_ID === !e.GOOGLE_CLIENT_SECRET, {
    message: "ต้องตั้ง GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET คู่กัน",
  })
  .parse(process.env);
