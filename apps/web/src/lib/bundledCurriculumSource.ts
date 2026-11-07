import { curriculumIndexSchema, curriculumSchema } from "@cp/contracts";
import type { Curriculum } from "@cp/core";
import index from "@cp/curricula/data/index.json";
import type { CurriculumSource } from "./curriculumSource.ts";

const entries = curriculumIndexSchema.parse(index);

const files = import.meta.glob(
  ["../../../../packages/curricula/data/*.json", "!../../../../packages/curricula/data/index.json"],
  { import: "default" },
);
const noticeFiles = import.meta.glob("../../../../packages/curricula/data/notices/*.md", {
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

export const bundledCurriculumSource: CurriculumSource = {
  list: async () => entries.map(({ id, name }) => ({ id, name })),
  curriculum: async (id) => curriculumSchema.parse(await findByName(files, entryOf(id).file)) as Curriculum,
  notices: (id) => Promise.all((entryOf(id).notices ?? []).map((f) => findByName(noticeFiles, f) as Promise<string>)),
};
