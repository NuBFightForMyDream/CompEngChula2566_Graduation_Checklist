// จำลองเบราว์เซอร์หนึ่งตัว: เก็บ cookie แล้วส่งกลับไปในคำขอถัดไป
import type { createApp } from "../src/app.ts";

// biome-ignore lint/suspicious/noExplicitAny: ค่าที่ตอบกลับถูกตรวจด้วย expect ใน test แต่ละข้อ
export const jsonOf = async (res: Response): Promise<any> => res.json();

export class Browser {
  cookies = new Map<string, string>();
  app: ReturnType<typeof createApp>;

  constructor(app: ReturnType<typeof createApp>) {
    this.app = app;
  }

  async request(path: string, init: RequestInit & { json?: unknown } = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) {
      headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    }
    const { json, ...rest } = init;
    if (json !== undefined) headers.set("content-type", "application/json");
    const res = await this.app.request(path, {
      ...rest,
      headers,
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair = ""] = line.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (!value || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return res;
  }

  /** เดินตามขั้นตอน login จริงทั้งหมด โดยให้ Google ปลอมตอบกลับด้วย code นี้ */
  async login(code: string) {
    const start = await this.request("/api/auth/google");
    const state = new URL(start.headers.get("location") as string).searchParams.get("state");
    return this.request(`/api/auth/google/callback?code=${code}&state=${state}`);
  }
}
