import { type Course, type PlanModel, togglePassed } from "@cp/core";
import { useDraggable } from "@dnd-kit/core";
import type { CSSProperties } from "react";
import { courseColor, textOn } from "../../lib/colors.ts";
import { modelOf, usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";

const HOVER_DELAY = 180;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;

function hoverStart(id: string) {
  clearTimeout(hoverTimer);
  const ui = useUi.getState();
  if (ui.selectedId || ui.dragId) return;
  hoverTimer = setTimeout(() => useUi.getState().setHover(id), ui.hoverId ? 0 : HOVER_DELAY);
}

function hoverEnd() {
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => useUi.getState().setHover(null), 60);
}

interface FaceProps {
  m: PlanModel;
  course: Course;
  className?: string;
  style?: CSSProperties;
}

function cardStyle(m: PlanModel, course: Course): CSSProperties {
  const settings = usePlan.getState().settings;
  const color = courseColor(m.curriculum, settings, course);
  return { "--c": color, "--on-c": textOn(color) } as CSSProperties;
}

/** เนื้อหาการ์ด ใช้ทั้งบนกระดานและตอนกำลังลาก */
function CardFace({ m, course }: Pick<FaceProps, "m" | "course">) {
  const { id } = course;
  const grade = m.state.grades[id];
  const status = m.statusOf(id);
  const chosen = m.state.choices[id];
  const name = m.nameOf(id);
  const tag = course.pool ? (chosen ? course.name : "ยังไม่ได้เลือกวิชา") : course.extra ? "เรียนเพิ่ม" : null;
  return (
    <>
      <button
        type="button"
        className="sel"
        onClick={() => {
          clearTimeout(hoverTimer);
          const ui = useUi.getState();
          ui.select(ui.selectedId === id ? null : id);
        }}
      >
        {tag && <span className="slot-tag">{tag}</span>}
        <span className="nm">{name}</span>
        <span className="cd">
          <span>
            {m.codeOf(id)} ({m.creditsOf(id)})
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
        title={status === "locked" ? "ต้องผ่านวิชาบังคับก่อนก่อน" : grade ? `เกรด ${grade}` : undefined}
        onClick={() => usePlan.getState().dispatch((model) => togglePassed(model, id))}
      />
    </>
  );
}

interface CardProps {
  course: Course;
  focus: "self" | "pre" | "post" | null;
  conflict: boolean;
  dimmed: boolean;
}

export function CourseCard({ course, focus, conflict, dimmed }: CardProps) {
  const curriculum = usePlan((s) => s.curriculum);
  const state = usePlan((s) => s.state);
  usePlan((s) => s.settings);
  const m = modelOf(curriculum as NonNullable<typeof curriculum>, state as NonNullable<typeof state>);
  const { id } = course;
  const { setNodeRef, listeners, isDragging } = useDraggable({ id });
  const className = [
    "card",
    m.statusOf(id),
    course.extra && "extra-card",
    course.pool && !m.state.choices[id] && "unset-slot",
    conflict && "conflict",
    m.isMoved(id) && "moved",
    focus && `hl-${focus}`,
    dimmed && "dim",
    isDragging && "dragging",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      ref={setNodeRef}
      className={className}
      data-id={id}
      data-testid={`card-${id}`}
      style={cardStyle(m, course)}
      onPointerEnter={(e) => e.pointerType === "mouse" && hoverStart(id)}
      onPointerLeave={(e) => e.pointerType === "mouse" && hoverEnd()}
      {...listeners}
    >
      <CardFace m={m} course={course} />
    </div>
  );
}

export function DragPreview({ id }: { id: string }) {
  const curriculum = usePlan((s) => s.curriculum);
  const state = usePlan((s) => s.state);
  const m = modelOf(curriculum as NonNullable<typeof curriculum>, state as NonNullable<typeof state>);
  const course = m.course(id);
  return (
    <div className={`card drag-preview ${m.statusOf(id)}`} style={cardStyle(m, course)}>
      <CardFace m={m} course={course} />
    </div>
  );
}
