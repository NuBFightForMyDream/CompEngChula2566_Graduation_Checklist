import { serve } from "@hono/node-server";
import { pino } from "pino";
import { createApp } from "./app.ts";
import { createDb } from "./db/client.ts";
import { env } from "./env.ts";

const logger = pino({ level: env.LOG_LEVEL });
const { db, close } = createDb(env.DATABASE_URL);
const app = createApp({ db, logger });

const server = serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  logger.info(`API พร้อมที่ http://localhost:${port} · เอกสารที่ /api/docs`);
});

// ปิดอย่างเป็นระเบียบ: หยุดรับ request ใหม่ก่อน แล้วค่อยปิดการเชื่อมต่อฐานข้อมูล
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => void close().finally(() => process.exit(0)));
  });
}
