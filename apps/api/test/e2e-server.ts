// เซิร์ฟเวอร์สำหรับ E2E เท่านั้น: เหมือนของจริงทุกอย่าง ยกเว้นหน้า login ของ Google
// อยู่ในโฟลเดอร์ test จึงไม่มีทางถูกใช้ในระบบจริง และไม่ต้องมี flag ลัดการ login ใน src/
//   หน้า /api/__fake_google อ่านชื่อผู้ใช้จาก cookie e2e_user ที่ Playwright ตั้งให้

import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { getCookie } from "hono/cookie";
import { pino } from "pino";
import { createApp } from "../src/app.ts";
import { createDb } from "../src/db/client.ts";
import { env } from "../src/env.ts";
import { fakeOAuth } from "./fakeOAuth.ts";

const { db } = createDb(env.DATABASE_URL, { max: env.DATABASE_MAX_CONNECTIONS, prepare: env.DATABASE_PREPARE });
const app = createApp({
  db,
  logger: pino({ level: env.LOG_LEVEL }),
  oauth: fakeOAuth(`${env.PUBLIC_ORIGIN}/api/__fake_google`),
  publicOrigin: env.PUBLIC_ORIGIN,
  rateLimits: { auth: 100_000, writes: 100_000 },
});

app.get("/api/__fake_google", (c) => {
  const code = getCookie(c, "e2e_user") ?? randomUUID();
  const params = new URLSearchParams({ code, state: c.req.query("state") ?? "" });
  return c.redirect(`/api/auth/google/callback?${params}`);
});

serve({ fetch: app.fetch, port: env.PORT });
