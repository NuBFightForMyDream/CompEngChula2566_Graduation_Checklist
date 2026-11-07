import { usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";

export function BoardToolbar() {
  const search = useUi((s) => s.search);
  const setSearch = useUi((s) => s.setSearch);
  const openDialog = useUi((s) => s.openDialog);
  const showEdges = usePlan((s) => s.settings.showEdges);
  const updateSettings = usePlan((s) => s.updateSettings);
  return (
    <div className="board-toolbar">
      <input
        type="search"
        className="search"
        placeholder="ค้นหารหัสหรือชื่อวิชา"
        aria-label="ค้นหาวิชา"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="legend">
        <span>
          <i className="chip p" />
          ผ่านแล้ว
        </span>
        <span>
          <i className="chip" />
          ลงได้
        </span>
        <span>
          <i className="chip l" />
          ยังล็อก
        </span>
        <span>
          <i className="chip x" />
          ลำดับผิด
        </span>
      </div>
      <label className="check">
        <input type="checkbox" checked={showEdges} onChange={(e) => updateSettings({ showEdges: e.target.checked })} />
        แสดงลูกศรทั้งหมด
      </label>
      <button type="button" className="link-btn" onClick={() => openDialog("help")}>
        วิธีใช้
      </button>
    </div>
  );
}
