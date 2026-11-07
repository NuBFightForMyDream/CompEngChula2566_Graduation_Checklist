// กัน CSRF: เบราว์เซอร์แนบ Origin ทุกครั้งที่ส่ง POST / PUT / DELETE และเว็บอื่นปลอมค่านี้ไม่ได้
// cookie ตั้ง SameSite=Lax ไว้แล้ว ชั้นนี้เป็นการป้องกันอีกชั้นหนึ่ง

import type { MiddlewareHandler } from "hono";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export const requireSameOrigin =
  (publicOrigin: string): MiddlewareHandler =>
  async (c, next) => {
    const origin = c.req.header("origin");
    if (!SAFE.has(c.req.method) && origin && origin !== publicOrigin) {
      return c.json({ error: { code: "FORBIDDEN_ORIGIN", message: "ไม่อนุญาตให้เรียกจากเว็บอื่น" } }, 403);
    }
    return next();
  };
