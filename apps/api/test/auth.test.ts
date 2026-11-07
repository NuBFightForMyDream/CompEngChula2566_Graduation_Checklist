import { meSchema } from "@cp/contracts";
import { eq, sql } from "drizzle-orm";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { plans, sessions, users } from "../src/db/schema.ts";
import { seedCurricula } from "../src/db/seed.ts";
import { googleProvider } from "../src/modules/auth/oauth.ts";
import { Browser, jsonOf } from "./client.ts";
import { fakeOAuth } from "./fakeOAuth.ts";
import { createTestDb } from "./helpers.ts";

let handle: Awaited<ReturnType<typeof createTestDb>>;
let app: ReturnType<typeof createApp>;
const logger = pino({ level: "silent" });
const me = async (b: Browser) => meSchema.parse(await (await b.request("/api/me")).json());

beforeAll(async () => {
  handle = await createTestDb();
  await seedCurricula(handle.db);
  // เพดานจริงมี test แยกด้านล่าง
  app = createApp({ db: handle.db, logger, oauth: fakeOAuth(), rateLimits: { auth: 100_000 } });
});
afterAll(() => handle.close());

describe("login", () => {
  it("is anonymous at first, without treating that as an error", async () => {
    const res = await new Browser(app).request("/api/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null, loginAvailable: true });
  });

  it("creates the user and a working session", async () => {
    const b = new Browser(app);
    const res = await b.login("alice");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect((await me(b)).user).toMatchObject({ email: "alice@example.com", name: "User alice" });
  });

  it("recognises the same person again and updates a changed email", async () => {
    await new Browser(app).login("returning");
    await handle.db.update(users).set({ email: "old@example.com" }).where(eq(users.googleSub, "sub-returning"));
    await new Browser(app).login("returning");
    const rows = await handle.db.select().from(users).where(eq(users.googleSub, "sub-returning"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("returning@example.com");
  });

  it("sets a session cookie scripts cannot read and other sites cannot send", async () => {
    const b = new Browser(app);
    const res = await b.login("cookie");
    const line = res.headers.getSetCookie().find((c) => c.startsWith("session=")) as string;
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Path=\//i);
  });

  it("uses a __Host- secure cookie on https", async () => {
    const secureApp = createApp({ db: handle.db, logger, oauth: fakeOAuth(), publicOrigin: "https://example.test" });
    const b = new Browser(secureApp);
    const res = await b.login("secure");
    const line = res.headers.getSetCookie().find((c) => c.startsWith("__Host-session=")) as string;
    expect(line).toMatch(/Secure/);
    expect((await me(b)).user?.email).toBe("secure@example.com");
  });

  it("stores only a hash of the session token", async () => {
    const b = new Browser(app);
    await b.login("hashed");
    const token = b.cookies.get("session") as string;
    const rows = await handle.db.select({ hash: sessions.tokenHash }).from(sessions);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.hash)).not.toContain(token);
  });

  it("clears the temporary oauth cookies afterwards", async () => {
    const b = new Browser(app);
    await b.login("flow");
    expect(b.cookies.has("oauth_state")).toBe(false);
    expect(b.cookies.has("oauth_verifier")).toBe(false);
  });
});

describe("login is refused when", () => {
  const refused = (res: Response) => {
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/?login=failed");
  };

  it("the state does not match, which stops login CSRF", async () => {
    const b = new Browser(app);
    await b.request("/api/auth/google");
    refused(await b.request("/api/auth/google/callback?code=mallory&state=forged"));
    expect((await me(b)).user).toBeNull();
  });

  it("the flow did not start in this browser", async () => {
    const b = new Browser(app);
    refused(await b.request("/api/auth/google/callback?code=mallory&state=anything"));
    expect((await me(b)).user).toBeNull();
  });

  it("a state cannot be used twice", async () => {
    const b = new Browser(app);
    const start = await b.request("/api/auth/google");
    const state = new URL(start.headers.get("location") as string).searchParams.get("state");
    await b.request(`/api/auth/google/callback?code=once&state=${state}`);
    refused(await b.request(`/api/auth/google/callback?code=once&state=${state}`));
  });

  it("Google refuses the code", async () => {
    const b = new Browser(app);
    refused(await b.login("rejected-by-google"));
    expect((await me(b)).user).toBeNull();
  });

  it("the user cancels on the Google page", async () => {
    const b = new Browser(app);
    await b.request("/api/auth/google");
    refused(await b.request("/api/auth/google/callback?error=access_denied"));
  });
});

describe("without Google credentials", () => {
  it("hides login and fails politely", async () => {
    const noOauth = createApp({ db: handle.db, logger });
    const b = new Browser(noOauth);
    expect(await me(b)).toEqual({ user: null, loginAvailable: false });
    const res = await b.request("/api/auth/google");
    expect(res.headers.get("location")).toBe("/?login=unavailable");
  });
});

describe("the real Google provider", () => {
  it("asks only for identity, and uses PKCE and state", () => {
    const google = googleProvider({ clientId: "id", clientSecret: "secret", redirectUri: "http://localhost/cb" });
    const url = google.createAuthUrl("the-state", "the-verifier");
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual(["email", "openid", "profile"]);
    expect(url.searchParams.get("state")).toBe("the-state");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).not.toBe("the-verifier");
    expect(url.toString()).not.toContain("secret");
  });
});

describe("logout", () => {
  it("ends the session on the server, not just in the browser", async () => {
    const b = new Browser(app);
    await b.login("leaver");
    const stolen = new Browser(app);
    stolen.cookies = new Map(b.cookies);
    expect((await b.request("/api/auth/logout", { method: "POST" })).status).toBe(204);
    expect((await me(b)).user).toBeNull();
    // cookie ที่ถูกคัดลอกไว้ก่อน logout ต้องใช้ไม่ได้แล้ว
    expect((await me(stolen)).user).toBeNull();
  });

  it("is harmless when not logged in", async () => {
    expect((await new Browser(app).request("/api/auth/logout", { method: "POST" })).status).toBe(204);
  });
});

describe("sessions", () => {
  it("stop working after they expire", async () => {
    const b = new Browser(app);
    await b.login("expiring");
    const [user] = await handle.db.select().from(users).where(eq(users.googleSub, "sub-expiring"));
    await handle.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, user?.id as string));
    expect((await me(b)).user).toBeNull();
  });

  it("renew when close to expiry so active users stay logged in", async () => {
    const b = new Browser(app);
    await b.login("renewing");
    const [user] = await handle.db.select().from(users).where(eq(users.googleSub, "sub-renewing"));
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await handle.db
      .update(sessions)
      .set({ expiresAt: soon })
      .where(eq(sessions.userId, user?.id as string));
    expect((await me(b)).user).not.toBeNull();
    const [row] = await handle.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user?.id as string));
    expect(row?.expiresAt.getTime()).toBeGreaterThan(soon.getTime() + 24 * 60 * 60 * 1000);
  });

  it("ignores a made-up token", async () => {
    const b = new Browser(app);
    b.cookies.set("session", "made-up");
    expect((await me(b)).user).toBeNull();
  });
});

describe("cross-site requests", () => {
  it("are refused for writes", async () => {
    const b = new Browser(app);
    await b.login("victim");
    const res = await b.request("/api/me", { method: "DELETE", headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    expect((await me(b)).user).not.toBeNull();
  });

  it("are allowed from our own origin", async () => {
    const b = new Browser(app);
    await b.login("selfie");
    const res = await b.request("/api/auth/logout", { method: "POST", headers: { origin: "http://localhost:5173" } });
    expect(res.status).toBe(204);
  });
});

describe("rate limit", () => {
  it("slows down repeated login attempts", async () => {
    const limited = createApp({ db: handle.db, logger, oauth: fakeOAuth(), rateLimits: { auth: 2 } });
    const b = new Browser(limited);
    await b.request("/api/auth/google");
    await b.request("/api/auth/google");
    const res = await b.request("/api/auth/google");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("account", () => {
  it("export contains the user's data and requires login", async () => {
    expect((await new Browser(app).request("/api/me/export")).status).toBe(401);
    const b = new Browser(app);
    await b.login("exporter");
    await b.request("/api/plans", { method: "POST", json: { curriculumId: "comp-eng-2566", name: "แผนหลัก" } });
    const res = await b.request("/api/me/export");
    const body = await jsonOf(res);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body.user.email).toBe("exporter@example.com");
    expect(body.plans.map((p: { name: string }) => p.name)).toEqual(["แผนหลัก"]);
  });

  it("delete removes the user and everything they own, for that user only", async () => {
    const other = new Browser(app);
    await other.login("bystander");
    await other.request("/api/plans", { method: "POST", json: { curriculumId: "comp-eng-2566", name: "ของเขา" } });

    const b = new Browser(app);
    await b.login("deleter");
    await b.request("/api/plans", { method: "POST", json: { curriculumId: "comp-eng-2566", name: "ของฉัน" } });
    const [user] = await handle.db.select().from(users).where(eq(users.googleSub, "sub-deleter"));
    const userId = user?.id as string;

    expect((await b.request("/api/me", { method: "DELETE" })).status).toBe(204);
    expect((await me(b)).user).toBeNull();
    const remaining = await handle.db.execute<{ users: number; plans: number; sessions: number; items: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM users WHERE id = ${userId}) AS users,
        (SELECT count(*)::int FROM plans WHERE user_id = ${userId}) AS plans,
        (SELECT count(*)::int FROM sessions WHERE user_id = ${userId}) AS sessions,
        (SELECT count(*)::int FROM plan_items i JOIN plans p ON p.id = i.plan_id WHERE p.user_id = ${userId}) AS items
    `);
    expect(remaining[0]).toEqual({ users: 0, plans: 0, sessions: 0, items: 0 });

    const theirs = await jsonOf(await other.request("/api/plans"));
    expect(theirs.map((p: { name: string }) => p.name)).toEqual(["ของเขา"]);
    expect((await handle.db.select().from(plans)).length).toBeGreaterThan(0);
  });

  it("delete requires login", async () => {
    expect((await new Browser(app).request("/api/me", { method: "DELETE" })).status).toBe(401);
  });
});
