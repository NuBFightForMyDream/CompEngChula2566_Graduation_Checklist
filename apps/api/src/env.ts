// ตรวจ environment variables ตอนเริ่มระบบ ถ้าขาดจะหยุดทันที แทนที่จะไปพังตอนมี request
import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z.url(),
    PORT: z.coerce.number().int().positive().default(8080),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  })
  .parse(process.env);
