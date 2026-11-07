import { availableCourses, remainingPlan } from "@cp/core";
import { useCallback, useEffect, useState } from "react";
import { AccountMenu } from "../features/account/AccountMenu.tsx";
import { PlanConflictDialog } from "../features/account/PlanConflictDialog.tsx";
import { SaveStatus } from "../features/account/SaveStatus.tsx";
import { AddCourseDialog } from "../features/board/AddCourseDialog.tsx";
import { Board } from "../features/board/Board.tsx";
import { BoardToolbar } from "../features/board/BoardToolbar.tsx";
import { ConflictBanner } from "../features/board/ConflictBanner.tsx";
import { Toast } from "../features/common/Toast.tsx";
import { CourseDrawer } from "../features/course-info/CourseDrawer.tsx";
import { ExportMenu } from "../features/export/ExportMenu.tsx";
import { enterPrint, exitPrint } from "../features/export/print.ts";
import { GradeImportDialog } from "../features/grades/GradeImportDialog.tsx";
import { Notices } from "../features/notices/Notices.tsx";
import { AvailableList, PlanSuggestion } from "../features/planner/CourseLists.tsx";
import { HelpDialog } from "../features/settings/HelpDialog.tsx";
import { SettingsDialog } from "../features/settings/SettingsDialog.tsx";
import { ProgressOverview } from "../features/summary/ProgressOverview.tsx";
import { WelcomeCard } from "../features/summary/WelcomeCard.tsx";
import { useModel, usePlan } from "../stores/planStore.ts";
import { type Tab, useUi } from "../stores/uiStore.ts";

function TopBar() {
  const m = useModel();
  const undo = usePlan((s) => s.undo);
  const redo = usePlan((s) => s.redo);
  const canUndo = usePlan((s) => s.past.length > 0);
  const canRedo = usePlan((s) => s.future.length > 0);
  const entries = usePlan((s) => s.entries);
  const loadCurriculum = usePlan((s) => s.loadCurriculum);
  const openDialog = useUi((s) => s.openDialog);
  return (
    <header className="topbar">
      <div className="brand">
        <h1>Graduation Roadmap</h1>
        {entries.length > 1 ? (
          <select aria-label="หลักสูตร" value={m.curriculum.id} onChange={(e) => void loadCurriculum(e.target.value)}>
            {entries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <p>{m.curriculum.name}</p>
        )}
      </div>
      <div className="top-actions">
        <SaveStatus />
        <div className="btn-group">
          <button
            type="button"
            className="icon-btn"
            aria-label="เลิกทำ"
            title="เลิกทำ"
            disabled={!canUndo}
            onClick={undo}
          >
            ↶
          </button>
          <button type="button" className="icon-btn" aria-label="ทำซ้ำ" title="ทำซ้ำ" disabled={!canRedo} onClick={redo}>
            ↷
          </button>
        </div>
        <button type="button" className="primary" onClick={() => openDialog("grades")}>
          กรอกเกรด
        </button>
        <ExportMenu />
        <button type="button" onClick={() => openDialog("settings")}>
          ตั้งค่า
        </button>
        <AccountMenu />
      </div>
    </header>
  );
}

function Workspace() {
  const m = useModel();
  const tab = useUi((s) => s.tab);
  const setTab = useUi((s) => s.setTab);
  const dialog = useUi((s) => s.dialog);
  const notices = usePlan((s) => s.notices);
  const tabs: [Tab, string][] = [
    ["board", "ตารางเรียน"],
    ["available", `ลงได้ตอนนี้ (${availableCourses(m).length})`],
    ["plan", `แผนแนะนำ (${remainingPlan(m).filter((t) => t.term.length).length} เทอม)`],
    ["notices", `ประกาศ (${notices.length})`],
  ];
  return (
    <>
      <TopBar />
      <main className="wrap">
        <ProgressOverview />
        <WelcomeCard />
        <ConflictBanner />
        <div className="tabs" role="tablist" aria-label="มุมมอง">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "tab on" : "tab"}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <section className="tab-panel" data-panel="board" hidden={tab !== "board"}>
          <BoardToolbar />
          <Board visible={tab === "board"} />
        </section>
        <section className="tab-panel" data-panel="available" hidden={tab !== "available"}>
          <AvailableList />
        </section>
        <section className="tab-panel" data-panel="plan" hidden={tab !== "plan"}>
          <PlanSuggestion />
        </section>
        <section className="tab-panel" data-panel="notices" hidden={tab !== "notices"}>
          <Notices />
        </section>
        <footer className="foot">
          <p>{m.curriculum.note}</p>
        </footer>
      </main>
      <CourseDrawer />
      <PlanConflictDialog />
      <AddCourseDialog />
      {dialog === "grades" && <GradeImportDialog />}
      {dialog === "settings" && <SettingsDialog />}
      {dialog === "help" && <HelpDialog />}
      <Toast />
    </>
  );
}

export function App() {
  const ready = usePlan((s) => !!s.curriculum);
  const init = usePlan((s) => s.init);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(() => {
    setError(null);
    init().catch((err: Error) => setError(err.message));
  }, [init]);

  useEffect(start, [start]);

  // ขากลับจากหน้า login: แจ้งผล แล้วล้าง query ออกจาก URL
  useEffect(() => {
    const url = new URL(window.location.href);
    const login = url.searchParams.get("login");
    if (!login) return;
    url.searchParams.delete("login");
    window.history.replaceState(null, "", url);
    useUi.getState().showToast({
      text: login === "unavailable" ? "ระบบเข้าสู่ระบบยังไม่เปิดใช้งาน" : "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่",
      bad: true,
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
        useUi.getState().select(null);
        return;
      }
      const target = e.target as HTMLElement;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || target.matches("input, textarea, select")) return;
      e.preventDefault();
      const { undo, redo } = usePlan.getState();
      if (e.shiftKey) redo();
      else undo();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("beforeprint", enterPrint);
    window.addEventListener("afterprint", exitPrint);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeprint", enterPrint);
      window.removeEventListener("afterprint", exitPrint);
    };
  }, []);

  if (error) {
    return (
      <div className="load-error" role="alert">
        <p>โหลดข้อมูลหลักสูตรไม่สำเร็จ: {error}</p>
        <button type="button" onClick={start}>
          ลองใหม่
        </button>
      </div>
    );
  }
  if (!ready) return <p className="load-state">กำลังโหลดหลักสูตร…</p>;
  return <Workspace />;
}
