import { defineConfig, devices } from "@playwright/test";

const useApi = !!process.env.E2E_API;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:5174", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  // E2E_API=1 รันชุดเดิมทั้งหมด แต่ให้หน้าเว็บโหลดหลักสูตรผ่าน API และ Postgres จริง
  webServer: [
    ...(useApi
      ? [
          {
            command: "pnpm --filter @cp/api start",
            url: "http://localhost:8080/api/health",
            reuseExistingServer: !process.env.CI,
          },
        ]
      : []),
    {
      command: `pnpm exec vite build${useApi ? " --mode api" : ""} && pnpm exec vite preview --port 5174 --strictPort`,
      url: "http://localhost:5174",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
