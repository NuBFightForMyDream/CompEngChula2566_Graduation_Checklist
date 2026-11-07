import { useEffect } from "react";
import { usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";

export function Toast() {
  const toast = useUi((s) => s.toast);
  const showToast = useUi((s) => s.showToast);
  const undo = usePlan((s) => s.undo);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => showToast(null), toast.bad ? 9000 : 6000);
    return () => clearTimeout(timer);
  }, [toast, showToast]);

  return (
    <div className={`toast${toast?.bad ? " bad" : ""}`} role="status" aria-live="polite" hidden={!toast}>
      {toast && <span>{toast.text}</span>}
      {toast?.undo && (
        <button type="button" className="toast-action" onClick={undo}>
          เลิกทำ
        </button>
      )}
    </div>
  );
}
