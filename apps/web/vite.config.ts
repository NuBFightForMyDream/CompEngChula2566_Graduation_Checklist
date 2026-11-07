import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // หน้าเว็บเรียก /api ใน origin เดียวกันเสมอ จึงไม่ต้องตั้ง CORS และ cookie ของเฟส 4 จะใช้ได้
  server: { proxy: { "/api": process.env.API_ORIGIN ?? "http://localhost:8080" } },
});
