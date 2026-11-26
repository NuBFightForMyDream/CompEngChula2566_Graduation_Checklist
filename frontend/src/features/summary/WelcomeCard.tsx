import { sampleYear1 } from "@cp/core";
import { useState } from "react";
import { useModel, usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";

const KEY = "cp:welcome-dismissed";

const wasDismissed = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export function WelcomeCard() {
  const m = useModel();
  const commit = usePlan((s) => s.commit);
  const openDialog = useUi((s) => s.openDialog);
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (dismissed || m.passed.size || Object.keys(m.state.grades).length) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // ไม่จำก็ไม่เป็นไร ครั้งหน้าการ์ดจะแสดงอีกครั้ง
    }
  };

  return (
    <section className="welcome" data-testid="welcome">
      <div className="welcome-head">
        <h2>เริ่มต้นใน 3 ขั้นตอน</h2>
        <button type="button" className="icon-btn" aria-label="ซ่อนคำแนะนำ" onClick={dismiss}>
          ✕
        </button>
      </div>
      <ol>
        <li>
          <b>บอกว่าเรียนอะไรผ่านแล้ว</b> กดวงกลมบนการ์ด หรือวางเกรดทีเดียวหลายวิชา
        </li>
        <li>
          <b>เลือกวิชาเลือก</b> กดการ์ด "ยังไม่ได้เลือกวิชา" ระบบจะเช็กวิชาบังคับก่อนและเทอมที่เปิดให้
        </li>
        <li>
          <b>ลากการ์ดเพื่อจัดแผน</b> ถ้าย้ายวิชา วิชาที่ต่อเนื่องจะเลื่อนตามให้เอง
        </li>
      </ol>
      <div className="actions">
        <button type="button" className="primary" onClick={() => openDialog("grades")}>
          กรอกเกรดหลายวิชา
        </button>
        <button type="button" onClick={() => commit(sampleYear1(m), "ใส่ตัวอย่าง: ผ่านวิชาปี 1 ทั้งหมด")}>
          ลองดูตัวอย่าง
        </button>
      </div>
    </section>
  );
}
