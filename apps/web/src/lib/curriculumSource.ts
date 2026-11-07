// แหล่งข้อมูลหลักสูตร สลับได้ด้วย VITE_CURRICULUM_SOURCE
//   bundled (ค่าเริ่มต้น) = อ่านจากไฟล์ที่ติดมากับเว็บ ไม่ต้องเปิด API หรือฐานข้อมูล
//   api = อ่านจาก API ใช้กับ pnpm dev:full และจะเป็นค่าหลักเมื่อ deploy ในเฟส 5

import type { CurriculumSummary } from "@cp/contracts";
import type { Curriculum } from "@cp/core";

export interface CurriculumSource {
  list(): Promise<CurriculumSummary[]>;
  curriculum(id: string): Promise<Curriculum>;
  notices(id: string): Promise<string[]>;
}

export async function curriculumSource(): Promise<CurriculumSource> {
  // import แบบไดนามิก เพื่อไม่ให้ข้อมูลหลักสูตรติดไปใน bundle ตอนใช้โหมด api
  if (import.meta.env.VITE_CURRICULUM_SOURCE === "api") {
    return (await import("./apiCurriculumSource.ts")).apiCurriculumSource;
  }
  return (await import("./bundledCurriculumSource.ts")).bundledCurriculumSource;
}
