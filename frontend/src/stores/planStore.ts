// แผนของผู้ใช้: ทุกการเปลี่ยนแปลงผ่าน commit() ที่เดียว จึงมี undo และบันทึกอัตโนมัติครบทุกจุด
// ไม่ได้ login บันทึกในเบราว์เซอร์ ถ้า login แล้วบันทึกลง Firestore ผ่าน lib/cloud.ts

import {
  type CurriculumSummary,
  defaultSettings,
  type PlanFile,
  type PlanSettings,
  planFileSchema,
} from "@cp/contracts";
import {
  type ActionResult,
  type Curriculum,
  createModel,
  emptyPlan,
  hasProgress,
  normalizePlan,
  type PlanModel,
  type PlanState,
  samePlan,
} from "@cp/core";
import { create } from "zustand";
import type { CloudPlan, CloudUser } from "../lib/cloud.ts";
import { curriculumSource } from "../lib/curriculumSource.ts";
import { accountsEnabled } from "../lib/firebaseConfig.ts";
import { describeOutcome } from "../lib/messages.ts";
import { localPlanRepository } from "../lib/planRepository.ts";
import { useUi } from "./uiStore.ts";

const HISTORY_LIMIT = 50;
const SAVE_DELAY_MS = 800;
const repository = localPlanRepository;

export type SaveStatus = "local" | "pending" | "saved" | "offline" | "error";

/** แผนในเบราว์เซอร์ตอน login ต่างจากแผนในบัญชี ต้องให้ผู้ใช้เลือก */
export interface PlanConflict {
  mine: PlanState;
  mineSettings: PlanSettings;
  server: CloudPlan;
}

interface PlanStore {
  entries: CurriculumSummary[];
  curriculum: Curriculum | null;
  state: PlanState | null;
  settings: PlanSettings;
  notices: string[];
  past: PlanState[];
  future: PlanState[];
  user: CloudUser | null;
  saveStatus: SaveStatus;
  conflict: PlanConflict | null;
  init(): Promise<void>;
  loadCurriculum(id: string): Promise<void>;
  commit(next: PlanState, message?: string): void;
  dispatch(action: (m: PlanModel) => ActionResult): void;
  undo(): void;
  redo(): void;
  updateSettings(patch: Partial<PlanSettings>): void;
  toFile(): PlanFile;
  importFile(raw: unknown): string | null;
  resolveConflict(choice: "mine" | "server"): void;
  /** ส่งที่ค้างให้หมด คืน false ถ้ายังบันทึกไม่สำเร็จ */
  flushSaves(): Promise<boolean>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  exportAccount(): Promise<object | null>;
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

const sameSettings = (a: PlanSettings, b: PlanSettings) =>
  a.autoShift === b.autoShift &&
  a.showEdges === b.showEdges &&
  Object.keys(a.colors).length === Object.keys(b.colors).length &&
  Object.entries(a.colors).every(([k, v]) => b.colors[k] === v);

const ignoredSignInErrors = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request"]);

type Cloud = typeof import("../lib/cloud.ts");
// โหลด Firebase เฉพาะเมื่อตั้งค่าไว้ เว็บที่ไม่มีระบบบัญชีจะได้ไม่ต้องดาวน์โหลด SDK
let cloud: Cloud | null = null;
let initOnce: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveSeq = 0;
let stopWatchingPlan: (() => void) | null = null;
let stopWatchingUser: (() => void) | null = null;

export const usePlan = create<PlanStore>((set, get) => {
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const { curriculum, state, settings, user } = get();
    if (!cloud || !curriculum || !state || !user) return;
    const seq = ++saveSeq;
    cloud.savePlan(user.uid, curriculum.id, state, settings).then(
      () => {
        if (seq === saveSeq && !saveTimer) set({ saveStatus: "saved" });
      },
      () => set({ saveStatus: "error" }),
    );
  }

  const persist = () => {
    const { curriculum, state, settings, user } = get();
    if (!curriculum || !state) return;
    if (!user) {
      void repository.save(curriculum.id, state, settings);
      return;
    }
    set({ saveStatus: navigator.onLine ? "pending" : "offline" });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
  };

  function applyRemote(plan: CloudPlan) {
    const { curriculum, state, settings, conflict } = get();
    // ยังมีการแก้ในเครื่องนี้ที่รอส่ง หรือรอผู้ใช้เลือกฉบับ: ฉบับในเครื่องนี้จะถูกส่งทับอยู่แล้ว
    if (!curriculum || !state || saveTimer || conflict) return;
    const next = normalizePlan(curriculum, plan.state);
    if (samePlan(next, state) && sameSettings(plan.settings, settings)) return;
    set({ state: next, settings: plan.settings, past: [], future: [], saveStatus: "saved" });
    useUi.getState().showToast({ text: "อัปเดตแผนจากเครื่องอื่นแล้ว" });
  }

  /** เปิดแผนในบัญชี และจัดการกรณีที่มีแผนค้างอยู่ในเบราว์เซอร์นี้ */
  async function openCloud(c: Cloud, user: CloudUser, curriculum: Curriculum) {
    const stored = await repository.load(curriculum.id);
    const local = stored.plan ? normalizePlan(curriculum, stored.plan) : null;
    const localHasProgress = !!local && hasProgress(curriculum, local);
    const saved = await c.loadPlan(user.uid, curriculum.id);

    if (!saved) {
      if (!local || !localHasProgress)
        return { state: emptyPlan(curriculum), settings: defaultSettings, conflict: null };
      // ลบจากเบราว์เซอร์เมื่อเซิร์ฟเวอร์รับแล้วเท่านั้น
      c.savePlan(user.uid, curriculum.id, local, stored.settings).then(
        () => repository.clear(curriculum.id),
        () => {},
      );
      useUi.getState().showToast({ text: "ย้ายแผนจากเบราว์เซอร์นี้เข้าบัญชีแล้ว" });
      return { state: local, settings: stored.settings, conflict: null };
    }

    const server = { ...saved, state: normalizePlan(curriculum, saved.state) };
    const base = { state: server.state, settings: server.settings, conflict: null };
    if (!local || !localHasProgress) return base;
    if (samePlan(local, server.state)) {
      await repository.clear(curriculum.id);
      return base;
    }
    return { ...base, conflict: { mine: local, mineSettings: stored.settings, server } };
  }

  return {
    entries: [],
    curriculum: null,
    state: null,
    settings: defaultSettings,
    notices: [],
    past: [],
    future: [],
    user: null,
    saveStatus: "local",
    conflict: null,

    init() {
      // StrictMode เรียก effect สองครั้งตอนพัฒนา
      initOnce ??= (async () => {
        const entries = curriculumSource.list();
        const first = entries[0];
        if (!first) throw new Error("ไม่พบรายชื่อหลักสูตร");
        set({ entries });
        if (accountsEnabled) {
          cloud ??= await import("../lib/cloud.ts");
          set({ user: await cloud.currentUser() });
        }
        await get().loadCurriculum(first.id);
        if (cloud) {
          stopWatchingUser = cloud.onUserChange((user) => {
            const { curriculum } = get();
            if (user?.uid === get().user?.uid || !curriculum) return;
            // ที่รอส่งเป็นของบัญชีเดิม ห้ามส่งเข้าบัญชีใหม่
            clearTimeout(saveTimer);
            saveTimer = undefined;
            // ซ่อนกระดานระหว่างโหลด ไม่อย่างนั้นสิ่งที่แก้ช่วงนี้จะถูกแผนที่โหลดมาทับ
            set({ user, curriculum: null, state: null });
            get()
              .loadCurriculum(curriculum.id)
              .catch(() => window.location.reload());
          });
        }
        window.addEventListener("offline", () => {
          if (get().saveStatus === "pending") set({ saveStatus: "offline" });
        });
        window.addEventListener("online", () => {
          if (get().saveStatus === "offline") set({ saveStatus: "pending" });
        });
        // ปิดแท็บระหว่างรอส่ง: ให้ Firestore เก็บลงเครื่องไว้ก่อน แล้วส่งตอนเปิดครั้งหน้า
        window.addEventListener("pagehide", () => {
          if (saveTimer) saveNow();
        });
      })().catch((err) => {
        initOnce = null;
        throw err;
      });
      return initOnce;
    },

    async loadCurriculum(id) {
      if (saveTimer) saveNow();
      stopWatchingPlan?.();
      stopWatchingPlan = null;
      const [curriculum, notices] = await Promise.all([curriculumSource.curriculum(id), curriculumSource.notices(id)]);
      const { user } = get();

      if (cloud && user) {
        const opened = await openCloud(cloud, user, curriculum);
        set({
          curriculum,
          notices,
          state: opened.state,
          settings: opened.settings,
          past: [],
          future: [],
          saveStatus: "saved",
          conflict: opened.conflict,
        });
        stopWatchingPlan = cloud.watchPlan(user.uid, curriculum.id, applyRemote);
      } else {
        const stored = await repository.load(curriculum.id);
        const state = stored.plan ? normalizePlan(curriculum, stored.plan) : emptyPlan(curriculum);
        set({
          curriculum,
          notices,
          state,
          settings: stored.settings,
          past: [],
          future: [],
          saveStatus: "local",
          conflict: null,
        });
      }
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

    resolveConflict(choice) {
      const { conflict, curriculum } = get();
      if (!conflict || !curriculum) return;
      if (choice === "mine") {
        set({
          state: conflict.mine,
          settings: conflict.mineSettings,
          past: [],
          future: [],
          conflict: null,
          saveStatus: "pending",
        });
        saveNow();
      } else {
        set({
          state: conflict.server.state,
          settings: conflict.server.settings,
          past: [],
          future: [],
          conflict: null,
        });
      }
      void repository.clear(curriculum.id);
    },

    async flushSaves() {
      if (!cloud || !get().user) return true;
      if (saveTimer) saveNow();
      return cloud.waitForSaves();
    },

    async signIn() {
      try {
        await cloud?.signIn();
      } catch (err) {
        const code = (err as { code?: string }).code ?? "";
        if (ignoredSignInErrors.has(code)) return;
        useUi.getState().showToast({
          text:
            code === "auth/popup-blocked"
              ? "เบราว์เซอร์บล็อกหน้าต่างเข้าสู่ระบบ กรุณาอนุญาต popup แล้วลองใหม่"
              : "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่",
          bad: true,
        });
      }
    },

    async signOut() {
      if (!cloud) return;
      if (!(await get().flushSaves())) {
        useUi.getState().showToast({ text: "ยังบันทึกไม่สำเร็จ กรุณาเชื่อมต่ออินเทอร์เน็ตก่อนออกจากระบบ", bad: true });
        return;
      }
      stopWatchingUser?.();
      stopWatchingPlan?.();
      await cloud.signOut();
      window.location.reload();
    },

    async deleteAccount() {
      if (!cloud) return;
      // ส่งที่ค้างออกไปก่อนลบ Firestore เรียงการเขียนตามลำดับ แผนจึงไม่ถูกสร้างกลับหลังลบ
      // และห้าม await ก่อนเปิดหน้าต่างยืนยันตัวตน ไม่อย่างนั้นเบราว์เซอร์จะบล็อก popup
      if (saveTimer) saveNow();
      await cloud.deleteAccount();
      window.location.reload();
    },

    async exportAccount() {
      const { user } = get();
      return cloud && user ? cloud.exportMyData(user) : null;
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
