// สรุปย่อสำหรับหน้าที่พิมพ์ วางข้างแถว GenEd ใต้ตาราง ให้ PDF จบในหน้าเดียว
// บนจอซ่อนไว้ เพราะมี ProgressOverview อยู่แล้ว

import { creditSummary, finishSem, fmtGpa, gpax, graduationStatus } from "@cp/core";
import { categorySwatch } from "../../lib/colors.ts";
import { graduationText, semName } from "../../lib/messages.ts";
import { useModel, usePlan } from "../../stores/planStore.ts";

export function PrintSummary() {
  const m = useModel();
  const settings = usePlan((s) => s.settings);
  const cur = m.curriculum;
  const sum = creditSummary(m);
  const gpa = gpax(m).gpa;
  const finish = finishSem(m);
  const status = sum.complete ? graduationText(graduationStatus(m)).title : `เหลืออีก ${sum.remaining} หน่วยกิต`;
  return (
    <aside className="print-summary" aria-hidden="true">
      <div className="ps-title">
        <b>Graduation Roadmap</b>
        <span>{cur.name}</span>
      </div>
      <div className="ps-stats">
        <span>
          <small>หน่วยกิต</small>
          <b>
            {sum.earned}/{cur.totalCredits}
          </b>
        </span>
        <span>
          <small>GPAX</small>
          <b>{gpa === null ? "—" : fmtGpa(gpa)}</b>
        </span>
        <span>
          <small>คาดว่าจะจบ</small>
          <b>{finish ? semName(finish) : "—"}</b>
        </span>
      </div>
      <div className={sum.complete ? "ps-status done" : "ps-status"}>{status}</div>
      <ul className="ps-cats">
        {sum.categories.map((c) => (
          <li key={c.key} className={c.done ? "done" : undefined}>
            <i style={{ background: categorySwatch(cur, settings, c.key) }} />
            <span>{c.label}</span>
            <b>
              {c.done ? "✓ " : ""}
              {c.got}/{c.required}
            </b>
          </li>
        ))}
      </ul>
    </aside>
  );
}
