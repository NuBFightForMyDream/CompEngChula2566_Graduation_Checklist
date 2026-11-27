import { creditSummary, graduationStatus } from "@cp/core";
import { useRef } from "react";
import { graduationText } from "../../lib/messages.ts";
import { useModel, usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";
import { download } from "./download.ts";
import { exportPng } from "./exportPng.ts";
import { printPage } from "./print.ts";

const nextFrame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));

export function exportBackup() {
  const file = usePlan.getState().toFile();
  download(
    new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }),
    `graduation-plan-${file.curriculumId}.json`,
  );
}

export function ExportMenu() {
  const m = useModel();
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute("open");

  /** ลูกศรและการ์ดต้องแสดงอยู่บนจอจึงวัดตำแหน่งได้ */
  const showBoard = async () => {
    const ui = useUi.getState();
    ui.setTab("board");
    ui.select(null);
    await nextFrame();
  };

  const header = () => {
    const sum = creditSummary(m);
    const status = sum.complete
      ? graduationText(graduationStatus(m)).title.replace("🎓 ", "")
      : `เหลืออีก ${sum.remaining}`;
    return {
      title: `Graduation Roadmap · ${m.curriculum.name}`,
      subtitle: `ผ่านแล้ว ${sum.earned}/${m.curriculum.totalCredits} หน่วยกิต · ${status} · บันทึกเมื่อ ${new Date().toLocaleDateString("th-TH")}`,
    };
  };

  const png = async () => {
    close();
    await showBoard();
    const ui = useUi.getState();
    try {
      await exportPng({ ...header(), fileName: `roadmap-${m.curriculum.id}.png` });
      ui.showToast({ text: "บันทึกรูปแล้ว" });
    } catch (err) {
      ui.showToast({ text: `สร้างรูปไม่สำเร็จ: ${(err as Error).message}`, bad: true });
    }
  };

  /** PDF ผ่านหน้าต่างพิมพ์ของเบราว์เซอร์: A4 แนวนอน 2 หน้า ตาม print.css */
  const pdf = async () => {
    close();
    await showBoard();
    printPage();
  };

  return (
    <details ref={ref} className="menu">
      <summary className="btn">บันทึก</summary>
      <div className="menu-list">
        <button type="button" onClick={png}>
          รูปภาพ (PNG)
        </button>
        <button type="button" onClick={pdf}>
          เอกสาร (PDF)
        </button>
        <button
          type="button"
          onClick={() => {
            close();
            exportBackup();
          }}
        >
          ไฟล์สำรองข้อมูล (JSON)
        </button>
      </div>
    </details>
  );
}
