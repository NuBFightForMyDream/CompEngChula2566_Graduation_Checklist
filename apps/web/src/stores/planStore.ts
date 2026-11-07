// แผนของผู้ใช้: ทุกการเปลี่ยนแปลงผ่าน commit() ที่เดียว จึงมี undo และบันทึกอัตโนมัติครบทุกจุด

import { defaultSettings, type PlanFile, type PlanSettings, planFileSchema } from "@cp/contracts";
import {
  type ActionResult,
  type Curriculum,
  createModel,
  emptyPlan,
  normalizePlan,
  type PlanModel,
  type PlanState,
} from "@cp/core";
import { create } from "zustand";
import { type CurriculumEntry, loadCurriculum, loadNotices } from "../lib/curriculumSource.ts";
import { describeOutcome } from "../lib/messages.ts";
import { localPlanRepository } from "../lib/planRepository.ts";
import { useUi } from "./uiStore.ts";

const HISTORY_LIMIT = 50;
const repository = localPlanRepository;

interface PlanStore {
  curriculum: Curriculum | null;
  state: PlanState | null;
  settings: PlanSettings;
  notices: string[];
  past: PlanState[];
  future: PlanState[];
  loadEntry(entry: CurriculumEntry): Promise<void>;
  commit(next: PlanState, message?: string): void;
  dispatch(action: (m: PlanModel) => ActionResult): void;
  undo(): void;
  redo(): void;
  updateSettings(patch: Partial<PlanSettings>): void;
  toFile(): PlanFile;
  importFile(raw: unknown): string | null;
}

const cache = new WeakMap<PlanState, PlanModel>();
export function modelOf(cur: Curriculum, state: PlanState) {
  let m = cache.get(state);
  if (!m) {
    m = createModel(cur, state);
    cache.set(state, m);
  }
  return m;
}

export const usePlan = create<PlanStore>((set, get) => {
  const persist = () => {
    const { curriculum, state, settings } = get();
    if (curriculum && state) void repository.save(curriculum.id, state, settings);
  };

  return {
    curriculum: null,
    state: null,
    settings: defaultSettings,
    notices: [],
    past: [],
    future: [],

    async loadEntry(entry) {
      const [curriculum, notices] = await Promise.all([loadCurriculum(entry), loadNotices(entry)]);
      const stored = await repository.load(curriculum.id);
      const state = stored.plan ? normalizePlan(curriculum, stored.plan) : emptyPlan(curriculum);
      set({ curriculum, state, settings: stored.settings, notices, past: [], future: [] });
      useUi.getState().select(null);
    },

    commit(next, message) {
      const { state, past } = get();
      if (!state || next === state) return;
      set({ state: next, past: [...past, state].slice(-HISTORY_LIMIT), future: [] });
      persist();
      if (message) useUi.getState().showToast({ text: message, undo: true });
    },

    dispatch(action) {
      const { curriculum, state, commit } = get();
      if (!curriculum || !state) return;
      const before = modelOf(curriculum, state);
      const { state: next, outcome } = action(before);
      const changed = next !== state;
      if (changed) commit(next);
      const text = describeOutcome(modelOf(curriculum, next), outcome);
      if (text) useUi.getState().showToast({ ...text, undo: changed });
      else if (changed) useUi.getState().showToast(null);
    },

    undo() {
      const { state, past, future } = get();
      const previous = past.at(-1);
      if (!state || !previous) return;
      set({ state: previous, past: past.slice(0, -1), future: [state, ...future] });
      persist();
      useUi.getState().showToast({ text: "เลิกทำแล้ว" });
    },

    redo() {
      const { state, past, future } = get();
      const next = future[0];
      if (!state || !next) return;
      set({ state: next, past: [...past, state], future: future.slice(1) });
      persist();
      useUi.getState().showToast({ text: "ทำซ้ำแล้ว" });
    },

    updateSettings(patch) {
      set({ settings: { ...get().settings, ...patch } });
      persist();
    },

    toFile() {
      const { curriculum, state, settings } = get();
      return {
        app: "cp-graduation-roadmap",
        version: 1,
        curriculumId: (curriculum as Curriculum).id,
        exportedAt: new Date().toISOString(),
        plan: state as PlanFile["plan"],
        settings,
      };
    },

    /** คืนข้อความ error ถ้านำเข้าไม่สำเร็จ */
    importFile(raw) {
      const { curriculum, commit } = get();
      if (!curriculum) return "ยังโหลดหลักสูตรไม่เสร็จ";
      const parsed = planFileSchema.safeParse(raw);
      if (!parsed.success) return "ไฟล์นี้ไม่ใช่ไฟล์สำรองของเว็บนี้ หรือข้อมูลไม่ครบ";
      if (parsed.data.curriculumId !== curriculum.id) return `ไฟล์นี้เป็นของหลักสูตร ${parsed.data.curriculumId}`;
      set({ settings: parsed.data.settings });
      commit(normalizePlan(curriculum, parsed.data.plan as PlanState), "นำเข้าข้อมูลแล้ว");
      persist();
      return null;
    },
  };
});

/** ใช้ภายใน component ที่แสดงหลังโหลดหลักสูตรเสร็จแล้วเท่านั้น */
export function useModel(): PlanModel {
  const curriculum = usePlan((s) => s.curriculum);
  const state = usePlan((s) => s.state);
  if (!curriculum || !state) throw new Error("ยังโหลดหลักสูตรไม่เสร็จ");
  return modelOf(curriculum, state);
}
