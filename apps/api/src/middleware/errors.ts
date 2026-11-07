import type { Context } from "hono";

/** request ไม่ผ่าน schema: บอกแค่ว่ารูปแบบผิด ไม่ส่งรายละเอียดภายในกลับไป */
export const validationHook = (result: { success: boolean }, c: Context) => {
  if (!result.success) {
    return c.json({ error: { code: "BAD_REQUEST", message: "รูปแบบ request ไม่ถูกต้อง" } }, 400);
  }
  return undefined;
};
