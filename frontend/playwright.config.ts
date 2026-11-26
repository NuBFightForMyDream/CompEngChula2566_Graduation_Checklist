import { defineConfig, devices } from "@playwright/test";

// E2E_FIREBASE=1 รันชุดเดิมทั้งหมดพร้อมชุดทดสอบบัญชี กับ Firebase Emulator (Google ปลอม + Firestore ในเครื่อง)
const useFirebase = !!process.env.E2E_FIREBASE;
// ทดสอบกับเว็บที่เปิดอยู่แล้ว เช่น เว็บที่ deploy แล้ว
const externalUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  // เว็บจริงผ่านเครือข่ายภายนอกช้ากว่าเซิร์ฟเวอร์ในเครื่อง
  expect: { timeout: externalUrl ? 15_000 : 5_000 },
  use: { baseURL: externalUrl ?? "http://localhost:5174", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: externalUrl
    ? []
    : [
        ...(useFirebase
          ? [
              {
                command: "pnpm exec firebase emulators:start --only auth,firestore --project demo-cp",
                cwd: "../..",
                url: "http://127.0.0.1:8085",
                reuseExistingServer: !process.env.CI,
                timeout: 120_000,
                // ให้ firebase CLI ปิด Emulator เอง ถ้าถูก kill ทันที Java ของ Firestore จะค้างอยู่
                gracefulShutdown: { signal: "SIGINT" as const, timeout: 15_000 },
              },
            ]
          : []),
        {
          command: `pnpm exec vite build${useFirebase ? " --mode emulator" : ""} && pnpm exec vite preview --port 5174 --strictPort`,
          url: "http://localhost:5174",
          reuseExistingServer: !process.env.CI,
        },
      ],
});
