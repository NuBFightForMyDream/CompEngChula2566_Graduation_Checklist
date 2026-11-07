import type { Grade, PlanModel, PlanState } from "@cp/core";
import { modelOf, usePlan } from "../../stores/planStore.ts";
import { Modal } from "../common/Modal.tsx";

const TEXT = {
  local: {
    title: "พบแผนสองฉบับ",
    intro: "เบราว์เซอร์นี้มีแผนที่ทำไว้ก่อนเข้าสู่ระบบ และในบัญชีก็มีแผนอยู่แล้ว ฉบับที่ไม่ได้เลือกจะถูกลบ",
    mine: "ใช้แผนในเบราว์เซอร์นี้",
    server: "ใช้แผนในบัญชี",
  },
  draft: {
    title: "แผนในบัญชีถูกแก้จากที่อื่น",
    intro: "เครื่องนี้มีการแก้ไขที่ยังส่งไม่สำเร็จ แต่ระหว่างนั้นมีการบันทึกจากเครื่องอื่น ฉบับที่ไม่ได้เลือกจะถูกลบ",
    mine: "ใช้ฉบับที่แก้ในเครื่องนี้",
    server: "ใช้ฉบับล่าสุดในบัญชี",
  },
  remote: {
    title: "แผนนี้ถูกแก้จากเครื่องอื่น",
    intro: "มีการบันทึกจากเครื่องอื่นระหว่างที่คุณกำลังแก้ ฉบับที่ไม่ได้เลือกจะถูกลบ",
    mine: "ใช้ฉบับที่แก้ในเครื่องนี้",
    server: "ใช้ฉบับล่าสุดในบัญชี",
  },
};

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
  const text = TEXT[conflict.kind];
  const server = conflict.server.state as PlanState;
  const savedAt = new Date(conflict.server.updatedAt).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <Modal title={text.title} onClose={() => {}} dismissible={false}>
      <div className="form" data-testid="plan-conflict">
        <p className="small">{text.intro}</p>
        <div className="conflict-options">
          <Option
            title={text.mine}
            model={modelOf(curriculum, conflict.mine)}
            other={server}
            onClick={() => resolve("mine")}
          />
          <Option
            title={text.server}
            model={modelOf(curriculum, server)}
            other={conflict.mine}
            note={`บันทึกเมื่อ ${savedAt}`}
            onClick={() => resolve("server")}
          />
        </div>
      </div>
    </Modal>
  );
}
