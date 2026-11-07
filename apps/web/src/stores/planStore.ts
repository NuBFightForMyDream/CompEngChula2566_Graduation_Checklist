// แผนของผู้ใช้: ทุกการเปลี่ยนแปลงผ่าน commit() ที่เดียว จึงมี undo และบันทึกอัตโนมัติครบทุกจุด
// ไม่ได้ login บันทึกในเบราว์เซอร์ ถ้า login แล้วบันทึกขึ้นบัญชีผ่าน planSync

import {
  type CurriculumSummary,
  defaultSettings,
  type PlanDetail,
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
import { accountsEnabled, createPlan, getPlan, listPlans, meQuery, queryClient } from "../lib/account.ts";
import { curriculumSource } from "../lib/curriculumSource.ts";
import { describeOutcome } from "../lib/messages.ts";
import { localPlanRepository } from "../lib/planRepository.ts";
import { clearDraft, createPlanSync, type PlanSync, readDraft, type SaveStatus } from "../lib/planSync.ts";
import { useUi } from "./uiStore.ts";

const HISTORY_LIMIT = 50;
const DEFAULT_PLAN_NAME = "แผนหลัก";
const repository = localPlanRepository;

export type { SaveStatus };

/**
 * มีแผนสองฉบับที่ต่างกัน ต้องให้ผู้ใช้เลือก
 *   local = แผนในเบราว์เซอร์ตอน login กับแผนในบัญชี
 *   draft = ฉบับร่างที่ยังส่งไม่สำเร็จ กับแผนที่เครื่องอื่นบันทึกหลังจากนั้น
 *   remote = กำลังแก้อยู่ แล้วเครื่องอื่นบันทึกไปก่อน
 */
export interface PlanConflict {
  kind: "local" | "draft" | "remote";
  mine: PlanState;
  mineSettings: PlanSettings;
  server: PlanDetail;
}

interface RemotePlan {
  id: string;
  name: string;
}

interface PlanStore {
  entries: CurriculumSummary[];
  curriculum: Curriculum | null;
  state: PlanState | null;
  settings: PlanSettings;
  notices: string[];
  past: PlanState[];
  future: PlanState[];
  remote: RemotePlan | null;
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
  forgetLocalData(): void;
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

let sync: PlanSync | null = null;
let initOnce: Promise<void> | null = null;

export const usePlan = create<PlanStore>((set, get) => {
  const persist = () => {
    const { curriculum, state, settings, remote } = get();
    if (!curriculum || !state) return;
    if (remote) sync?.schedule();
    else void repository.save(curriculum.id, state, settings);
  };

  function startSync(planId: string, version: number) {
    sync?.stop();
    sync = createPlanSync({
      planId,
      version,
      read: () => {
        const { state, settings } = get();
        return { state: state as PlanState, settings };
      },
      onStatus: (saveStatus) => set({ saveStatus }),
      onConflict: (server) => {
        const { state, settings } = get();
        set({ conflict: { kind: "remote", mine: state as PlanState, mineSettings: settings, server } });
      },
    });
    return sync;
  }

  /** เปิดแผนในบัญชี และจัดการกรณีที่มีข้อมูลค้างอยู่ในเครื่องนี้ */
  async function openRemote(curriculum: Curriculum) {
    const stored = await repository.load(curriculum.id);
    const local = stored.plan ? normalizePlan(curriculum, stored.plan) : null;
    const localHasProgress = !!local && hasProgress(curriculum, local);
    const existing = (await listPlans()).find((p) => p.curriculumId === curriculum.id);

    if (!existing) {
      const created = await createPlan({
        curriculumId: curriculum.id,
        name: DEFAULT_PLAN_NAME,
        ...(localHasProgress ? { state: local, settings: stored.settings } : {}),
      });
      if (localHasProgress) {
        await repository.clear(curriculum.id);
        useUi.getState().showToast({ text: "ย้ายแผนจากเบราว์เซอร์นี้เข้าบัญชีแล้ว" });
      }
      return {
        plan: created,
        state: created.state as PlanState,
        settings: created.settings,
        conflict: null,
        resume: false,
      };
    }

    const server = await getPlan(existing.id);
    const serverState = server.state as PlanState;
    const base = { plan: server, state: serverState, settings: server.settings, conflict: null, resume: false };

    const draft = readDraft(server.id);
    if (draft) {
      const mine = normalizePlan(curriculum, draft.state);
      if (draft.baseVersion === server.version) return { ...base, state: mine, settings: draft.settings, resume: true };
      if (samePlan(mine, serverState)) {
        clearDraft(server.id);
        return base;
      }
      return { ...base, conflict: { kind: "draft" as const, mine, mineSettings: draft.settings, server } };
    }

    if (localHasProgress && local) {
      if (samePlan(local, serverState)) {
        await repository.clear(curriculum.id);
        return base;
      }
      return { ...base, conflict: { kind: "local" as const, mine: local, mineSettings: stored.settings, server } };
    }
    return base;
  }

  return {
    entries: [],
    curriculum: null,
    state: null,
    settings: defaultSettings,
    notices: [],
    past: [],
    future: [],
    remote: null,
    saveStatus: "local",
    conflict: null,

    init() {
      // StrictMode เรียก effect สองครั้งตอนพัฒนา ถ้าเรียกซ้ำจริงจะสร้างแผนซ้ำได้
      initOnce ??= (async () => {
        const source = await curriculumSource();
        const entries = await source.list();
        const first = entries[0];
        if (!first) throw new Error("ไม่พบรายชื่อหลักสูตร");
        set({ entries });
        await get().loadCurriculum(first.id);
      })().catch((err) => {
        initOnce = null;
        throw err;
      });
      return initOnce;
    },

    async loadCurriculum(id) {
      await sync?.flush();
      sync?.stop();
      sync = null;
      const source = await curriculumSource();
      const [curriculum, notices] = await Promise.all([source.curriculum(id), source.notices(id)]);
      const me = accountsEnabled ? await queryClient.fetchQuery(meQuery) : null;

      if (me?.user) {
        const opened = await openRemote(curriculum);
        set({
          curriculum,
          notices,
          state: opened.state,
          settings: opened.settings,
          past: [],
          future: [],
          remote: { id: opened.plan.id, name: opened.plan.name },
          saveStatus: "saved",
          conflict: opened.conflict,
        });
        const started = startSync(opened.plan.id, opened.plan.version);
        if (opened.resume) started.schedule();
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
          remote: null,
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
      const { conflict, curriculum, remote } = get();
      if (!conflict || !curriculum || !remote) return;
      const { kind, mine, mineSettings, server } = conflict;
      sync?.rebase(server.version);
      if (kind === "local") void repository.clear(curriculum.id);
      if (choice === "mine") {
        set({ state: mine, settings: mineSettings, past: [], future: [], conflict: null });
        sync?.schedule();
      } else {
        clearDraft(remote.id);
        set({
          state: server.state as PlanState,
          settings: server.settings,
          past: [],
          future: [],
          conflict: null,
          saveStatus: "saved",
        });
      }
    },

    async flushSaves() {
      return sync ? sync.flush() : true;
    },

    forgetLocalData() {
      const { curriculum, remote } = get();
      sync?.stop();
      if (remote) clearDraft(remote.id);
      if (curriculum) void repository.clear(curriculum.id);
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
