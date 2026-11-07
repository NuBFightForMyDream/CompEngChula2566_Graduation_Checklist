import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { accountsEnabled, deleteAccount, logout, meQuery } from "../../lib/account.ts";
import { usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";
import { Modal } from "../common/Modal.tsx";

export function AccountMenu() {
  const { data } = useQuery(meQuery);
  const ref = useRef<HTMLDetailsElement>(null);
  const flushSaves = usePlan((s) => s.flushSaves);
  const forgetLocalData = usePlan((s) => s.forgetLocalData);
  const showToast = useUi((s) => s.showToast);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!accountsEnabled || !data) return null;
  if (!data.user) {
    if (!data.loginAvailable) return null;
    return (
      <a className="login-btn" href="/api/auth/google">
        เข้าสู่ระบบด้วย Google
      </a>
    );
  }

  const signOut = async () => {
    ref.current?.removeAttribute("open");
    // ยังส่งไม่สำเร็จ ห้ามออก เพราะตอนออกจะล้างฉบับร่าง และข้อมูลจะหาย
    if (!(await flushSaves())) {
      showToast({ text: "ยังบันทึกไม่สำเร็จ กรุณาเชื่อมต่ออินเทอร์เน็ตก่อนออกจากระบบ", bad: true });
      return;
    }
    await logout();
    forgetLocalData();
    window.location.assign("/");
  };

  const removeAccount = async () => {
    setBusy(true);
    try {
      await deleteAccount();
      forgetLocalData();
      window.location.assign("/");
    } catch {
      setBusy(false);
      setConfirmDelete(false);
      showToast({ text: "ลบบัญชีไม่สำเร็จ กรุณาลองใหม่", bad: true });
    }
  };

  return (
    <>
      <details ref={ref} className="menu" data-testid="account-menu">
        <summary className="btn">
          <span className="account-name">{data.user.name}</span>
        </summary>
        <div className="menu-list">
          <p className="menu-email">{data.user.email}</p>
          <a className="menu-link" href="/api/me/export" download="my-graduation-data.json">
            ดาวน์โหลดข้อมูลของฉัน
          </a>
          <button type="button" onClick={signOut}>
            ออกจากระบบ
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              ref.current?.removeAttribute("open");
              setConfirmDelete(true);
            }}
          >
            ลบบัญชี
          </button>
        </div>
      </details>
      {confirmDelete && (
        <Modal title="ลบบัญชีถาวร" onClose={() => setConfirmDelete(false)}>
          <div className="form">
            <p className="small">
              ระบบจะลบบัญชี แผน เกรด และประวัติทั้งหมดของคุณทันที และกู้คืนไม่ได้ ถ้าต้องการเก็บข้อมูลไว้ ให้ดาวน์โหลดข้อมูลก่อน
            </p>
            <div className="actions end">
              <button type="button" onClick={() => setConfirmDelete(false)}>
                ยกเลิก
              </button>
              <button type="button" className="danger-solid" disabled={busy} onClick={removeAccount}>
                ยืนยันลบบัญชี
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
