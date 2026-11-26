import { addExtra, EXTRA_CATEGORY, extraCategories } from "@cp/core";
import { type FormEvent, useState } from "react";
import { semName } from "../../lib/messages.ts";
import { useModel, usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";
import { Modal } from "../common/Modal.tsx";

export const categoryLabel = (m: ReturnType<typeof useModel>, key: string) =>
  key === EXTRA_CATEGORY ? "นอกหลักสูตร (ไม่นับ)" : (m.curriculum.categories[key]?.label ?? key);

export function AddCourseDialog() {
  const m = useModel();
  const sem = useUi((s) => s.addingSem);
  const setAdding = useUi((s) => s.setAdding);
  const select = useUi((s) => s.select);
  const dispatch = usePlan((s) => s.dispatch);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [credits, setCredits] = useState(3);
  const [category, setCategory] = useState("free");
  if (!sem) return null;

  const close = () => {
    setAdding(null);
    setCode("");
    setName("");
    setCredits(3);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    const id = `X-${crypto.randomUUID().slice(0, 8)}`;
    dispatch((model) =>
      addExtra(model, { id, code: code.trim(), name: name.trim(), credits, category, semester: sem }),
    );
    select(id);
    close();
  };

  return (
    <Modal title={`เพิ่มวิชาใน${semName(sem)}`} onClose={close}>
      <form className="form" onSubmit={submit}>
        <label>
          รหัสวิชา
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} required autoFocus />
        </label>
        <label>
          ชื่อวิชา
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        </label>
        <label>
          หน่วยกิต
          <input
            type="number"
            min={1}
            max={6}
            value={credits}
            onChange={(e) => setCredits(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
            required
          />
        </label>
        <label>
          นับเข้าหมวด
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {extraCategories(m.curriculum).map((k) => (
              <option key={k} value={k}>
                {categoryLabel(m, k)}
              </option>
            ))}
          </select>
        </label>
        <div className="actions end">
          <button type="button" onClick={close}>
            ยกเลิก
          </button>
          <button type="submit" className="primary">
            เพิ่มวิชา
          </button>
        </div>
      </form>
    </Modal>
  );
}
