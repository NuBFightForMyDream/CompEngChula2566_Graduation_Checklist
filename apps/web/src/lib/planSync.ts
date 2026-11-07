// บันทึกแผนขึ้นเซิร์ฟเวอร์โดยไม่ให้ข้อมูลหาย
//   1. ทุกการแก้ไขเก็บเป็นฉบับร่างในเบราว์เซอร์ก่อน ปิดแท็บหรือเน็ตหลุดก็ยังอยู่
//   2. รอหยุดแก้ครู่หนึ่งแล้วค่อยส่ง และส่งทีละคำขอเสมอ จึงไม่แข่งกับตัวเอง
//   3. เซิร์ฟเวอร์ล่มหรือเน็ตหลุด ลองใหม่เรื่อย ๆ โดยเว้นช่วงให้นานขึ้น
//   4. เครื่องอื่นบันทึกไปก่อน (409) หยุดส่ง แล้วให้ผู้ใช้เลือก

import { type PlanDetail, type PlanSettings, planConflictSchema, savedPlanSchema } from "@cp/contracts";
import type { PlanState } from "@cp/core";
import { ApiError, sendJson } from "./api.ts";

export type SaveStatus = "local" | "pending" | "saved" | "offline" | "signedOut" | "error";

export interface Draft {
  baseVersion: number;
  state: PlanState;
  settings: PlanSettings;
}

const DEBOUNCE_MS = 800;
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;

const draftKey = (planId: string) => `cp:draft:v1:${planId}`;

export function readDraft(planId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(planId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function clearDraft(planId: string) {
  try {
    localStorage.removeItem(draftKey(planId));
  } catch {
    // อ่านไม่ได้ก็ไม่มีอะไรให้ลบ
  }
}

function writeDraft(planId: string, draft: Draft) {
  try {
    localStorage.setItem(draftKey(planId), JSON.stringify(draft));
  } catch {
    // พื้นที่เต็ม: ยังส่งขึ้นเซิร์ฟเวอร์ได้ตามปกติ
  }
}

interface SyncOptions {
  planId: string;
  version: number;
  read(): { state: PlanState; settings: PlanSettings };
  onStatus(status: SaveStatus): void;
  onConflict(server: PlanDetail): void;
}

export interface PlanSync {
  version(): number;
  schedule(): void;
  /** ส่งที่ค้างอยู่ทันที คืน true ถ้าไม่มีอะไรค้างแล้ว */
  flush(): Promise<boolean>;
  rebase(version: number): void;
  stop(): void;
}

export function createPlanSync({ planId, version: startVersion, read, onStatus, onConflict }: SyncOptions): PlanSync {
  let version = startVersion;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | null = null;
  let retryMs = RETRY_MIN_MS;
  let halted = false;

  const later = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), ms);
  };

  const retryLater = () => {
    onStatus("offline");
    later(retryMs);
    retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
  };

  async function send() {
    const { state, settings } = read();
    dirty = false;
    try {
      const saved = savedPlanSchema.parse(
        await sendJson("PUT", `/api/plans/${encodeURIComponent(planId)}/state`, { version, state, settings }),
      );
      version = saved.version;
      retryMs = RETRY_MIN_MS;
      if (dirty) {
        // มีการแก้ไขเพิ่มระหว่างส่ง ฉบับร่างต้องอ้าง version ใหม่
        const latest = read();
        writeDraft(planId, { baseVersion: version, ...latest });
        later(DEBOUNCE_MS);
      } else {
        clearDraft(planId);
        onStatus("saved");
      }
    } catch (err) {
      dirty = true;
      if (err instanceof ApiError && err.status === 409) {
        const body = planConflictSchema.safeParse(err.body);
        if (body.success) {
          dirty = false;
          halted = true;
          onConflict(body.data.plan as PlanDetail);
          return;
        }
      }
      if (err instanceof ApiError && err.status === 401) {
        // ฉบับร่างยังอยู่ เข้าสู่ระบบใหม่แล้วจะส่งต่อให้
        halted = true;
        onStatus("signedOut");
        return;
      }
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        // ส่งซ้ำก็ไม่ผ่าน จึงหยุดและบอกผู้ใช้ ฉบับร่างยังเก็บไว้
        halted = true;
        onStatus("error");
        return;
      }
      retryLater();
    }
  }

  function run(): Promise<void> {
    if (inFlight) return inFlight;
    if (!dirty || halted) return Promise.resolve();
    clearTimeout(timer);
    inFlight = send().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  const onOnline = () => {
    retryMs = RETRY_MIN_MS;
    void run();
  };
  window.addEventListener("online", onOnline);

  return {
    version: () => version,
    schedule() {
      if (halted) return;
      dirty = true;
      writeDraft(planId, { baseVersion: version, ...read() });
      onStatus("pending");
      later(DEBOUNCE_MS);
    },
    async flush() {
      clearTimeout(timer);
      if (inFlight) await inFlight;
      if (dirty && !halted) await run();
      if (inFlight) await inFlight;
      return !dirty;
    },
    rebase(next) {
      version = next;
      halted = false;
      retryMs = RETRY_MIN_MS;
    },
    stop() {
      clearTimeout(timer);
      halted = true;
      window.removeEventListener("online", onOnline);
    },
  };
}
