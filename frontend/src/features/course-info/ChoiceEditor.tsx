import { type Choice, type Course, type PoolOption, setChoice } from "@cp/core";
import { type FormEvent, useState } from "react";
import { offeredText } from "../../lib/messages.ts";
import { useModel, usePlan } from "../../stores/planStore.ts";

const CUSTOM = "__custom";

/** เลือกวิชาให้ช่อง ELECTIVE / APPROVED / 21ST / FREE */
export function ChoiceEditor({ course }: { course: Course }) {
  const m = useModel();
  const dispatch = usePlan((s) => s.dispatch);
  const autoShift = usePlan((s) => s.settings.autoShift);
  const pool = course.pool ? m.curriculum.pools?.[course.pool] : undefined;
  const choice = m.state.choices[course.id];
  const isCustom = !!choice && choice.id === null;
  const [showCustom, setShowCustom] = useState(false);
  const [code, setCode] = useState(isCustom ? choice.code : "");
  const [name, setName] = useState(isCustom ? choice.name : "");
  const [credits, setCredits] = useState(isCustom ? choice.credits : course.credits);
  if (!pool) return null;

  const used = new Set(
    Object.entries(m.state.choices)
      .filter(([slot]) => slot !== course.id)
      .map(([, v]) => v.id)
      .filter(Boolean),
  );
  const apply = (next: Choice | null) => dispatch((model) => setChoice(model, course.id, next, { autoShift }));
  const optionText = (o: PoolOption) => {
    const prereq = o.prereq?.length ? ` · ต้องผ่าน ${o.prereq.join(", ")}` : "";
    const taken = used.has(o.id) ? " · เลือกในช่องอื่นแล้ว" : "";
    return `${o.code} ${o.name} (${o.credits}) · ${offeredText(o.offered)}${prereq}${taken}`;
  };
  const value = showCustom || isCustom ? CUSTOM : (choice?.id ?? "");

  const onSelect = (v: string) => {
    if (v === CUSTOM) {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const o = pool.options.find((x) => x.id === v);
    apply(o ? { id: o.id, code: o.code, name: o.name, credits: o.credits } : null);
  };

  const onCustom = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim() && name.trim()) apply({ id: null, code: code.trim(), name: name.trim(), credits });
  };

  return (
    <section className="choose">
      <label htmlFor="choice-sel">
        <b>เลือกวิชาสำหรับช่องนี้</b>
      </label>
      <select id="choice-sel" value={value} onChange={(e) => onSelect(e.target.value)}>
        <option value="">— ยังไม่เลือก —</option>
        {pool.options.map((o) => (
          <option key={o.id} value={o.id} disabled={used.has(o.id)}>
            {optionText(o)}
          </option>
        ))}
        <option value={CUSTOM}>กรอกรหัสและชื่อวิชาเอง…</option>
      </select>
      {value === CUSTOM && (
        <form className="form compact" onSubmit={onCustom}>
          <label>
            รหัสวิชา
            <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} required />
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
          <button type="submit">บันทึก</button>
        </form>
      )}
      <p className="muted small">
        {pool.label}
        {pool.note ? ` · ${pool.note}` : ""}
      </p>
    </section>
  );
}
