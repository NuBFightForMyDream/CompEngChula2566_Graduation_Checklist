import {
  affected,
  defaultSemOf,
  extraCategories,
  GRADES,
  moveCourse,
  offeredIn,
  prereqChain,
  removeExtra,
  SEMS,
  setExtraCategory,
  setGrade,
  shiftCourses,
  togglePassed,
} from "@cp/core";
import { useEffect } from "react";
import { offeredText, semName } from "../../lib/messages.ts";
import { useModel, usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";
import { categoryLabel } from "../board/AddCourseDialog.tsx";
import { ChoiceEditor } from "./ChoiceEditor.tsx";

const STATUS_TEXT = { passed: "ผ่านแล้ว", available: "ลงได้ตอนนี้", locked: "ยังล็อก" } as const;

function CourseLinks({ ids, empty }: { ids: Set<string>; empty: string }) {
  const m = useModel();
  const select = useUi((s) => s.select);
  if (!ids.size) return <p className="muted small">{empty}</p>;
  return (
    <ul className="links">
      {m.order
        .filter((id) => ids.has(id))
        .map((id) => (
          <li key={id}>
            <button type="button" className={`link-chip ${m.statusOf(id)}`} onClick={() => focusCourse(id, select)}>
              {m.label(id)}
            </button>
          </li>
        ))}
    </ul>
  );
}

function focusCourse(id: string, select: (id: string) => void) {
  select(id);
  document
    .querySelector(`.card[data-id="${CSS.escape(id)}"]`)
    ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}

export function CourseDrawer() {
  const m = useModel();
  const selectedId = useUi((s) => s.selectedId);
  const select = useUi((s) => s.select);
  const dispatch = usePlan((s) => s.dispatch);
  const autoShift = usePlan((s) => s.settings.autoShift);
  const id = selectedId && m.graph.courses.has(selectedId) ? selectedId : null;

  useEffect(() => {
    document.documentElement.classList.toggle("has-drawer", !!id);
    return () => document.documentElement.classList.remove("has-drawer");
  }, [id]);

  if (!id) return null;
  const course = m.course(id);
  const status = m.statusOf(id);
  const grade = m.state.grades[id];
  const place = m.state.place[id] as string;
  const pre = prereqChain(m.graph.prereqs, id);
  const post = affected(m.graph.unlocks, id);
  const mine = m.conflicts.filter(([p, v]) => p === id || v === id);
  const category = m.curriculum.categories[course.category];

  return (
    <aside className="drawer" aria-label="รายละเอียดวิชา" data-testid="drawer">
      <header className="drawer-head">
        <div>
          <span className="code">{m.codeOf(id)}</span>
          <h2>{m.nameOf(id)}</h2>
        </div>
        <button type="button" className="icon-btn" aria-label="ปิดรายละเอียดวิชา" onClick={() => select(null)}>
          ✕
        </button>
      </header>

      <div className="drawer-body">
        <div className="facts">
          <span className={`badge ${status}`}>{STATUS_TEXT[status]}</span>
          <span>{m.creditsOf(id)} หน่วยกิต</span>
          <span>{category?.label ?? "นอกหลักสูตร"}</span>
          <span>{offeredText(course.offered)}</span>
        </div>

        <button
          type="button"
          className={status === "passed" ? "wide-btn" : "wide-btn primary"}
          aria-disabled={status === "locked"}
          onClick={() => dispatch((model) => togglePassed(model, id))}
        >
          {status === "passed" ? "ยกเลิกการผ่าน" : "ติ๊กว่าผ่านแล้ว"}
        </button>

        {course.pool && <ChoiceEditor key={id} course={course} />}

        <section>
          <h3>เกรด</h3>
          <fieldset className="grade-row" aria-label="เกรด">
            {GRADES.map((gr) => (
              <button
                key={gr}
                type="button"
                className={`grade-chip${grade === gr ? " on" : ""}`}
                aria-pressed={grade === gr}
                onClick={() => dispatch((model) => setGrade(model, id, gr))}
              >
                {gr}
              </button>
            ))}
            {grade && (
              <button
                type="button"
                className="grade-chip clear"
                onClick={() => dispatch((model) => setGrade(model, id, null))}
              >
                ล้าง
              </button>
            )}
          </fieldset>
          {status === "locked" && <p className="muted small">ยังล็อกอยู่ ใส่ได้เฉพาะ F / U / W จนกว่าจะผ่านวิชาบังคับก่อน</p>}
        </section>

        <section>
          <h3>เทอมที่วางแผนไว้</h3>
          <div className="actions">
            <select
              aria-label="ย้ายไปเทอม"
              value={place}
              onChange={(e) => dispatch((model) => moveCourse(model, id, e.target.value, { autoShift }))}
            >
              {SEMS.map((s) => (
                <option key={s} value={s} disabled={!offeredIn(course, s)}>
                  {semName(s)}
                  {offeredIn(course, s) ? "" : " · ไม่เปิดสอน"}
                </option>
              ))}
            </select>
            {m.isMoved(id) && (
              <button
                type="button"
                onClick={() => dispatch((model) => moveCourse(model, id, defaultSemOf(course), { autoShift }))}
              >
                คืนเทอมตามแผน ({semName(defaultSemOf(course))})
              </button>
            )}
          </div>
          {mine.map(([p, v]) => (
            <p key={`${p}-${v}`} className="bad-text small">
              {m.label(v)} อยู่ {m.state.place[v]} แต่วิชาบังคับก่อน {m.label(p)} อยู่ {m.state.place[p]}
            </p>
          ))}
          {mine.length > 0 && (
            <button
              type="button"
              className="primary"
              onClick={() => dispatch((model) => shiftCourses(model, new Set([id, ...post])))}
            >
              เลื่อนวิชาที่ต่อเนื่องตามไป
            </button>
          )}
        </section>

        <section>
          <h3>ต้องผ่านก่อน</h3>
          <CourseLinks ids={pre} empty="ไม่มีวิชาบังคับก่อน" />
        </section>
        <section>
          <h3>ถ้าไม่ผ่าน จะกระทบ</h3>
          <CourseLinks ids={post} empty="ไม่กระทบวิชาอื่น" />
        </section>

        {course.extra && (
          <section>
            <h3>วิชาเรียนเพิ่ม</h3>
            <div className="actions">
              <select
                aria-label="นับเข้าหมวด"
                value={course.category}
                onChange={(e) => dispatch((model) => setExtraCategory(model, id, e.target.value))}
              >
                {extraCategories(m.curriculum).map((k) => (
                  <option key={k} value={k}>
                    {categoryLabel(m, k)}
                  </option>
                ))}
              </select>
              <button type="button" className="danger" onClick={() => dispatch((model) => removeExtra(model, id))}>
                ลบวิชานี้
              </button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
