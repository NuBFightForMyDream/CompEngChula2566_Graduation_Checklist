import { shiftCourses } from "@cp/core";
import { useModel, usePlan } from "../../stores/planStore.ts";

export function ConflictBanner() {
  const m = useModel();
  const dispatch = usePlan((s) => s.dispatch);
  if (!m.conflicts.length) return null;
  return (
    <div className="banner" role="alert">
      <div>
        <b>ลำดับวิชาผิด {m.conflicts.length} คู่</b>
        <p>
          {m.conflicts
            .map(([p, v]) => `${m.label(v)} (${m.state.place[v]}) ลงก่อน ${m.label(p)} (${m.state.place[p]})`)
            .join(" · ")}
        </p>
      </div>
      <button type="button" className="primary" onClick={() => dispatch((model) => shiftCourses(model, null))}>
        จัดเทอมให้อัตโนมัติ
      </button>
    </div>
  );
}
