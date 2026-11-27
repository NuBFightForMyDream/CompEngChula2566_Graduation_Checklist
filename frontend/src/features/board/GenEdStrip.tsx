// แถว GenEd ที่เลือกเรียนเอง แยกจากคอลัมน์เทอมเพื่อไม่ให้ตารางหลักรก
// ยังอยู่ใน #board จึงติดไปกับรูปที่ export และหน้าที่พิมพ์ด้วย

import { ALL_TERMS, inGenEdRow, moveCourse, offeredIn, semIdx, togglePassed } from "@cp/core";
import { semName } from "../../lib/messages.ts";
import { useModel, usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";
import { cardStyle } from "./CourseCard.tsx";

interface Props {
  focusId: string | null;
  query: string;
}

export function GenEdStrip({ focusId, query }: Props) {
  const m = useModel();
  const dispatch = usePlan((s) => s.dispatch);
  const autoShift = usePlan((s) => s.settings.autoShift);
  const select = useUi((s) => s.select);
  const setAdding = useUi((s) => s.setAdding);
  const semOf = (id: string) => m.state.place[id] ?? "1/1";
  const picks = m.courses
    .filter((c) => inGenEdRow(c, m.state.place))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => semIdx(semOf(a.c.id)) - semIdx(semOf(b.c.id)) || a.i - b.i)
    .map(({ c }) => c);
  if (!picks.length) return null;
  const passedCredits = picks.filter((c) => m.passed.has(c.id)).reduce((s, c) => s + m.creditsOf(c.id), 0);
  const totalCredits = picks.reduce((s, c) => s + m.creditsOf(c.id), 0);

  return (
    <section className="gened-strip" aria-label="GenEd ที่เลือกเรียน" data-testid="gened-strip">
      <div className="gened-head">
        <b>GenEd ที่เลือกเรียน</b>
        <span className="gened-count">
          ผ่านแล้ว {passedCredits}/{totalCredits} หน่วยกิต
        </span>
        <span className="gened-hint">กดการ์ดเพื่อกรอกวิชา · หน่วยกิตนับรวมในเทอมที่เลือก</span>
      </div>
      <div className="gened-row">
        {picks.map((c) => {
          const { id } = c;
          const filled = !!m.state.choices[id] || !!c.extra;
          const status = m.statusOf(id);
          const grade = m.state.grades[id];
          const text = `${m.codeOf(id)} ${m.nameOf(id)}`.toLowerCase();
          const className = [
            "card",
            "gened-card",
            status,
            !filled && "unset-slot",
            c.extra && "extra-card",
            focusId === id && "hl-self",
            query && !text.includes(query) && "dim",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={id} className="gened-item">
              <div className={className} data-id={id} data-testid={`card-${id}`} style={cardStyle(m, c)}>
                <button
                  type="button"
                  className="sel"
                  onClick={() => select(useUi.getState().selectedId === id ? null : id)}
                >
                  <span className="slot-tag">{semName(semOf(id))}</span>
                  <span className="nm">{filled ? m.nameOf(id) : "ยังไม่ได้กรอกวิชา"}</span>
                  <span className="cd">
                    <span>
                      {filled ? m.codeOf(id) : "GenEd"} ({m.creditsOf(id)})
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="tick"
                  data-grade={grade}
                  data-status={status}
                  aria-label={`${status === "passed" ? "ยกเลิกผ่าน" : "ติ๊กว่าผ่าน"} ${m.label(id)}`}
                  aria-pressed={status === "passed"}
                  title={grade ? `เกรด ${grade}` : undefined}
                  onClick={() => dispatch((model) => togglePassed(model, id))}
                />
              </div>
              <select
                aria-label={`เทอมที่เรียน ${m.label(id)}`}
                value={semOf(id)}
                onChange={(e) => dispatch((model) => moveCourse(model, id, e.target.value, { autoShift }))}
              >
                {ALL_TERMS.map((s) => (
                  <option key={s} value={s} disabled={!offeredIn(c, s)}>
                    {semName(s)}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        <div className="add-slot gened-add">
          <button type="button" className="add-btn" onClick={() => setAdding("1/1", "gened")}>
            + เพิ่ม GenEd
          </button>
        </div>
      </div>
    </section>
  );
}
