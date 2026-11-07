// แหล่งข้อมูลหลักสูตร ตอนนี้อ่านจาก packages/curricula เฟส 3 จะเปลี่ยนไปอ่านจาก API

import { curriculumSchema } from "@cp/contracts";
import type { Curriculum } from "@cp/core";
import index from "@cp/curricula/data/index.json";

export interface CurriculumEntry {
  id: string;
  name: string;
  file: string;
  notices?: string[];
}

const files = import.meta.glob(
  ["../../../../packages/curricula/data/*.json", "!../../../../packages/curricula/data/index.json"],
  {
    import: "default",
  },
);
const notices = import.meta.glob("../../../../packages/curricula/data/notices/*.md", {
  query: "?raw",
  import: "default",
});

const findByName = <T>(all: Record<string, () => Promise<T>>, tail: string) => {
  const key = Object.keys(all).find((k) => k.endsWith(`/data/${tail}`));
  if (!key) throw new Error(`ไม่พบไฟล์ ${tail}`);
  return (all[key] as () => Promise<T>)();
};

export const curriculumEntries = index as CurriculumEntry[];

export async function loadCurriculum(entry: CurriculumEntry): Promise<Curriculum> {
  return curriculumSchema.parse(await findByName(files, entry.file)) as Curriculum;
}

export const loadNotices = (entry: CurriculumEntry) =>
  Promise.all((entry.notices ?? []).map((f) => findByName(notices, f) as Promise<string>));
