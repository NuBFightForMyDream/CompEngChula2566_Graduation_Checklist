import { curriculumListSchema, curriculumSchema, noticeListSchema } from "@cp/contracts";
import type { Curriculum } from "@cp/core";
import type { CurriculumSource } from "./curriculumSource.ts";

async function getJson(path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(path);
  } catch {
    throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  }
  if (!res.ok) throw new Error(`เซิร์ฟเวอร์ตอบกลับ ${res.status}`);
  return res.json();
}

const segment = encodeURIComponent;

export const apiCurriculumSource: CurriculumSource = {
  list: async () => curriculumListSchema.parse(await getJson("/api/curricula")),
  curriculum: async (id) => curriculumSchema.parse(await getJson(`/api/curricula/${segment(id)}`)) as Curriculum,
  notices: async (id) =>
    noticeListSchema.parse(await getJson(`/api/curricula/${segment(id)}/notices`)).map((n) => n.body),
};
