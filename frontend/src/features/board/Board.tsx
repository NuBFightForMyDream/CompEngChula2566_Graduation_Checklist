import {
  affected,
  creditsInSem,
  fmtGpa,
  inGenEdRow,
  moveCourse,
  offeredIn,
  type PlanModel,
  prereqChain,
  SEMS,
  type Sem,
  termGpa,
} from "@cp/core";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useMemo, useRef } from "react";
import { semName } from "../../lib/messages.ts";
import { useModel, usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";
import { CourseCard, DragPreview } from "./CourseCard.tsx";
import { GenEdStrip } from "./GenEdStrip.tsx";
import { useEdges } from "./useEdges.ts";
import { useFlip } from "./useFlip.ts";

interface ColumnProps {
  sem: Sem;
  index: number;
  m: PlanModel;
  pre: Set<string>;
  post: Set<string>;
  focusId: string | null;
  badIds: Set<string>;
  query: string;
}

function Column({ sem, index, m, pre, post, focusId, badIds, query }: ColumnProps) {
  const dragId = useUi((s) => s.dragId);
  const setAdding = useUi((s) => s.setAdding);
  const dragging = dragId ? m.courses.find((c) => c.id === dragId) : undefined;
  const allowed = !dragging || offeredIn(dragging, sem);
  const { setNodeRef, isOver } = useDroppable({ id: sem });
  const list = m.courses.filter((c) => m.state.place[c.id] === sem && !inGenEdRow(c, m.state.place));
  const credits = creditsInSem(m, sem);
  const max = m.curriculum.maxCreditsPerSemester;
  const gpa = termGpa(m, sem).gpa;
  const oddYear = Math.floor(index / 2) % 2 === 0;
  const matches = (id: string) =>
    !query || m.codeOf(id).toLowerCase().includes(query) || m.nameOf(id).toLowerCase().includes(query);
  const className = [
    "col",
    oddYear && "odd-year",
    !list.length && "empty",
    !allowed && "nodrop",
    isOver && allowed && "drop",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div ref={setNodeRef} className={className} data-sem={sem} data-testid={`col-${sem}`}>
      <div className="col-head">
        <b>{semName(sem)}</b>
        <span className={credits > max ? "over" : undefined}>
          {credits ? `${credits} หน่วยกิต` : "ว่าง"}
          {credits > max ? ` · เกิน ${max}` : ""}
          {gpa !== null ? ` · GPA ${fmtGpa(gpa)}` : ""}
        </span>
      </div>
      {list.map((c) => (
        <CourseCard
          key={c.id}
          course={c}
          conflict={badIds.has(c.id)}
          dimmed={!matches(c.id)}
          focus={focusId === c.id ? "self" : pre.has(c.id) ? "pre" : post.has(c.id) ? "post" : null}
        />
      ))}
      <div className="add-slot">
        <button type="button" className="add-btn" onClick={() => setAdding(sem)}>
          + เพิ่มวิชา
        </button>
      </div>
    </div>
  );
}

export function Board({ visible }: { visible: boolean }) {
  const m = useModel();
  const showEdges = usePlan((s) => s.settings.showEdges);
  const selectedId = useUi((s) => s.selectedId);
  const hoverId = useUi((s) => s.hoverId);
  const dragId = useUi((s) => s.dragId);
  const search = useUi((s) => s.search);
  const boardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const focusId =
    selectedId && m.graph.courses.has(selectedId)
      ? selectedId
      : hoverId && m.graph.courses.has(hoverId)
        ? hoverId
        : null;
  const { pre, post, chain } = useMemo(() => {
    if (!focusId) return { pre: new Set<string>(), post: new Set<string>(), chain: null };
    const before = prereqChain(m.graph.prereqs, focusId);
    const after = affected(m.graph.unlocks, focusId);
    return { pre: before, post: after, chain: new Set([focusId, ...before, ...after]) };
  }, [focusId, m]);
  const badIds = useMemo(() => new Set(m.conflicts.flat()), [m]);

  useEdges(boardRef, svgRef, m, chain, showEdges, visible);
  const dropped = useFlip(boardRef, m.state.place, visible);

  // เมาส์ต้องลากเกิน 6px จึงเริ่มลาก คลิกธรรมดายังใช้เลือกวิชาได้
  // จอสัมผัสต้องแตะค้าง จึงยังเลื่อนตารางด้วยนิ้วได้ตามปกติ
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { setDrag } = useUi.getState();
    setDrag(null);
    const sem = e.over?.id as string | undefined;
    const id = String(e.active.id);
    if (!sem) return;
    dropped.current = id;
    const { dispatch, settings } = usePlan.getState();
    dispatch((model) => moveCourse(model, id, sem, { autoShift: settings.autoShift }));
  };

  const query = search.trim().toLowerCase();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      autoScroll
      onDragStart={(e) => useUi.getState().setDrag(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => useUi.getState().setDrag(null)}
    >
      <div className="board-scroll">
        <div
          ref={boardRef}
          className={`board${focusId ? " focusing" : ""}${dragId ? " is-dragging" : ""}`}
          id="board"
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest(".card, .add-slot, .gened-strip")) useUi.getState().select(null);
          }}
        >
          <svg ref={svgRef} id="edges" aria-hidden="true" />
          {SEMS.map((sem, i) => (
            <Column
              key={sem}
              sem={sem}
              index={i}
              m={m}
              pre={pre}
              post={post}
              focusId={focusId}
              badIds={badIds}
              query={query}
            />
          ))}
          <GenEdStrip focusId={focusId} query={query} />
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{dragId ? <DragPreview id={dragId} /> : null}</DragOverlay>
    </DndContext>
  );
}
