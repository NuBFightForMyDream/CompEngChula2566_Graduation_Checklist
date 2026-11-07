import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: "./test/globalSetup.ts",
    // ครั้งแรกอาจต้องดาวน์โหลด image ของ Postgres
    hookTimeout: 120_000,
    testTimeout: 20_000,
  },
});
