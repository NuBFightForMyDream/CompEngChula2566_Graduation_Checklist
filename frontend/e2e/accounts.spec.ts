// ทดสอบบัญชีและการบันทึกแผนกับ Firebase Emulator: Google ปลอม และ Firestore พร้อม firestore.rules ตัวจริง
import { randomUUID } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";

test.skip(!process.env.E2E_FIREBASE || !!process.env.E2E_BASE_URL, "ใช้เฉพาะกับ Firebase Emulator");
// หน้าต่าง Google ปลอมของ Emulator ส่งผลผ่านสคริปต์ gapi จาก apis.google.com ซึ่งราว 1 ใน 20 ครั้งไม่ส่งผลกลับมา
// โค้ดของเว็บเรียกแค่ signInWithPopup จึงให้ลองใหม่ได้ และ Playwright จะรายงานเป็น flaky ให้เห็น
test.describe.configure({ retries: 2 });

const AUTH = "http://127.0.0.1:9099";
const FIRESTORE = "http://127.0.0.1:8085/v1/projects/demo-cp/databases/(default)/documents";
const CURRICULUM = "comp-eng-2566";

const card = (page: Page, id: string) => page.getByTestId(`card-${id}`);
const tick = (page: Page, id: string) => card(page, id).locator(".tick");
const status = (page: Page) => page.getByTestId("save-status");
const loginButton = (page: Page) => page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" });
const menu = (page: Page) => page.getByTestId("account-menu");
const saved = (page: Page) => expect(status(page)).toHaveAttribute("data-status", "saved");
const newEmail = () => `u${randomUUID().slice(0, 8)}@example.com`;
const guestKeys = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("cp:plan:")));

/** กดปุ่ม login แล้วเลือกบัญชีในหน้าต่าง Google ปลอม ถ้ายังไม่มีบัญชีนี้จะสร้างใหม่ */
async function chooseAccount(page: Page, email: string, open: () => Promise<void>) {
  const popupOpened = page.waitForEvent("popup");
  await open();
  const popup = await popupOpened;
  await popup.waitForLoadState();
  // หน้าต่างนี้ส่งผลผ่าน iframe ที่ Firebase สร้างในหน้าเว็บหลังกด login ถ้าเลือกบัญชีก่อน iframe ตั้งตัวรับข้อความ ผลจะหาย
  const authIframe = () => page.frames().find((f) => f.url().includes("/emulator/auth/iframe"));
  await expect
    .poll(() => authIframe()?.evaluate(() => typeof (window as { gapi_onload?: unknown }).gapi_onload === "function"))
    .toBe(true);
  const existing = popup.locator(".js-reuse-account", { hasText: email });
  const addNew = popup.getByText("Add new account");
  await expect(existing.or(addNew).first()).toBeVisible();
  if (await existing.count()) {
    await existing.click();
  } else {
    await addNew.click();
    await popup.locator("#email-input").fill(email);
    await popup.locator("#display-name-input").fill(`User ${email.split("@")[0]}`);
    await popup.locator("#sign-in").click();
  }
}

async function login(page: Page, email: string) {
  await chooseAccount(page, email, () => loginButton(page).click());
  await expect(menu(page)).toContainText(`User ${email.split("@")[0]}`, { timeout: 10_000 });
}

async function openAs(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await login(page, email);
  return page;
}

async function uidOf(email: string) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-cp/accounts:query`, {
    method: "POST",
    headers: { authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ returnUserInfo: true }),
  });
  const { userInfo = [] } = (await res.json()) as { userInfo?: { localId: string; email: string }[] };
  return userInfo.find((u) => u.email === email)?.localId;
}

/** Emulator รับ token ที่ไม่ได้เซ็นได้ จึงปลอมเป็นผู้ใช้คนไหนก็ได้เพื่อทดสอบ rules */
function tokenFor(uid: string) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: uid,
    user_id: uid,
    iss: "https://securetoken.google.com/demo-cp",
    aud: "demo-cp",
    iat: now,
    exp: now + 3600,
    auth_time: now,
    firebase: { sign_in_provider: "google.com" },
  };
  return `${b64({ alg: "none", typ: "JWT" })}.${b64(claims)}.`;
}

async function readPlanAs(ownerUid: string, readerUid: string | null) {
  const res = await fetch(`${FIRESTORE}/users/${ownerUid}/plans/${CURRICULUM}`, {
    headers: readerUid ? { authorization: `Bearer ${tokenFor(readerUid)}` } : {},
  });
  return res.status;
}

test("a guest sees the login button and saves in the browser", async ({ page }) => {
  await page.goto("/");
  await expect(loginButton(page)).toBeVisible();
  await expect(status(page)).toHaveAttribute("data-status", "local");
  await tick(page, "2110101").click();
  await page.reload();
  await expect(card(page, "2110101")).toHaveClass(/passed/);
});

test("logging in shows who I am and starts saving to the account", async ({ page }) => {
  const email = newEmail();
  await page.goto("/");
  await login(page, email);
  await saved(page);
  await menu(page).locator("summary").click();
  await expect(menu(page)).toContainText(email);
  await menu(page).locator("summary").click();
  await tick(page, "2110101").click();
  await expect(status(page)).toHaveAttribute("data-status", "pending");
  await saved(page);
  await page.reload();
  await expect(card(page, "2110101")).toHaveClass(/passed/);
});

test("the plan follows me to another device", async ({ page, browser }) => {
  const email = newEmail();
  await page.goto("/");
  await login(page, email);
  await tick(page, "2110101").click();
  await card(page, "2110211").locator(".sel").click();
  await page.getByTestId("drawer").getByRole("button", { name: "A", exact: true }).click();
  await saved(page);

  const other = await openAs(browser, email);
  await expect(card(other, "2110101")).toHaveClass(/passed/);
  await expect(card(other, "2110211")).toHaveClass(/passed/);
  await expect(other.getByTestId("gpax")).toHaveText("4.00");
  await other.context().close();
});

test("a change on another device shows up without reloading", async ({ page, browser }) => {
  const email = newEmail();
  await page.goto("/");
  await login(page, email);
  await saved(page);

  const other = await openAs(browser, email);
  await tick(other, "2301107").click();
  await saved(other);

  await expect(card(page, "2301107")).toHaveClass(/passed/);
  await expect(page.locator(".toast")).toContainText("อัปเดตแผนจากเครื่องอื่นแล้ว");
  await other.context().close();
});

test("the plan made as a guest moves into a new account", async ({ page }) => {
  await page.goto("/");
  await tick(page, "2110101").click();
  await login(page, newEmail());
  await expect(card(page, "2110101")).toHaveClass(/passed/);
  await expect(page.locator(".toast")).toContainText("ย้ายแผน");
  // ลบจากเบราว์เซอร์หลังเซิร์ฟเวอร์รับแล้วเท่านั้น
  await expect.poll(() => guestKeys(page)).toEqual([]);
});

test("a guest plan and an existing account plan ask me to choose", async ({ page, browser }) => {
  const email = newEmail();
  const device = await openAs(browser, email);
  await tick(device, "2110101").click();
  await saved(device);
  await device.context().close();

  await page.goto("/");
  await tick(page, "2301107").click();
  await login(page, email);
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
  const email = newEmail();
  const device = await openAs(browser, email);
  await tick(device, "2110101").click();
  await saved(device);
  await device.context().close();

  await page.goto("/");
  await tick(page, "2301107").click();
  await login(page, email);
  await page
    .getByTestId("plan-conflict")
    .getByRole("button", { name: /ใช้แผนในบัญชี/ })
    .click();
  await expect(card(page, "2110101")).toHaveClass(/passed/);
  await expect(card(page, "2301107")).not.toHaveClass(/passed/);
  expect(await guestKeys(page)).toEqual([]);
});

test("signing out returns to an empty guest plan", async ({ page }) => {
  await page.goto("/");
  await login(page, newEmail());
  await tick(page, "2110101").click();
  await saved(page);

  await menu(page).locator("summary").click();
  await menu(page).getByRole("button", { name: "ออกจากระบบ" }).click();
  await expect(loginButton(page)).toBeVisible();
  await expect(status(page)).toHaveAttribute("data-status", "local");
  await expect(card(page, "2110101")).not.toHaveClass(/passed/);
});

test("another account cannot read my plan", async ({ page }) => {
  const email = newEmail();
  await page.goto("/");
  await login(page, email);
  await tick(page, "2110101").click();
  await saved(page);

  const uid = (await uidOf(email)) as string;
  expect(await readPlanAs(uid, uid)).toBe(200);
  expect(await readPlanAs(uid, "someone-else")).toBe(403);
  expect(await readPlanAs(uid, null)).toBe(403);
});

test("deleting the account removes my plan", async ({ page }) => {
  const email = newEmail();
  await page.goto("/");
  await login(page, email);
  await tick(page, "2110101").click();
  await saved(page);
  const uid = (await uidOf(email)) as string;

  await menu(page).locator("summary").click();
  await menu(page).getByRole("button", { name: "ลบบัญชี" }).click();
  // Firebase ให้ยืนยันตัวตนก่อนลบบัญชี
  await chooseAccount(page, email, () => page.getByRole("button", { name: "ยืนยันลบบัญชี" }).click());
  await expect(loginButton(page)).toBeVisible();

  expect(await uidOf(email)).toBeUndefined();
  expect(await readPlanAs(uid, uid)).toBe(404);
});
