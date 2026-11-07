// session เก็บในฐานข้อมูล จึงยกเลิกได้ทันทีตอน logout ต่างจาก JWT ที่ต้องรอให้หมดอายุเอง

import { createHash, randomBytes } from "node:crypto";
import type { User } from "@cp/contracts";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Db } from "../../db/client.ts";
import { sessions, users } from "../../db/schema.ts";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_BELOW_MS = 15 * 24 * 60 * 60 * 1000;

export interface CookieOptions {
  secure: boolean;
}

export type AuthEnv = { Variables: { user: User; tokenHash: string } };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// ชื่อ __Host- บังคับให้เบราว์เซอร์รับเฉพาะ HTTPS และโดเมนนี้เท่านั้น แต่ใช้กับ http://localhost ไม่ได้
const cookieName = ({ secure }: CookieOptions) => (secure ? "__Host-session" : "session");

const sessionCookie = (opts: CookieOptions, maxAgeMs: number) => ({
  httpOnly: true,
  secure: opts.secure,
  sameSite: "Lax" as const,
  path: "/",
  maxAge: Math.floor(maxAgeMs / 1000),
});

export async function startSession(c: Context, db: Db, userId: string, opts: CookieOptions) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_MS),
  });
  // เก็บกวาด session ที่หมดอายุแล้วไปพร้อมกัน
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  setCookie(c, cookieName(opts), token, sessionCookie(opts, SESSION_MS));
}

export async function endSession(c: Context, db: Db, opts: CookieOptions) {
  const token = getCookie(c, cookieName(opts));
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  clearSessionCookie(c, opts);
}

export const clearSessionCookie = (c: Context, opts: CookieOptions) =>
  deleteCookie(c, cookieName(opts), { path: "/", secure: opts.secure, httpOnly: true, sameSite: "Lax" });

/** อ่านผู้ใช้จาก cookie คืน null ถ้าไม่ได้ login หรือ session หมดอายุ และต่ออายุเมื่อใกล้หมด */
export async function currentUser(c: Context, db: Db, opts: CookieOptions) {
  const token = getCookie(c, cookieName(opts));
  if (!token) return null;
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  if (row.expiresAt.getTime() - Date.now() < RENEW_BELOW_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_MS) })
      .where(eq(sessions.tokenHash, tokenHash));
    setCookie(c, cookieName(opts), token, sessionCookie(opts, SESSION_MS));
  }
  const { expiresAt: _expiresAt, ...user } = row;
  return { user, tokenHash };
}

export const requireUser =
  (db: Db, opts: CookieOptions): MiddlewareHandler<AuthEnv> =>
  async (c, next) => {
    const found = await currentUser(c, db, opts);
    if (!found) return c.json({ error: { code: "UNAUTHENTICATED", message: "กรุณาเข้าสู่ระบบ" } }, 401);
    c.set("user", found.user);
    c.set("tokenHash", found.tokenHash);
    return next();
  };
