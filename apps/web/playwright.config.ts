import { defineConfig, devices } from "@playwright/test";

const useApi = !!process.env.E2E_API;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:5174", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  // E2E_API=1 รันชุดเดิมทั้งหมดผ่าน API และ Postgres จริง พร้อมชุดทดสอบบัญชี
  // ใช้พอร์ต 8081 แยกจาก pnpm dev:full และใช้ Google ปลอมจาก apps/api/test/e2e-server.ts
  webServer: [
    ...(useApi
      ? [
          {
            command: "pnpm --filter @cp/api start:e2e",
            url: "http://localhost:8081/api/health",
            reuseExistingServer: !process.env.CI,
            env: { PORT: "8081", PUBLIC_ORIGIN: "http://localhost:5174", LOG_LEVEL: "silent" },
          },
        ]
      : []),
    {
      command: `pnpm exec vite build${useApi ? " --mode api" : ""} && pnpm exec vite preview --port 5174 --strictPort`,
      url: "http://localhost:5174",
      reuseExistingServer: !process.env.CI,
      env: { API_ORIGIN: "http://localhost:8081" },
    },
  ],
});
