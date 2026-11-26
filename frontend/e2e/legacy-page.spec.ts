// หน้าที่จะแทนเว็บเดิมบน GitHub Pages ต้องพาข้อมูลเก่าเข้าเว็บใหม่ได้ เพราะมีโอกาสทำครั้งเดียว
import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const OLD_SITE = "https://old-site.example/";

async function openOldSite(page: Page, storage: Record<string, unknown>) {
  await page.route(OLD_SITE, (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.addInitScript((items) => {
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, JSON.stringify(v));
  }, storage);
  await page.goto(OLD_SITE);
}

async function downloadBackup(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "ดาวน์โหลดแผนของฉัน" }).click();
  const stream = await (await pending).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function importIntoNewSite(page: Page, file: Buffer) {
  await page.goto("/");
  await page.getByRole("button", { name: "ตั้งค่า" }).click();
  await page
    .getByTestId("import-file")
    .setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: file });
}

const C = "comp-eng-2566";

test("a real old plan arrives in the new site with everything intact", async ({ page }) => {
  await openOldSite(page, {
    [`passed:${C}`]: ["2110101", "2110211"],
    [`place:${C}`]: { "2110101": "1/1", "2110211": "2/1", "2301107": "2/1", "X-abc": "3/1" },
    [`grade:${C}`]: { "2110101": "A", "2110211": "B+" },
    [`choice:${C}`]: {
      "ELEC-1": { id: "2110431", code: "2110431", name: "ANY", credits: 3 },
      "FREE-1": { id: null, code: "9999", name: "วิชาที่กรอกเอง", credits: 2 },
    },
    [`extra:${C}`]: [
      {
        id: "X-abc",
        code: "2100999",
        name: "OLD EXTRA",
        credits: 3,
        category: "free",
        semester: "3/1",
        prereq: [],
        extra: true,
      },
    ],
    [`colors:${C}`]: { "cat:free": "#123456" },
    autoShift: false,
  });
  await expect(page.locator("#summary")).toContainText("ผ่านแล้ว 2 วิชา");
  const file = await downloadBackup(page);

  await importIntoNewSite(page, file);
  await expect(page.getByTestId("card-2110211")).toHaveClass(/passed/);
  await expect(page.getByTestId("gpax")).toHaveText("3.75");
  await expect(page.getByTestId("col-2/1").getByTestId("card-2301107")).toBeVisible();
  await expect(page.getByTestId("col-3/1")).toContainText("OLD EXTRA");
  await expect(page.getByTestId("card-FREE-1")).toContainText("วิชาที่กรอกเอง");
  await page.getByRole("button", { name: "ตั้งค่า" }).click();
  await expect(page.getByLabel("ย้ายวิชาแล้วเลื่อนวิชาที่ต่อเนื่องตามอัตโนมัติ")).not.toBeChecked();
});

test("damaged old data does not block the good parts", async ({ page }) => {
  await openOldSite(page, {
    [`passed:${C}`]: ["2110101", 42, null],
    [`place:${C}`]: { "2110101": "1/1", "2301107": "9/9" },
    [`grade:${C}`]: { "2110101": "A", "2301107": "Z" },
    [`choice:${C}`]: { "ELEC-1": { id: "x" }, "ELEC-2": "broken" },
    [`extra:${C}`]: [{ id: "X-1" }, "broken"],
    [`colors:${C}`]: { "cat:free": "red;}" },
  });
  const file = await downloadBackup(page);
  await importIntoNewSite(page, file);
  await expect(page.getByTestId("card-2110101")).toHaveClass(/passed/);
  await expect(page.getByTestId("gpax")).toHaveText("4.00");
});

test("with no old data it just points onward", async ({ page }) => {
  await openOldSite(page, {});
  await expect(page.getByRole("button", { name: "ดาวน์โหลดแผนของฉัน" })).toBeHidden();
  await expect(page.locator("#no-data")).toBeVisible();
});
