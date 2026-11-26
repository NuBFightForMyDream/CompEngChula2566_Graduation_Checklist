import { useRef, useState } from "react";
import { accountsEnabled } from "../../lib/firebaseConfig.ts";
import { usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";
import { Modal } from "../common/Modal.tsx";
import { download } from "../export/download.ts";

export function AccountMenu() {
  const user = usePlan((s) => s.user);
  const signIn = usePlan((s) => s.signIn);
  const signOut = usePlan((s) => s.signOut);
  const deleteAccount = usePlan((s) => s.deleteAccount);
  const exportAccount = usePlan((s) => s.exportAccount);
  const showToast = useUi((s) => s.showToast);
  const ref = useRef<HTMLDetailsElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!accountsEnabled) return null;
  if (!user) {
    return (
      <button type="button" className="login-btn" onClick={() => void signIn()}>
        เข้าสู่ระบบด้วย Google
      </button>
    );
  }

  const close = () => ref.current?.removeAttribute("open");

  const downloadMyData = async () => {
    close();
    try {
      const data = await exportAccount();
      download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "my-graduation-data.json");
    } catch {
      showToast({ text: "ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่", bad: true });
    }
  };

  const removeAccount = async () => {
    setBusy(true);
    try {
      await deleteAccount();
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
          <span className="account-name">{user.name}</span>
        </summary>
        <div className="menu-list">
          <p className="menu-email">{user.email}</p>
          <button type="button" onClick={downloadMyData}>
            ดาวน์โหลดข้อมูลของฉัน
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              void signOut();
            }}
          >
            ออกจากระบบ
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              close();
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
              ระบบจะลบบัญชีและแผนทั้งหมดของคุณทันที และกู้คืนไม่ได้ ถ้าต้องการเก็บข้อมูลไว้ ให้ดาวน์โหลดข้อมูลก่อน ระบบจะขอให้เลือกบัญชี Google
              อีกครั้งเพื่อยืนยันตัวตน
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
