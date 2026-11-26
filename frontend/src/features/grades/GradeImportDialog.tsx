import { importGrades } from "@cp/core";
import { type FormEvent, useState } from "react";
import { useModel, usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";
import { Modal } from "../common/Modal.tsx";

export function GradeImportDialog() {
  const m = useModel();
  const commit = usePlan((s) => s.commit);
  const openDialog = useUi((s) => s.openDialog);
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ text: string; bad: boolean } | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = importGrades(m, text);
    if (r.done) commit(r.state);
    const parts = [`ใส่เกรดแล้ว ${r.done} วิชา`];
    if (r.failed.length) parts.push(`ใส่ไม่ได้เพราะยังไม่ผ่านวิชาบังคับก่อน: ${r.failed.map(m.label).join(", ")}`);
    if (r.unknown.length) parts.push(`ไม่พบรหัสในหลักสูตร: ${r.unknown.join(", ")} (เพิ่มด้วยปุ่ม "+ เพิ่มวิชา" ได้)`);
    setResult({ text: parts.join(" · "), bad: r.failed.length + r.unknown.length > 0 });
  };

  return (
    <Modal title="กรอกเกรดหลายวิชา" onClose={() => openDialog(null)}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">วางรหัสวิชาตามด้วยเกรด บรรทัดละวิชา หรือวางรูปแบบ {'{"2110101","A"}'} จากโค้ด C++ ก็ได้</p>
        <textarea
          rows={8}
          aria-label="รหัสวิชาและเกรด"
          placeholder={"2110101 A\n2301107 C+\n2304103 B\n2100301 S"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        {result && (
          <p className={result.bad ? "bad-text small" : "ok-text small"} role="status">
            {result.text}
          </p>
        )}
        <div className="actions end">
          <button type="button" onClick={() => openDialog(null)}>
            ปิด
          </button>
          <button type="submit" className="primary" disabled={!text.trim()}>
            ใส่เกรด
          </button>
        </div>
      </form>
    </Modal>
  );
}
