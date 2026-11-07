import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import { secureHeaders } from "hono/secure-headers";
import type { Logger } from "pino";
import type { Db } from "./db/client.ts";
import { curriculaRoutes } from "./modules/curricula/routes.ts";

export function createApp({ db, logger }: { db: Db; logger: Logger }) {
  const app = new OpenAPIHono();

  app.use(secureHeaders());
  app.use(async (c, next) => {
    const start = performance.now();
    await next();
    logger.info({
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - start),
    });
  });

  app.onError((err, c) => {
    // รายละเอียดอยู่ใน log เท่านั้น ไม่ส่งให้ผู้ใช้ เพราะอาจมี SQL หรือโครงสร้างภายใน
    logger.error({ err, path: c.req.path }, "unhandled error");
    return c.json({ error: { code: "INTERNAL", message: "ระบบขัดข้อง" } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "ไม่พบ endpoint นี้" } }, 404));

  app.get("/api/health", async (c) => {
    try {
      await db.execute(sql`SELECT 1`);
      return c.json({ status: "ok" });
    } catch (err) {
      logger.error({ err }, "health check failed");
      return c.json({ status: "unavailable" }, 503);
    }
  });

  app.route("/api/curricula", curriculaRoutes(db));

  app.doc31("/api/openapi.json", {
    openapi: "3.1.0",
    info: { title: "CP Graduation Roadmap API", version: "0.1.0" },
  });
  app.get("/api/docs", swaggerUI({ url: "/api/openapi.json" }));

  return app;
}
