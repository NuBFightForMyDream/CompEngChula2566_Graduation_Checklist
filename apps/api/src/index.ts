import { serve } from "@hono/node-server";
import { pino } from "pino";
import { createApp } from "./app.ts";
import { createDb } from "./db/client.ts";
import { env } from "./env.ts";
import { googleProvider } from "./modules/auth/oauth.ts";

const logger = pino({ level: env.LOG_LEVEL });
const { db, close } = createDb(env.DATABASE_URL, { max: env.DATABASE_MAX_CONNECTIONS });
const oauth =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? googleProvider({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: `${env.PUBLIC_ORIGIN}/api/auth/google/callback`,
      })
    : null;
if (!oauth) logger.warn("ยังไม่ได้ตั้ง GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET ระบบจะซ่อนปุ่ม login");

const app = createApp({
  db,
  logger,
  oauth,
  publicOrigin: env.PUBLIC_ORIGIN,
  trustedProxyHops: env.TRUSTED_PROXY_HOPS,
  webRoot: env.WEB_ROOT,
});

const server = serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  logger.info(`API พร้อมที่ http://localhost:${port} · เอกสารที่ /api/docs`);
});

// ปิดอย่างเป็นระเบียบ: หยุดรับ request ใหม่ก่อน แล้วค่อยปิดการเชื่อมต่อฐานข้อมูล
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => void close().finally(() => process.exit(0)));
  });
}
