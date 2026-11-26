import { resetAll, resetPlacement, sampleYear1 } from "@cp/core";
import { type ChangeEvent, useRef, useState } from "react";
import { coreGroups, rawCategoryColor, rawGroupColor } from "../../lib/colors.ts";
import { useModel, usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";
import { Modal } from "../common/Modal.tsx";
import { exportBackup } from "../export/ExportMenu.tsx";

export function SettingsDialog() {
  const m = useModel();
  const settings = usePlan((s) => s.settings);
  const signedIn = usePlan((s) => !!s.user);
  const updateSettings = usePlan((s) => s.updateSettings);
  const commit = usePlan((s) => s.commit);
  const importFile = usePlan((s) => s.importFile);
  const openDialog = useUi((s) => s.openDialog);
  const select = useUi((s) => s.select);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const cur = m.curriculum;
  const close = () => openDialog(null);
  const groups = coreGroups(cur);

  const rows = [
    ...Object.entries(cur.categories)
      .filter(([k]) => !groups.length || k !== "core")
      .map(([k, c]) => [`cat:${k}`, c.label, rawCategoryColor(cur, settings, k)] as const),
    ...Object.entries(cur.groups ?? {}).map(
      ([k, g]) => [`group:${k}`, g.label, rawGroupColor(cur, settings, k)] as const,
    ),
  ];

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setError("อ่านไฟล์ไม่ได้ ไฟล์ต้องเป็น JSON");
      return;
    }
    const err = importFile(raw);
    setError(err);
    if (!err) close();
  };

  return (
    <Modal title="ตั้งค่า" onClose={close} wide>
      <div className="settings">
        <section>
          <h3>การจัดแผน</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.autoShift}
              onChange={(e) => updateSettings({ autoShift: e.target.checked })}
            />
            ย้ายวิชาแล้วเลื่อนวิชาที่ต่อเนื่องตามอัตโนมัติ
          </label>
        </section>

        <section>
          <div className="section-head">
            <h3>สีวิชา</h3>
            <button type="button" onClick={() => updateSettings({ colors: {} })}>
              คืนสีตามหลักสูตร
            </button>
          </div>
          <div className="palette-grid">
            {rows.map(([key, label, hex]) => (
              <label key={key} className="pal">
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => updateSettings({ colors: { ...settings.colors, [key]: e.target.value } })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <h3>ข้อมูลของฉัน</h3>
          <p className="muted small">
            {signedIn
              ? "แผนนี้บันทึกอยู่ในบัญชีของคุณ ใช้ได้ทุกเครื่องที่เข้าสู่ระบบ"
              : "ตอนนี้ข้อมูลบันทึกไว้ในเบราว์เซอร์นี้เท่านั้น ควรบันทึกไฟล์สำรองไว้ก่อนล้างข้อมูลเบราว์เซอร์"}
          </p>
          <div className="actions">
            <button type="button" onClick={exportBackup}>
              บันทึกไฟล์สำรอง
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}>
              นำเข้าไฟล์สำรอง
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={onFile}
              data-testid="import-file"
            />
            <button
              type="button"
              onClick={() => {
                commit(sampleYear1(m), "ใส่ตัวอย่าง: ผ่านวิชาปี 1 ทั้งหมด");
                close();
              }}
            >
              ลองดูตัวอย่าง
            </button>
            <button
              type="button"
              onClick={() => {
                commit(resetPlacement(m), "คืนทุกวิชาไปเทอมตามแผนแล้ว");
                close();
              }}
            >
              คืนเทอมตามแผน
            </button>
          </div>
          {error && (
            <p className="bad-text small" role="alert">
              {error}
            </p>
          )}
        </section>

        <section className="danger-zone">
          <h3>ล้างข้อมูล</h3>
          {confirmClear ? (
            <div className="actions">
              <span>ล้างวิชาที่ผ่าน เกรด วิชาที่เลือก และวิชาเรียนเพิ่มทั้งหมด?</span>
              <button
                type="button"
                className="danger-solid"
                onClick={() => {
                  select(null);
                  commit(resetAll(cur), "ล้างข้อมูลแล้ว");
                  close();
                }}
              >
                ยืนยันล้างข้อมูล
              </button>
              <button type="button" onClick={() => setConfirmClear(false)}>
                ยกเลิก
              </button>
            </div>
          ) : (
            <button type="button" className="danger" onClick={() => setConfirmClear(true)}>
              ล้างข้อมูลทั้งหมด
            </button>
          )}
        </section>
      </div>
    </Modal>
  );
}
