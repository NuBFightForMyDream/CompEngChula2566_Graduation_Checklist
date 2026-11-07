import { curriculumListSchema, curriculumSchema, noticeListSchema } from "@cp/contracts";
import type { Curriculum } from "@cp/core";
import { getJson } from "./api.ts";
import type { CurriculumSource } from "./curriculumSource.ts";

const segment = encodeURIComponent;

export const apiCurriculumSource: CurriculumSource = {
  list: async () => curriculumListSchema.parse(await getJson("/api/curricula")),
  curriculum: async (id) => curriculumSchema.parse(await getJson(`/api/curricula/${segment(id)}`)) as Curriculum,
  notices: async (id) =>
    noticeListSchema.parse(await getJson(`/api/curricula/${segment(id)}/notices`)).map((n) => n.body),
};
