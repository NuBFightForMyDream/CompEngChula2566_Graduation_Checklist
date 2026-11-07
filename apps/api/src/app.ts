import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { Logger } from "pino";
import type { Db } from "./db/client.ts";
import { DEFAULT_RATE_LIMITS, type RateLimits } from "./middleware/rateLimit.ts";
import { requireSameOrigin } from "./middleware/sameOrigin.ts";
import type { OAuthProvider } from "./modules/auth/oauth.ts";
import { authRoutes, meRoutes } from "./modules/auth/routes.ts";
import { curriculaRoutes } from "./modules/curricula/routes.ts";
import { planRoutes } from "./modules/plans/routes.ts";
import { webRoutes } from "./web.ts";

const cachePublicResponse: MiddlewareHandler = async (c, next) => {
  await next();
  if (c.req.method === "GET" && c.res.ok) {
    c.header("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
  }
};

export interface AppOptions {
  db: Db;
  logger: Logger;
  oauth?: OAuthProvider | null;
  publicOrigin?: string;
  rateLimits?: Partial<RateLimits>;
  trustedProxyHops?: number;
  /** โฟลเดอร์หน้าเว็บที่ build แล้ว ตอนพัฒนาไม่ต้องใช้เพราะ Vite เสิร์ฟให้ */
  webRoot?: string | undefined;
}

export function createApp({
  db,
  logger,
  oauth = null,
  publicOrigin = "http://localhost:5173",
  rateLimits,
  trustedProxyHops = 0,
  webRoot,
}: AppOptions) {
  const app = new OpenAPIHono();
  const limits = { ...DEFAULT_RATE_LIMITS, ...rateLimits };
  const cookies = { secure: publicOrigin.startsWith("https://") };

  app.use(secureHeaders());
  app.use(requireSameOrigin(publicOrigin));
  // ข้อมูลส่วนตัว ห้าม proxy หรือเบราว์เซอร์เก็บไว้ใช้ซ้ำ
  for (const path of ["/api/me", "/api/me/*", "/api/plans", "/api/plans/*"]) {
    app.use(path, async (c, next) => {
      await next();
      c.header("Cache-Control", "no-store");
    });
  }
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
    // ข้อผิดพลาดที่ตั้งใจ เช่น JSON เสีย เป็นความผิดของ request ไม่ใช่ของระบบ
    if (err instanceof HTTPException && err.status < 500) {
      return c.json({ error: { code: "BAD_REQUEST", message: "รูปแบบ request ไม่ถูกต้อง" } }, err.status);
    }
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

  // ข้อมูลหลักสูตรเป็นข้อมูลสาธารณะและเปลี่ยนไม่บ่อย ให้ CDN ตอบแทนฐานข้อมูลได้ ลดเวลาโหลดหน้าแรกมาก
  app.use("/api/curricula/*", cachePublicResponse);
  app.use("/api/curricula", cachePublicResponse);
  app.route("/api/curricula", curriculaRoutes(db));
  app.route("/api/auth", authRoutes({ db, logger, oauth, cookies, limits, trustedProxyHops }));
  app.route("/api/me", meRoutes({ db, cookies, loginAvailable: !!oauth }));
  app.route("/api/plans", planRoutes({ db, cookies, limits }));

  app.doc31("/api/openapi.json", {
    openapi: "3.1.0",
    info: { title: "CP Graduation Roadmap API", version: "0.1.0" },
  });
  app.get("/api/docs", swaggerUI({ url: "/api/openapi.json" }));

  if (webRoot) app.route("/", webRoutes(webRoot));

  return app;
}
