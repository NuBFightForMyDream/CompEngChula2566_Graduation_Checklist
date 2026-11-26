import { availableCourses, type Course, remainingPlan } from "@cp/core";
import { courseColor } from "../../lib/colors.ts";
import { semName } from "../../lib/messages.ts";
import { useModel, usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";

function CourseRow({ course, right }: { course: Course; right: string }) {
  const m = useModel();
  const settings = usePlan((s) => s.settings);
  const openCourse = () => {
    const ui = useUi.getState();
    ui.setTab("board");
    ui.select(course.id);
    requestAnimationFrame(() =>
      document
        .querySelector(`.card[data-id="${CSS.escape(course.id)}"]`)
        ?.scrollIntoView({ inline: "center", block: "nearest" }),
    );
  };
  return (
    <li>
      <button type="button" className="row-btn" onClick={openCourse}>
        <i className="dot" style={{ background: courseColor(m.curriculum, settings, course) }} />
        <code>{m.codeOf(course.id)}</code>
        <span>{m.nameOf(course.id)}</span>
        <span className="cr">{right}</span>
      </button>
    </li>
  );
}

export function AvailableList() {
  const m = useModel();
  const list = availableCourses(m);
  if (!list.length) return <p className="empty-note">ตอนนี้ยังไม่มีวิชาที่ลงได้</p>;
  return (
    <div className="panel">
      <p className="muted small">วิชาที่ยังไม่ผ่าน และผ่านวิชาบังคับก่อนครบแล้ว กดเพื่อดูบนตาราง</p>
      <ul className="list">
        {list.map((c) => (
          <CourseRow key={c.id} course={c} right={semName(m.state.place[c.id] as string)} />
        ))}
      </ul>
    </div>
  );
}

export function PlanSuggestion() {
  const m = useModel();
  const plan = remainingPlan(m);
  if (!plan.length) return <p className="empty-note">ผ่านครบทุกวิชาแล้ว</p>;
  return (
    <div className="panel">
      <p className="muted small">
        จัดให้จากวิชาที่เหลือ โดยดูวิชาที่เปิดแต่ละเทอม ลำดับวิชาบังคับก่อน และไม่เกิน {m.curriculum.maxCreditsPerSemester} หน่วยกิตต่อเทอม
        ไม่ได้เปลี่ยนตารางของคุณ
      </p>
      <div className="terms">
        {plan.map((t) => (
          <div key={t.sem} className="term">
            <h3>
              <span>{semName(t.sem)}</span>
              <span className="muted">{t.term.length ? `${t.credits} หน่วยกิต` : "ไม่มีวิชาที่เปิดสอน"}</span>
            </h3>
            <ul className="list">
              {t.term.map((id) => (
                <CourseRow key={id} course={m.course(id)} right={String(m.creditsOf(id))} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
