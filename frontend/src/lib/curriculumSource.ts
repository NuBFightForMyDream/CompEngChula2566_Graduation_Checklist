// หลักสูตรและประกาศอ่านจากโฟลเดอร์ data/ ที่ติดมากับเว็บ แต่ละหลักสูตรโหลดเมื่อเปิดใช้เท่านั้น

import { type CurriculumSummary, curriculumIndexSchema, curriculumSchema } from "@cp/contracts";
import type { Curriculum } from "@cp/core";
import index from "../../../data/index.json";

const entries = curriculumIndexSchema.parse(index);

const files = import.meta.glob(["../../../data/*.json", "!../../../data/index.json"], { import: "default" });
const noticeFiles = import.meta.glob("../../../data/notices/*.md", {
  query: "?raw",
  import: "default",
});

const findByName = <T>(all: Record<string, () => Promise<T>>, tail: string) => {
  const key = Object.keys(all).find((k) => k.endsWith(`/data/${tail}`));
  if (!key) throw new Error(`ไม่พบไฟล์ ${tail}`);
  return (all[key] as () => Promise<T>)();
};

const entryOf = (id: string) => {
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error(`ไม่พบหลักสูตร ${id}`);
  return entry;
};

export const curriculumSource = {
  list: (): CurriculumSummary[] => entries.map(({ id, name }) => ({ id, name })),
  curriculum: async (id: string) => curriculumSchema.parse(await findByName(files, entryOf(id).file)) as Curriculum,
  notices: (id: string) =>
    Promise.all((entryOf(id).notices ?? []).map((f) => findByName(noticeFiles, f) as Promise<string>)),
};
