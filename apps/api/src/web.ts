// เสิร์ฟหน้าเว็บจาก origin เดียวกับ API ทำให้ไม่ต้องตั้ง CORS และ cookie ของ session เป็น first-party

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { CONTENT_SECURITY_POLICY } from "./security.ts";

export function webRoutes(webRoot: string) {
  const app = new Hono();
  const root = relative(process.cwd(), webRoot) || ".";

  // ชื่อไฟล์ใน assets มี hash ของเนื้อหา เก็บ cache ได้นาน
  app.use("/assets/*", async (c, next) => {
    await next();
    if (c.res.ok) c.header("Cache-Control", "public, max-age=31536000, immutable");
  });
  app.use("/assets/*", serveStatic({ root }));
  // ไฟล์ assets ที่หาไม่พบต้องตอบ 404 ไม่ใช่ส่งหน้า HTML กลับไปแทนไฟล์สคริปต์
  app.get("/assets/*", (c) => c.text("Not found", 404));

  app.get("*", async (c, next) => {
    if (c.req.path === "/api" || c.req.path.startsWith("/api/")) return next();
    // index.html ต้องตรวจใหม่ทุกครั้ง ผู้ใช้จึงได้รุ่นล่าสุดทันทีที่ deploy
    c.header("Cache-Control", "no-cache");
    c.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    return c.html(await readFile(join(webRoot, "index.html"), "utf8"));
  });

  return app;
}
