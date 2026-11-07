import {
  apiErrorSchema,
  createPlanSchema,
  planConflictSchema,
  planDetailSchema,
  planInvalidSchema,
  planListSchema,
  savedPlanSchema,
  savePlanSchema,
} from "@cp/contracts";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import type { Db } from "../../db/client.ts";
import { validationHook } from "../../middleware/errors.ts";
import { type RateLimits, rateLimit } from "../../middleware/rateLimit.ts";
import { type AuthEnv, type CookieOptions, requireUser } from "../auth/session.ts";
import { createPlan, deletePlan, getPlan, listPlans, MAX_PLANS_PER_USER, savePlan } from "./service.ts";

const PlanParams = z.object({ id: z.uuid() });

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});
const jsonBody = <T extends z.ZodType>(schema: T) => ({
  content: { "application/json": { schema } },
  required: true,
});

const errors = {
  401: json(apiErrorSchema, "ยังไม่ได้เข้าสู่ระบบ"),
  404: json(apiErrorSchema, "ไม่พบแผน รวมถึงแผนของผู้ใช้คนอื่น"),
};
const error = (code: string, message: string) => ({ error: { code, message } });
const NOT_FOUND = error("NOT_FOUND", "ไม่พบแผน");
const INVALID = error("PLAN_INVALID", "แผนไม่ผ่านเงื่อนไขของหลักสูตร");

export function planRoutes({ db, cookies, limits }: { db: Db; cookies: CookieOptions; limits: RateLimits }) {
  const app = new OpenAPIHono<AuthEnv>({ defaultHook: validationHook });

  app.use(requireUser(db, cookies));
  // แผนหนึ่งมีข้อมูลไม่กี่ KB เพดานนี้กันการส่งข้อมูลก้อนใหญ่มาถล่มเซิร์ฟเวอร์
  app.use(
    bodyLimit({
      maxSize: 256 * 1024,
      onError: (c) => c.json(error("TOO_LARGE", "ข้อมูลใหญ่เกินไป"), 413),
    }),
  );
  const writeLimit = rateLimit(db, "writes", limits.writes, (c) => (c.get("user") as { id: string }).id);
  app.on(["POST", "PUT", "DELETE"], "*", writeLimit);

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Plans"],
      summary: "แผนทั้งหมดของฉัน",
      responses: { 200: json(planListSchema, "รายการแผน"), 401: errors[401] },
    }),
    async (c) => c.json(await listPlans(db, c.get("user").id), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["Plans"],
      summary: "สร้างแผนใหม่",
      description: `สร้างได้ไม่เกิน ${MAX_PLANS_PER_USER} แผนต่อคน`,
      request: { body: jsonBody(createPlanSchema) },
      responses: {
        201: json(planDetailSchema, "แผนที่สร้าง"),
        400: json(apiErrorSchema, "รูปแบบ request ไม่ถูกต้อง"),
        401: errors[401],
        404: json(apiErrorSchema, "ไม่พบหลักสูตร"),
        409: json(apiErrorSchema, "มีแผนครบตามเพดานแล้ว"),
        422: json(planInvalidSchema, "แผนไม่ผ่านเงื่อนไขของหลักสูตร"),
      },
    }),
    async (c) => {
      const result = await createPlan(db, c.get("user").id, c.req.valid("json"));
      switch (result.type) {
        case "created":
          return c.json(result.plan, 201);
        case "unknownCurriculum":
          return c.json(error("NOT_FOUND", "ไม่พบหลักสูตร"), 404);
        case "limitReached":
          return c.json(error("PLAN_LIMIT", `สร้างแผนได้ไม่เกิน ${MAX_PLANS_PER_USER} แผน`), 409);
        case "invalid":
          return c.json({ ...INVALID, problems: result.problems }, 422);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}",
      tags: ["Plans"],
      summary: "ข้อมูลแผน",
      request: { params: PlanParams },
      responses: {
        200: json(planDetailSchema, "แผน"),
        400: json(apiErrorSchema, "รูปแบบ request ไม่ถูกต้อง"),
        ...errors,
      },
    }),
    async (c) => {
      const plan = await getPlan(db, c.get("user").id, c.req.valid("param").id);
      return plan ? c.json(plan, 200) : c.json(NOT_FOUND, 404);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/{id}/state",
      tags: ["Plans"],
      summary: "บันทึกแผน",
      description: "ส่ง version ที่เห็นล่าสุดมาด้วย ถ้าเครื่องอื่นบันทึกไปก่อนจะตอบ 409 พร้อมแผนฉบับล่าสุด",
      request: { params: PlanParams, body: jsonBody(savePlanSchema) },
      responses: {
        200: json(savedPlanSchema, "บันทึกแล้ว"),
        400: json(apiErrorSchema, "รูปแบบ request ไม่ถูกต้อง"),
        ...errors,
        409: json(planConflictSchema, "version ไม่ตรง มีเครื่องอื่นบันทึกไปก่อนแล้ว"),
        422: json(planInvalidSchema, "แผนไม่ผ่านเงื่อนไขของหลักสูตร"),
      },
    }),
    async (c) => {
      const result = await savePlan(db, c.get("user").id, c.req.valid("param").id, c.req.valid("json"));
      switch (result.type) {
        case "saved":
          return c.json({ version: result.version, updatedAt: result.updatedAt }, 200);
        case "notFound":
          return c.json(NOT_FOUND, 404);
        case "conflict":
          return c.json({ ...error("VERSION_CONFLICT", "มีเครื่องอื่นบันทึกแผนนี้ไปก่อนแล้ว"), plan: result.plan }, 409);
        case "invalid":
          return c.json({ ...INVALID, problems: result.problems }, 422);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["Plans"],
      summary: "ลบแผน",
      request: { params: PlanParams },
      responses: {
        204: { description: "ลบแล้ว" },
        400: json(apiErrorSchema, "รูปแบบ request ไม่ถูกต้อง"),
        ...errors,
      },
    }),
    async (c) => {
      const deleted = await deletePlan(db, c.get("user").id, c.req.valid("param").id);
      return deleted ? c.body(null, 204) : c.json(NOT_FOUND, 404);
    },
  );

  return app;
}
