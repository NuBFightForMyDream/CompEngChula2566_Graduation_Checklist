import { accountExportSchema, apiErrorSchema, meSchema } from "@cp/contracts";
import { createRoute, OpenAPIHono, type z } from "@hono/zod-openapi";
import { generateCodeVerifier, generateState } from "arctic";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Logger } from "pino";
import type { Db } from "../../db/client.ts";
import { users } from "../../db/schema.ts";
import { validationHook } from "../../middleware/errors.ts";
import { clientAddress, type RateLimits, rateLimit } from "../../middleware/rateLimit.ts";
import { exportAccount } from "../plans/service.ts";
import type { OAuthProvider } from "./oauth.ts";
import {
  type AuthEnv,
  type CookieOptions,
  clearSessionCookie,
  currentUser,
  endSession,
  requireUser,
  startSession,
} from "./session.ts";

const STATE_COOKIE = "oauth_state";
const VERIFIER_COOKIE = "oauth_verifier";
const FLOW_MAX_AGE_SECONDS = 10 * 60;

interface AuthDeps {
  db: Db;
  logger: Logger;
  oauth: OAuthProvider | null;
  cookies: CookieOptions;
  limits: RateLimits;
}

/** redirect กลับหน้าแรกเสมอ ไม่รับปลายทางจากภายนอก จึงไม่มีช่องโหว่ open redirect */
export function authRoutes({ db, logger, oauth, cookies, limits }: AuthDeps) {
  const app = new Hono();
  const flowCookie = {
    httpOnly: true,
    secure: cookies.secure,
    // Lax เพราะขากลับจาก Google เป็น navigation จากเว็บอื่น Strict จะไม่ส่ง cookie นี้มา
    sameSite: "Lax" as const,
    path: "/api/auth",
    maxAge: FLOW_MAX_AGE_SECONDS,
  };

  app.use("/google", rateLimit(limits.auth, clientAddress));
  app.use("/google/callback", rateLimit(limits.auth, clientAddress));

  app.get("/google", (c) => {
    if (!oauth) return c.redirect("/?login=unavailable");
    const state = generateState();
    const verifier = generateCodeVerifier();
    setCookie(c, STATE_COOKIE, state, flowCookie);
    setCookie(c, VERIFIER_COOKIE, verifier, flowCookie);
    return c.redirect(oauth.createAuthUrl(state, verifier).toString());
  });

  app.get("/google/callback", async (c) => {
    if (!oauth) return c.redirect("/?login=unavailable");
    const expectedState = getCookie(c, STATE_COOKIE);
    const verifier = getCookie(c, VERIFIER_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: flowCookie.path, secure: cookies.secure });
    deleteCookie(c, VERIFIER_COOKIE, { path: flowCookie.path, secure: cookies.secure });

    const { code, state } = c.req.query();
    // state ต้องตรงกับที่เราออกให้เบราว์เซอร์นี้ กันคนอื่นหลอกให้ login เข้าบัญชีของเขา
    if (!code || !state || !verifier || state !== expectedState) return c.redirect("/?login=failed");

    try {
      const profile = await oauth.exchangeCode(code, verifier);
      const [user] = await db
        .insert(users)
        .values({ googleSub: profile.sub, email: profile.email, name: profile.name })
        .onConflictDoUpdate({
          target: users.googleSub,
          set: { email: sql`excluded.email`, name: sql`excluded.name` },
        })
        .returning({ id: users.id });
      await startSession(c, db, (user as { id: string }).id, cookies);
      return c.redirect("/");
    } catch (err) {
      logger.error({ err }, "google login failed");
      return c.redirect("/?login=failed");
    }
  });

  app.post("/logout", async (c) => {
    await endSession(c, db, cookies);
    return c.body(null, 204);
  });

  return app;
}

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

export function meRoutes({ db, cookies, loginAvailable }: { db: Db; cookies: CookieOptions; loginAvailable: boolean }) {
  const app = new OpenAPIHono<AuthEnv>({ defaultHook: validationHook });
  const auth = requireUser(db, cookies);

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Account"],
      summary: "ผู้ใช้ปัจจุบัน",
      responses: { 200: json(meSchema, "ข้อมูลผู้ใช้ หรือ null ถ้ายังไม่ได้เข้าสู่ระบบ") },
    }),
    async (c) => {
      const found = await currentUser(c, db, cookies);
      return c.json({ user: found?.user ?? null, loginAvailable }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/export",
      tags: ["Account"],
      summary: "ดาวน์โหลดข้อมูลทั้งหมดของฉัน",
      middleware: [auth],
      responses: {
        200: json(accountExportSchema, "ข้อมูลบัญชีและแผนทั้งหมด"),
        401: json(apiErrorSchema, "ยังไม่ได้เข้าสู่ระบบ"),
      },
    }),
    async (c) => c.json(await exportAccount(db, c.get("user").id), 200),
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/",
      tags: ["Account"],
      summary: "ลบบัญชีและข้อมูลทั้งหมดถาวร",
      middleware: [auth],
      responses: { 204: { description: "ลบแล้ว" }, 401: json(apiErrorSchema, "ยังไม่ได้เข้าสู่ระบบ") },
    }),
    async (c) => {
      // sessions, plans และ plan_items ถูกลบตามด้วย ON DELETE CASCADE
      await db.delete(users).where(eq(users.id, c.get("user").id));
      clearSessionCookie(c, cookies);
      return c.body(null, 204);
    },
  );

  return app;
}
