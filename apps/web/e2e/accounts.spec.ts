// ทดสอบบัญชีและการบันทึกแผนผ่าน API และ Postgres จริง โดยใช้ Google ปลอมจาก apps/api/test/e2e-server.ts
import { randomUUID } from "node:crypto";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";

test.skip(!process.env.E2E_API, "ใช้เฉพาะโหมดที่มี API");

const card = (page: Page, id: string) => page.getByTestId(`card-${id}`);
const tick = (page: Page, id: string) => card(page, id).locator(".tick");
const status = (page: Page) => page.getByTestId("save-status");
const loginLink = (page: Page) => page.getByRole("link", { name: "เข้าสู่ระบบด้วย Google" });
const saved = (page: Page) => expect(status(page)).toHaveAttribute("data-status", "saved");

async function setIdentity(context: BrowserContext, name: string) {
  await context.addCookies([{ name: "e2e_user", value: name, domain: "localhost", path: "/" }]);
}

/** เปิดเว็บแล้วเข้าสู่ระบบด้วยผู้ใช้คนนี้ */
async function login(page: Page, name: string) {
  await setIdentity(page.context(), name);
  await page.goto("/");
  await loginLink(page).click();
  await expect(page.getByTestId("account-menu")).toContainText(`User ${name}`);
  await saved(page);
}

const newUser = () => `u${randomUUID().replaceAll("-", "")}`;

test("a guest sees the login button and saves in the browser", async ({ page }) => {
  await page.goto("/");
  await expect(loginLink(page)).toBeVisible();
  await expect(status(page)).toHaveAttribute("data-status", "local");
  await tick(page, "2110101").click();
  await page.reload();
  await expect(card(page, "2110101")).toHaveClass(/passed/);
});

test("logging in shows who I am and starts saving to the account", async ({ page }) => {
  const name = newUser();
  await login(page, name);
  await page.getByTestId("account-menu").locator("summary").click();
  await expect(page.getByTestId("account-menu")).toContainText(`${name}@example.com`);
  await page.getByTestId("account-menu").locator("summary").click();
  await tick(page, "2110101").click();
  await expect(status(page)).toHaveAttribute("data-status", "pending");
  await saved(page);
  await page.reload();
  await expect(card(page, "2110101")).toHaveClass(/passed/);
});

test("the plan follows me to another device", async ({ page, browser }) => {
  const name = newUser();
  await login(page, name);
  await tick(page, "2110101").click();
  await card(page, "2110211").locator(".sel").click();
  await page.getByTestId("drawer").getByRole("button", { name: "A", exact: true }).click();
  await saved(page);

  const other = await (await browser.newContext()).newPage();
  await login(other, name);
  await expect(card(other, "2110101")).toHaveClass(/passed/);
  await expect(card(other, "2110211")).toHaveClass(/passed/);
  await expect(other.getByTestId("gpax")).toHaveText("4.00");
  await other.context().close();
});

test("the plan made as a guest moves into a new account", async ({ page }) => {
  await page.goto("/");
  await tick(page, "2110101").click();
  await login(page, newUser());
  await expect(card(page, "2110101")).toHaveClass(/passed/);
  await expect(page.locator(".toast")).toContainText("ย้ายแผน");
  const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("cp:plan:")));
  expect(left).toEqual([]);
});

test("a guest plan and an existing account plan ask me to choose", async ({ page, browser }) => {
  const name = newUser();
  const device = await (await browser.newContext()).newPage();
  await login(device, name);
  await tick(device, "2110101").click();
  await saved(device);
  await device.context().close();

  await page.goto("/");
  await tick(page, "2301107").click();
  await setIdentity(page.context(), name);
  await loginLink(page).click();
  const dialog = page.getByTestId("plan-conflict");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("ผ่านแล้ว 1 วิชา");

  // ปิดด้วย Esc ไม่ได้ ไม่งั้นระบบจะไม่รู้ว่าควรเก็บฉบับไหน
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: /ใช้แผนในเบราว์เซอร์นี้/ }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, "2301107")).toHaveClass(/passed/);
  await expect(card(page, "2110101")).not.toHaveClass(/passed/);
  await saved(page);
  await page.reload();
  await expect(card(page, "2301107")).toHaveClass(/passed/);
  await expect(page.getByTestId("plan-conflict")).toBeHidden();
});

test("choosing the account plan drops the guest plan", async ({ page, browser }) => {
  const name = newUser();
  const device = await (await browser.newContext()).newPage();
  await login(device, name);
  await tick(device, "2110101").click();
  await saved(device);
  await device.context().close();

  await page.goto("/");
  await tick(page, "2301107").click();
  await setIdentity(page.context(), name);
  await loginLink(page).click();
  await page
    .getByTestId("plan-conflict")
    .getByRole("button", { name: /ใช้แผนในบัญชี/ })
    .click();
  await expect(card(page, "2110101")).toHaveClass(/passed/);
  await expect(card(page, "2301107")).not.toHaveClass(/passed/);
  const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("cp:plan:")));
  expect(left).toEqual([]);
});

test.describe("editing on two devices at once", () => {
  async function twoDevices(page: Page, browser: import("@playwright/test").Browser) {
    const name = newUser();
    await login(page, name);
    const other = await (await browser.newContext()).newPage();
    await login(other, name);
    await tick(other, "2110101").click();
    await saved(other);
    await tick(page, "2301107").click();
    await expect(page.getByTestId("plan-conflict")).toBeVisible();
    return other;
  }

  test("the dialog says what differs, so the choice is informed", async ({ page, browser }) => {
    const other = await twoDevices(page, browser);
    const dialog = page.getByTestId("plan-conflict");
    const mine = dialog.getByRole("button", { name: /ใช้ฉบับที่แก้ในเครื่องนี้/ });
    const theirs = dialog.getByRole("button", { name: /ใช้ฉบับล่าสุดในบัญชี/ });
    await expect(mine).toContainText("ผ่านเพิ่ม: 2301107 CALCULUS I");
    await expect(theirs).toContainText("ผ่านเพิ่ม: 2110101 COMP PROG");
    await expect(theirs).toContainText("บันทึกเมื่อ");
    await expect(status(page)).toHaveAttribute("data-status", "conflict");
    await other.context().close();
  });

  test("the older device asks instead of overwriting, and can take the latest", async ({ page, browser }) => {
    const other = await twoDevices(page, browser);
    await page.getByRole("button", { name: /ใช้ฉบับล่าสุดในบัญชี/ }).click();
    await expect(card(page, "2110101")).toHaveClass(/passed/);
    await expect(card(page, "2301107")).not.toHaveClass(/passed/);
    await saved(page);
    await other.context().close();
  });

  test("the older device can keep its own version on purpose", async ({ page, browser }) => {
    const other = await twoDevices(page, browser);
    await page.getByRole("button", { name: /ใช้ฉบับที่แก้ในเครื่องนี้/ }).click();
    await expect(card(page, "2301107")).toHaveClass(/passed/);
    await saved(page);
    await other.reload();
    await expect(card(other, "2301107")).toHaveClass(/passed/);
    await expect(card(other, "2110101")).not.toHaveClass(/passed/);
    await other.context().close();
  });
});

test.describe("when saving fails", () => {
  test("an edit survives losing the connection and closing the tab", async ({ page }) => {
    await login(page, newUser());
    await page.route("**/api/plans/*/state", (route) => route.abort());
    await tick(page, "2110101").click();
    await expect(status(page)).toHaveAttribute("data-status", "offline");

    await page.reload();
    await expect(card(page, "2110101")).toHaveClass(/passed/);
    await page.unroute("**/api/plans/*/state");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await saved(page);

    const draft = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("cp:draft:")));
    expect(draft).toEqual([]);
    await page.reload();
    await expect(card(page, "2110101")).toHaveClass(/passed/);
  });

  test("a temporary server error retries by itself", async ({ page }) => {
    await login(page, newUser());
    let failures = 0;
    await page.route("**/api/plans/*/state", (route) => {
      if (failures++ === 0) return route.fulfill({ status: 503, body: "{}" });
      return route.continue();
    });
    await tick(page, "2110101").click();
    await expect(status(page)).toHaveAttribute("data-status", "offline");
    await saved(page);
    await page.unroute("**/api/plans/*/state");
  });

  test("a draft older than the account plan asks me to choose", async ({ page, browser }) => {
    const name = newUser();
    await login(page, name);
    await page.route("**/api/plans/*/state", (route) => route.abort());
    await tick(page, "2301107").click();
    await expect(status(page)).toHaveAttribute("data-status", "offline");

    const other = await (await browser.newContext()).newPage();
    await login(other, name);
    await tick(other, "2110101").click();
    await saved(other);
    await other.context().close();

    await page.reload();
    await expect(page.getByTestId("plan-conflict")).toContainText("ยังส่งไม่สำเร็จ");
  });

  test("an expired session keeps my edit and lets me log back in", async ({ page, context }) => {
    const name = newUser();
    await login(page, name);
    await context.clearCookies({ name: "session" });
    await tick(page, "2110101").click();
    await expect(status(page)).toHaveAttribute("data-status", "signedOut");
    await setIdentity(context, name);
    await status(page).getByRole("link").click();
    await expect(card(page, "2110101")).toHaveClass(/passed/);
    await saved(page);
  });

  test("logging out is refused while an edit has not been saved", async ({ page }) => {
    await login(page, newUser());
    await page.route("**/api/plans/*/state", (route) => route.abort());
    await tick(page, "2110101").click();
    await page.getByTestId("account-menu").locator("summary").click();
    await page.getByRole("button", { name: "ออกจากระบบ" }).click();
    await expect(page.locator(".toast")).toContainText("ยังบันทึกไม่สำเร็จ");
    await expect(page.getByTestId("account-menu")).toBeVisible();
  });
});

test("logging out returns to guest mode and leaves nothing behind", async ({ page }) => {
  await login(page, newUser());
  await tick(page, "2110101").click();
  await saved(page);
  await page.getByTestId("account-menu").locator("summary").click();
  await page.getByRole("button", { name: "ออกจากระบบ" }).click();
  await expect(loginLink(page)).toBeVisible();
  await expect(card(page, "2110101")).not.toHaveClass(/passed/);
  const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("cp:")));
  expect(left.filter((k) => !k.includes("welcome"))).toEqual([]);
  await page.reload();
  await expect(loginLink(page)).toBeVisible();
});

test("my data can be downloaded", async ({ page }) => {
  const name = newUser();
  await login(page, name);
  await page.getByTestId("account-menu").locator("summary").click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "ดาวน์โหลดข้อมูลของฉัน" }).click();
  const file = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of file) chunks.push(chunk as Buffer);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(body.user.email).toBe(`${name}@example.com`);
  expect(body.plans).toHaveLength(1);
});

test("deleting my account needs confirmation and starts fresh afterwards", async ({ page }) => {
  const name = newUser();
  await login(page, name);
  await tick(page, "2110101").click();
  await saved(page);

  await page.getByTestId("account-menu").locator("summary").click();
  await page.getByRole("button", { name: "ลบบัญชี" }).click();
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(page.getByTestId("account-menu")).toBeVisible();

  await page.getByTestId("account-menu").locator("summary").click();
  await page.getByRole("button", { name: "ลบบัญชี" }).click();
  await page.getByRole("button", { name: "ยืนยันลบบัญชี" }).click();
  await expect(loginLink(page)).toBeVisible();

  await login(page, name);
  await expect(card(page, "2110101")).not.toHaveClass(/passed/);
});

test("undo also reaches the account", async ({ page }) => {
  await login(page, newUser());
  await tick(page, "2110101").click();
  await saved(page);
  await page.getByRole("button", { name: "เลิกทำ", exact: true }).first().click();
  await expect(status(page)).toHaveAttribute("data-status", "pending");
  await saved(page);
  await page.reload();
  await expect(card(page, "2110101")).not.toHaveClass(/passed/);
});

test("a failed login explains itself and clears the address bar", async ({ page }) => {
  await page.goto("/?login=failed");
  await expect(page.locator(".toast")).toContainText("เข้าสู่ระบบไม่สำเร็จ");
  await expect(page).toHaveURL(/\/$/);
});
