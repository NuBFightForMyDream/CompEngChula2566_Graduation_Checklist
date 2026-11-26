import type { Grade, PlanModel, PlanState } from "@cp/core";
import { modelOf, usePlan } from "../../stores/planStore.ts";
import { Modal } from "../common/Modal.tsx";

const MAX_LISTED = 4;

const listed = (labels: string[]) =>
  labels.length > MAX_LISTED
    ? `${labels.slice(0, MAX_LISTED).join(", ")} และอีก ${labels.length - MAX_LISTED} วิชา`
    : labels.join(", ");

/** สิ่งที่มีเฉพาะในฉบับนี้ จำนวนรวมอย่างเดียวบอกไม่ได้ว่าสองฉบับต่างกันตรงไหน */
function differences(m: PlanModel, other: PlanState) {
  const otherPassed = new Set(other.passed);
  const known = (id: string) => m.graph.courses.has(id);
  const passedOnly = m.state.passed.filter((id) => !otherPassed.has(id) && known(id));
  const gradesDiffer = Object.entries(m.state.grades).filter(
    ([id, grade]) => other.grades[id] !== (grade as Grade) && known(id),
  );
  const moved = Object.entries(m.state.place).filter(
    ([id, sem]) => other.place[id] !== undefined && other.place[id] !== sem,
  );
  const lines: string[] = [];
  if (passedOnly.length) lines.push(`ผ่านเพิ่ม: ${listed(passedOnly.map(m.label))}`);
  if (gradesDiffer.length) {
    lines.push(`เกรดต่างกัน: ${listed(gradesDiffer.map(([id, grade]) => `${m.label(id)} (${grade})`))}`);
  }
  if (moved.length) lines.push(`เทอมต่างกัน ${moved.length} วิชา`);
  return lines;
}

function Option({
  title,
  model,
  other,
  note,
  onClick,
}: {
  title: string;
  model: PlanModel;
  other: PlanState;
  note?: string;
  onClick(): void;
}) {
  const lines = differences(model, other);
  return (
    <button type="button" className="conflict-option" onClick={onClick}>
      <b>{title}</b>
      <small>
        ผ่านแล้ว {model.state.passed.length} วิชา · มีเกรด {Object.keys(model.state.grades).length} วิชา
        {note ? ` · ${note}` : ""}
      </small>
      {lines.map((line) => (
        <small key={line} className="conflict-diff">
          {line}
        </small>
      ))}
    </button>
  );
}

export function PlanConflictDialog() {
  const conflict = usePlan((s) => s.conflict);
  const curriculum = usePlan((s) => s.curriculum);
  const resolve = usePlan((s) => s.resolveConflict);
  if (!conflict || !curriculum) return null;
  const server = conflict.server.state;
  const savedAt = conflict.server.updatedAt?.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  return (
    <Modal title="พบแผนสองฉบับ" onClose={() => {}} dismissible={false}>
      <div className="form" data-testid="plan-conflict">
        <p className="small">เบราว์เซอร์นี้มีแผนที่ทำไว้ก่อนเข้าสู่ระบบ และในบัญชีก็มีแผนอยู่แล้ว ฉบับที่ไม่ได้เลือกจะถูกลบ</p>
        <div className="conflict-options">
          <Option
            title="ใช้แผนในเบราว์เซอร์นี้"
            model={modelOf(curriculum, conflict.mine)}
            other={server}
            onClick={() => resolve("mine")}
          />
          <Option
            title="ใช้แผนในบัญชี"
            model={modelOf(curriculum, server)}
            other={conflict.mine}
            note={savedAt && `บันทึกเมื่อ ${savedAt}`}
            onClick={() => resolve("server")}
          />
        </div>
      </div>
    </Modal>
  );
}
