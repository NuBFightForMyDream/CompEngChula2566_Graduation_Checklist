import {
  apiErrorSchema,
  courseChainSchema,
  curriculumListSchema,
  curriculumSchema,
  noticeListSchema,
} from "@cp/contracts";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Db } from "../../db/client.ts";
import { validationHook } from "../../middleware/errors.ts";
import { courseExists, curriculumExists, getCourseChain, getCurriculum, getNotices, listCurricula } from "./repo.ts";

const idParam = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const CurriculumParams = z.object({ id: idParam });
const CourseParams = z.object({ id: idParam, courseId: idParam });

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});
const notFound = json(apiErrorSchema, "ไม่พบข้อมูล");
const badRequest = json(apiErrorSchema, "รูปแบบ request ไม่ถูกต้อง");
const notFoundBody = (message: string) => ({ error: { code: "NOT_FOUND", message } });

export function curriculaRoutes(db: Db) {
  const app = new OpenAPIHono({ defaultHook: validationHook });

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Curricula"],
      summary: "รายชื่อหลักสูตร",
      responses: { 200: json(curriculumListSchema, "รายชื่อหลักสูตร") },
    }),
    async (c) => c.json(await listCurricula(db), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}",
      tags: ["Curricula"],
      summary: "ข้อมูลหลักสูตรทั้งหมด",
      request: { params: CurriculumParams },
      responses: { 200: json(curriculumSchema, "หลักสูตร"), 400: badRequest, 404: notFound },
    }),
    async (c) => {
      const curriculum = await getCurriculum(db, c.req.valid("param").id);
      return curriculum ? c.json(curriculum, 200) : c.json(notFoundBody("ไม่พบหลักสูตร"), 404);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}/notices",
      tags: ["Curricula"],
      summary: "ประกาศของหลักสูตร",
      request: { params: CurriculumParams },
      responses: { 200: json(noticeListSchema, "ประกาศ"), 400: badRequest, 404: notFound },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      if (!(await curriculumExists(db, id))) return c.json(notFoundBody("ไม่พบหลักสูตร"), 404);
      return c.json(await getNotices(db, id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}/courses/{courseId}/chain",
      tags: ["Curricula"],
      summary: "วิชาที่ต้องผ่านก่อน และวิชาที่จะได้รับผลกระทบ",
      description: "เดินกราฟวิชาบังคับก่อนด้วย recursive CTE ไม่รวมเงื่อนไขของวิชาเลือกที่ผู้ใช้เลือกลงช่อง",
      request: { params: CourseParams },
      responses: { 200: json(courseChainSchema, "สายวิชา"), 400: badRequest, 404: notFound },
    }),
    async (c) => {
      const { id, courseId } = c.req.valid("param");
      if (!(await courseExists(db, id, courseId))) return c.json(notFoundBody("ไม่พบวิชาในหลักสูตรนี้"), 404);
      return c.json(await getCourseChain(db, id, courseId), 200);
    },
  );

  return app;
}
