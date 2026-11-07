import { meSchema, type PlanDetail, type PlanSettings, planDetailSchema, planListSchema } from "@cp/contracts";
import type { PlanState } from "@cp/core";
import { QueryClient, queryOptions } from "@tanstack/react-query";
import { getJson, request, sendJson } from "./api.ts";

/** ระบบบัญชีต้องมี API ถ้ารันแบบไฟล์ล้วน (pnpm dev) จะไม่แสดงส่วนนี้เลย */
export const accountsEnabled = import.meta.env.VITE_CURRICULUM_SOURCE === "api";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: 1 } },
});

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => meSchema.parse(await getJson("/api/me")),
  enabled: accountsEnabled,
});

export const listPlans = async () => planListSchema.parse(await getJson("/api/plans"));

export const getPlan = async (id: string) =>
  planDetailSchema.parse(await getJson(`/api/plans/${encodeURIComponent(id)}`)) as PlanDetail;

export const createPlan = async (body: {
  curriculumId: string;
  name: string;
  state?: PlanState;
  settings?: PlanSettings;
}) => planDetailSchema.parse(await sendJson("POST", "/api/plans", body)) as PlanDetail;

export const logout = () => request("/api/auth/logout", { method: "POST" });

export const deleteAccount = () => request("/api/me", { method: "DELETE" });
