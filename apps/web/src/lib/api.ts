// เรียก API ใน origin เดียวกันเสมอ cookie ของ session จึงถูกส่งไปเอง

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`เซิร์ฟเวอร์ตอบกลับ ${status}`);
    this.status = status;
    this.body = body;
  }
}

/** เชื่อมต่อไม่ได้ เช่น เน็ตหลุด ต่างจากเซิร์ฟเวอร์ตอบ error */
export class NetworkError extends Error {
  constructor() {
    super("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  }
}

export async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new NetworkError();
  }
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return res;
}

export const getJson = async (path: string): Promise<unknown> => (await request(path)).json();

export const sendJson = async (method: string, path: string, body: unknown): Promise<unknown> =>
  (
    await request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  ).json();
