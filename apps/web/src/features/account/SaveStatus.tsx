import { accountsEnabled } from "../../lib/account.ts";
import { usePlan } from "../../stores/planStore.ts";

/** ผู้ใช้ควรรู้เสมอว่าข้อมูลบันทึกแล้วหรือยัง และอยู่ที่ไหน */
export function SaveStatus() {
  const status = usePlan((s) => s.saveStatus);
  const waitingForChoice = usePlan((s) => !!s.conflict);
  if (waitingForChoice) {
    return (
      <span className="save-status warn" role="status" data-testid="save-status" data-status="conflict">
        รอเลือกฉบับที่จะเก็บ
      </span>
    );
  }
  const view = {
    local: { text: accountsEnabled ? "บันทึกในเบราว์เซอร์นี้" : "บันทึกอัตโนมัติในเบราว์เซอร์นี้", tone: "" },
    pending: { text: "กำลังบันทึก…", tone: "" },
    saved: { text: "✓ บันทึกในบัญชีแล้ว", tone: "" },
    offline: { text: "ยังส่งไม่ได้ จะบันทึกให้เมื่อเชื่อมต่อได้", tone: "warn" },
    signedOut: { text: "หมดเวลาเข้าสู่ระบบ", tone: "bad" },
    error: { text: "บันทึกไม่สำเร็จ กรุณาโหลดหน้าใหม่", tone: "bad" },
  }[status];
  return (
    <span className={`save-status ${view.tone}`} role="status" data-testid="save-status" data-status={status}>
      {view.text}
      {status === "signedOut" && (
        <>
          {" "}
          <a href="/api/auth/google">เข้าสู่ระบบอีกครั้ง</a>
        </>
      )}
    </span>
  );
}
