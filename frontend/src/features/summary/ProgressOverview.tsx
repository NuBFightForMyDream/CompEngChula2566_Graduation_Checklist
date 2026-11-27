import { availableCourses, creditSummary, finishSem, fmtGpa, gpax, graduationStatus } from "@cp/core";
import { useState } from "react";
import { categorySwatch, coreGroups, rawGroupColor } from "../../lib/colors.ts";
import { graduationText, semName } from "../../lib/messages.ts";
import { useModel, usePlan } from "../../stores/planStore.ts";
import { useUi } from "../../stores/uiStore.ts";

export function ProgressOverview() {
  const m = useModel();
  // บนมือถือยุบรายละเอียดไว้ก่อน เพื่อให้ถึงตารางเร็วขึ้น
  const [startOpen] = useState(() => matchMedia("(min-width: 721px)").matches);
  const settings = usePlan((s) => s.settings);
  const setTab = useUi((s) => s.setTab);
  const cur = m.curriculum;
  const sum = creditSummary(m);
  const gpa = gpax(m);
  const finish = finishSem(m);
  const groups = coreGroups(cur);
  const grad = graduationText(graduationStatus(m));
  const percent = Math.min(100, (100 * sum.counted) / cur.totalCredits);
  return (
    <section className="overview" aria-label="สรุปความคืบหน้า">
      <div className="tiles">
        <div className="tile tile-main">
          <span className="tile-label">หน่วยกิตที่ผ่านแล้ว</span>
          <div className="big" data-testid="total-credits">
            {sum.earned} <small>/ {cur.totalCredits}</small>
          </div>
          <div
            className="meter"
            role="progressbar"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="ความคืบหน้าหน่วยกิต"
          >
            <i style={{ width: `${percent}%` }} />
          </div>
          {sum.complete ? (
            <>
              <strong className="grad-status" data-testid="grad-status">
                {grad.title}
              </strong>
              {grad.note && <span className="muted small">{grad.note}</span>}
            </>
          ) : (
            <span className="muted small" data-testid="remaining-note">
              เหลืออีก {sum.remaining} หน่วยกิต ตามที่แต่ละหมวดกำหนด
            </span>
          )}
          {sum.extrasOutside > 0 && <span className="muted small">นอกหลักสูตร {sum.extrasOutside} หน่วยกิต</span>}
        </div>
        <div className="tile">
          <span className="tile-label">GPAX</span>
          <div className="big" data-testid="gpax">
            {gpa.gpa === null ? "—" : fmtGpa(gpa.gpa)}
          </div>
          <span className="muted small">{gpa.credits ? `คิดจาก ${gpa.credits} หน่วยกิตที่มีเกรด` : "ยังไม่มีเกรด"}</span>
        </div>
        <div className="tile">
          <span className="tile-label">คาดว่าจะจบ</span>
          <div className="big big-text">{finish ? semName(finish) : "—"}</div>
          <span className="muted small">ตามแผนบนตาราง</span>
        </div>
        <button type="button" className="tile tile-btn" onClick={() => setTab("available")}>
          <span className="tile-label">ลงได้ตอนนี้</span>
          <div className="big">
            {availableCourses(m).length} <small>วิชา</small>
          </div>
          <span className="muted small">ดูรายการ →</span>
        </button>
      </div>

      <details className="cats-box" open={startOpen}>
        <summary>ความคืบหน้าแต่ละหมวด</summary>
        <div className="cats">
          {sum.categories.map((c) => {
            const swatch = categorySwatch(cur, settings, c.key);
            return (
              <div key={c.key} className={`cat${c.done ? " done" : ""}`}>
                <i className="sw" style={{ background: swatch }} />
                <span>{c.label}</span>
                <span className="num">
                  {c.done ? "✓ " : ""}
                  {c.got}/{c.required}
                  {c.got > c.required ? ` (+${c.got - c.required})` : ""}
                </span>
                <div className="meter">
                  <i style={{ width: `${Math.min(100, (100 * c.got) / c.required)}%`, background: swatch }} />
                </div>
              </div>
            );
          })}
        </div>
        {groups.length > 0 && (
          <div className="groups">
            {groups.map(([k, gr]) => (
              <span key={k}>
                <i style={{ background: rawGroupColor(cur, settings, k) }} />
                {gr.label}
              </span>
            ))}
          </div>
        )}
      </details>
    </section>
  );
}
