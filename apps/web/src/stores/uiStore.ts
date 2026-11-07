// สถานะหน้าจอที่ไม่ต้องบันทึก: วิชาที่เลือก, แท็บ, การค้นหา, ข้อความแจ้งผล

import { create } from "zustand";

export type Tab = "board" | "available" | "plan" | "notices";
export type DialogName = "grades" | "settings" | "help" | null;

export interface Toast {
  id: number;
  text: string;
  bad?: boolean;
  undo?: boolean;
}

interface UiStore {
  tab: Tab;
  selectedId: string | null;
  hoverId: string | null;
  dragId: string | null;
  addingSem: string | null;
  search: string;
  dialog: DialogName;
  toast: Toast | null;
  setTab(tab: Tab): void;
  select(id: string | null): void;
  setHover(id: string | null): void;
  setDrag(id: string | null): void;
  setAdding(sem: string | null): void;
  setSearch(q: string): void;
  openDialog(d: DialogName): void;
  showToast(t: Omit<Toast, "id"> | null): void;
}

let toastId = 0;

export const useUi = create<UiStore>((set) => ({
  tab: "board",
  selectedId: null,
  hoverId: null,
  dragId: null,
  addingSem: null,
  search: "",
  dialog: null,
  toast: null,
  setTab: (tab) => set({ tab }),
  select: (selectedId) => set({ selectedId, hoverId: null }),
  setHover: (hoverId) => set({ hoverId }),
  setDrag: (dragId) => set({ dragId, hoverId: null }),
  setAdding: (addingSem) => set({ addingSem }),
  setSearch: (search) => set({ search }),
  openDialog: (dialog) => set({ dialog }),
  showToast: (t) => set({ toast: t ? { ...t, id: ++toastId } : null }),
}));
