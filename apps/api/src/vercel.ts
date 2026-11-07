// จุดเริ่มต้นบน Vercel: แต่ละ instance รับ request ผ่าน handler นี้ และเก็บ connection ไว้ใช้ซ้ำได้ระหว่างคำขอ
// หน้าเว็บเสิร์ฟจาก CDN ของ Vercel จึงไม่ต้องส่ง webRoot

import { getRequestListener } from "@hono/node-server";
import { pino } from "pino";
import { createApp } from "./app.ts";
import { createDb } from "./db/client.ts";
import { env } from "./env.ts";
import { googleProvider } from "./modules/auth/oauth.ts";

const { db } = createDb(env.DATABASE_URL, {
  // หลาย instance ต่อฐานข้อมูลพร้อมกันได้ จึงให้แต่ละตัวถือ connection น้อย ๆ และปล่อยเร็ว
  max: env.DATABASE_MAX_CONNECTIONS ?? 3,
  // transaction pooler ของ Supabase ไม่รองรับ prepared statements
  prepare: false,
  idleTimeoutSeconds: 20,
});

const app = createApp({
  db,
  logger: pino({ level: env.LOG_LEVEL }),
  oauth:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? googleProvider({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          redirectUri: `${env.PUBLIC_ORIGIN}/api/auth/google/callback`,
        })
      : null,
  publicOrigin: env.PUBLIC_ORIGIN,
  // Vercel เขียนทับ X-Forwarded-For เอง ค่าที่ผู้ใช้ส่งมาจึงปลอมไม่ได้
  trustedProxyHops: 1,
});

export default getRequestListener(app.fetch);
