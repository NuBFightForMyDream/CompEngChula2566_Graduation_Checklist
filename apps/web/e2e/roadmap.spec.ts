import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

const card = (page: Page, id: string) => page.getByTestId(`card-${id}`);
const tick = (page: Page, id: string) => card(page, id).locator(".tick");
const openCard = (page: Page, id: string) => card(page, id).locator(".sel").click();

async function drag(page: Page, id: string, sem: string) {
  const from = await card(page, id).boundingBox();
  await page.getByTestId(`col-${sem}`).scrollIntoViewIfNeeded();
  const start = await card(page, id).boundingBox();
  const to = await page.getByTestId(`col-${sem}`).boundingBox();
  if (!from || !start || !to) throw new Error("ไม่พบตำแหน่ง");
  await page.mouse.move(start.x + 20, start.y + 15);
  await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y + 25, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + 200, { steps: 12 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.titlePath.includes("when the curriculum cannot load")) return;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("fonts.g")) errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.getByTestId("total-credits")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a new user starts with an empty plan and a guide", async ({ page }) => {
  await expect(page.getByTestId("total-credits")).toContainText("0");
  await expect(page.getByTestId("total-credits")).toContainText("138");
  await expect(page.getByTestId("welcome")).toBeVisible();
});

test("ticking updates credits and survives a reload", async ({ page }) => {
  await tick(page, "2110101").click();
  await expect(card(page, "2110101")).toHaveClass(/passed/);
  await expect(page.getByTestId("total-credits")).toContainText("3");
  await expect(page.getByTestId("welcome")).toBeHidden();
  await page.reload();
  await expect(card(page, "2110101")).toHaveClass(/passed/);
});

test("a locked course explains what is missing", async ({ page }) => {
  await tick(page, "2110211").click();
  await expect(page.locator(".toast")).toContainText("2110101");
  await expect(card(page, "2110211")).not.toHaveClass(/passed/);
});

test("undo reverses a change", async ({ page }) => {
  await tick(page, "2110101").click();
  await page.getByRole("button", { name: "เลิกทำ", exact: true }).first().click();
  await expect(card(page, "2110101")).not.toHaveClass(/passed/);
});

test("the drawer shows prereq links and accepts a grade", async ({ page }) => {
  await tick(page, "2110101").click();
  await openCard(page, "2110211");
  const drawer = page.getByTestId("drawer");
  await expect(drawer).toContainText("2110101");
  await drawer.getByRole("button", { name: "B+", exact: true }).click();
  await expect(card(page, "2110211")).toHaveClass(/passed/);
  await expect(page.getByTestId("gpax")).toHaveText("3.50");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("choosing an elective applies the option's prereq and term", async ({ page }) => {
  await openCard(page, "APPR-2");
  await page.locator("#choice-sel").selectOption("2110452");
  await expect(card(page, "APPR-2")).toContainText("HIGH PERFORMANCE ARCH");
  await expect(page.getByTestId("col-4/2").getByTestId("card-APPR-2")).toBeVisible();
  await expect(card(page, "APPR-2")).toHaveClass(/locked/);
});

test("an option used in one slot is disabled in another", async ({ page }) => {
  await openCard(page, "ELEC-1");
  await page.locator("#choice-sel").selectOption("2110431");
  await openCard(page, "APPR-1");
  await expect(page.locator('#choice-sel option[value="2110431"]')).toBeDisabled();
});

test("dragging moves a course and its dependents", async ({ page }) => {
  await drag(page, "2110211", "3/1");
  await expect(page.getByTestId("col-3/1").getByTestId("card-2110211")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a term the course is not offered in refuses the drop", async ({ page }) => {
  await drag(page, "2110211", "2/2");
  await expect(page.getByTestId("col-2/1").getByTestId("card-2110211")).toBeVisible();
  await expect(page.locator(".toast")).toContainText("เปิดเฉพาะเทอมต้น");
});

test("autoShift off leaves a conflict that one click can fix", async ({ page }) => {
  await page.getByRole("button", { name: "ตั้งค่า" }).click();
  await page.getByLabel("ย้ายวิชาแล้วเลื่อนวิชาที่ต่อเนื่องตามอัตโนมัติ").uncheck();
  await page.getByRole("button", { name: "ปิด" }).click();
  await drag(page, "2110211", "3/1");
  await expect(page.getByRole("alert")).toContainText("ลำดับวิชาผิด");
  await page.getByRole("button", { name: "จัดเทอมให้อัตโนมัติ" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("pasting grades fills in order and reports problems", async ({ page }) => {
  await page.getByRole("button", { name: "กรอกเกรด", exact: true }).click();
  await page.getByLabel("รหัสวิชาและเกรด").fill('{"2110211","A"}\n2110101 B\n9999999 A');
  await page.getByRole("button", { name: "ใส่เกรด" }).click();
  await expect(page.getByRole("dialog")).toContainText("ใส่เกรดแล้ว 2 วิชา");
  await expect(page.getByRole("dialog")).toContainText("9999999");
});

test("an extra course can count toward 21st Century", async ({ page }) => {
  await page.getByTestId("col-5/1").getByRole("button", { name: "+ เพิ่มวิชา" }).click();
  await page.getByLabel("รหัสวิชา").fill("2100999");
  await page.getByLabel("ชื่อวิชา").fill("MY COURSE");
  await page.getByLabel("นับเข้าหมวด").selectOption("21st");
  await page.getByRole("button", { name: "เพิ่มวิชา", exact: true }).click();
  await expect(page.getByTestId("col-5/1")).toContainText("MY COURSE");
});

test("clearing everything needs confirmation and can be undone", async ({ page }) => {
  await tick(page, "2110101").click();
  await page.getByRole("button", { name: "ตั้งค่า" }).click();
  await page.getByRole("button", { name: "ล้างข้อมูลทั้งหมด" }).click();
  await page.getByRole("button", { name: "ยืนยันล้างข้อมูล" }).click();
  await expect(card(page, "2110101")).not.toHaveClass(/passed/);
  await page.locator(".toast-action").click();
  await expect(card(page, "2110101")).toHaveClass(/passed/);
});

test("a backup round-trips through export and import", async ({ page }) => {
  await tick(page, "2110101").click();
  await page.getByRole("button", { name: "ตั้งค่า" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "บันทึกไฟล์สำรอง" }).click();
  const file = await (await downloadPromise).path();
  const body = readFileSync(file, "utf8");
  expect(JSON.parse(body).plan.passed).toEqual(["2110101"]);
  await page.getByRole("button", { name: "ล้างข้อมูลทั้งหมด" }).click();
  await page.getByRole("button", { name: "ยืนยันล้างข้อมูล" }).click();
  await page.getByRole("button", { name: "ตั้งค่า" }).click();
  await page
    .getByTestId("import-file")
    .setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from(body) });
  await expect(card(page, "2110101")).toHaveClass(/passed/);
});

test("a wrong file is rejected with a message", async ({ page }) => {
  await page.getByRole("button", { name: "ตั้งค่า" }).click();
  await page
    .getByTestId("import-file")
    .setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from('{"a":1}') });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("ไม่ใช่ไฟล์สำรอง");
});

test("PNG export downloads a file", async ({ page }) => {
  await page.locator(".menu summary").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "รูปภาพ (PNG)" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("roadmap-comp-eng-2566.png");
});

test("printing puts the board first and includes the plan", async ({ page }) => {
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.locator('[data-panel="available"]')).toBeHidden();
  await expect(page.locator('[data-panel="plan"]')).toBeVisible();
  const top = (selector: string) => page.locator(selector).evaluate((el) => el.getBoundingClientRect().top);
  expect(await top('[data-panel="board"]')).toBeLessThan(await top(".overview"));
  expect(await top(".overview")).toBeLessThan(await top('[data-panel="plan"]'));
});

test("search dims courses that do not match", async ({ page }) => {
  await page.getByLabel("ค้นหาวิชา").fill("calculus");
  await expect(card(page, "2301107")).not.toHaveClass(/dim/);
  await expect(card(page, "2110101")).toHaveClass(/dim/);
});

test("the tabs reach every view", async ({ page }) => {
  await page.getByRole("tab", { name: /ลงได้ตอนนี้/ }).click();
  await expect(page.locator('[data-panel="available"]')).toContainText("2110101");
  await page.getByRole("tab", { name: /แผนแนะนำ/ }).click();
  await expect(page.locator('[data-panel="plan"]')).toContainText("ปี 1 เทอม 1");
  await page.getByRole("tab", { name: /ประกาศ/ }).click();
  await expect(page.locator('[data-panel="notices"]')).toContainText("เงื่อนไขเพิ่มเติม");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the page does not scroll sideways", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("the drawer opens as a bottom sheet with a term picker", async ({ page }) => {
    await card(page, "2110101").locator(".sel").tap();
    await expect(page.getByTestId("drawer")).toBeVisible();
    await expect(page.getByLabel("ย้ายไปเทอม")).toBeVisible();
  });
});

test.describe("when the curriculum cannot load", () => {
  test.skip(!process.env.E2E_API, "ใช้เฉพาะโหมดที่โหลดผ่าน API");

  test("shows the reason and recovers with a retry", async ({ page }) => {
    await page.route("**/api/curricula", (route) => route.fulfill({ status: 503, body: "{}" }));
    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText("503");
    await page.unroute("**/api/curricula");
    await page.getByRole("button", { name: "ลองใหม่" }).click();
    await expect(page.getByTestId("total-credits")).toBeVisible();
  });
});
