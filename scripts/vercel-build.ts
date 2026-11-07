// สร้างผลลัพธ์ตามรูปแบบ Vercel Build Output API ลงใน .vercel/output
//   static/          หน้าเว็บ เสิร์ฟจาก CDN
//   functions/api.func  API ทั้งหมดรวมเป็นไฟล์เดียว
//   config.json      กฎ routing
// บน production จะ migrate และ seed ก่อน ถ้าล้ม build จะล้มตาม และ deployment เดิมยังทำงานต่อ

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { CONTENT_SECURITY_POLICY } from "../apps/api/src/security.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, ".vercel", "output");
const FUNCTION_DIR = join(OUTPUT, "functions", "api.func");

// ค่าเริ่มต้นของ Vercel คือสหรัฐฯ ต้องอยู่ใกล้ฐานข้อมูล เพราะหนึ่งคำขอมีหลาย query
const REGION = process.env.VERCEL_FUNCTION_REGION ?? "sin1";

function run(command: string, args: string[], cwd = ROOT) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} ล้มเหลว`);
}

function updateDatabase() {
  // preview deployment ต้องไม่แตะฐานข้อมูลจริง
  if (process.env.VERCEL_ENV !== "production") return;
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("production ต้องตั้ง DATABASE_URL");
  const api = join(ROOT, "apps", "api");
  // การเปลี่ยนโครงสร้างใช้ session pooler ได้ปลอดภัยกว่า transaction pooler
  const env = { ...process.env, DATABASE_URL: url };
  for (const script of ["src/db/migrate-cli.ts", "src/db/seed-cli.ts"]) {
    const result = spawnSync(process.execPath, [script], { cwd: api, stdio: "inherit", env });
    if (result.status !== 0) throw new Error(`${script} ล้มเหลว`);
  }
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export const routes = [
  // หน้าเว็บอยู่นอก /api และ API ใส่ header ความปลอดภัยของตัวเองอยู่แล้ว
  { src: "/api(?:/.*)?", dest: "/api", continue: false },
  // ชื่อไฟล์ใน assets มี hash ของเนื้อหา เก็บ cache ได้นาน
  {
    src: "/assets/.*",
    headers: { ...SECURITY_HEADERS, "Cache-Control": "public, max-age=31536000, immutable" },
    continue: true,
  },
  // index.html ต้องตรวจใหม่ทุกครั้ง ผู้ใช้จึงได้รุ่นล่าสุดทันทีที่ deploy
  {
    src: "/(?!assets/).*",
    headers: {
      ...SECURITY_HEADERS,
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
    continue: true,
  },
  { handle: "filesystem" },
  // ไฟล์ assets ที่หาไม่พบต้องตอบ 404 ไม่ใช่ส่งหน้า HTML กลับไปแทนไฟล์สคริปต์
  { src: "/assets/.*", status: 404 },
  { src: "/.*", dest: "/index.html" },
];

async function main() {
  updateDatabase();
  rmSync(OUTPUT, { recursive: true, force: true });
  mkdirSync(FUNCTION_DIR, { recursive: true });

  run(join(ROOT, "apps", "web", "node_modules", ".bin", "vite"), ["build", "--mode", "api"], join(ROOT, "apps", "web"));
  cpSync(join(ROOT, "apps", "web", "dist"), join(OUTPUT, "static"), { recursive: true });

  await build({
    entryPoints: [join(ROOT, "apps", "api", "src", "vercel.ts")],
    outfile: join(FUNCTION_DIR, "index.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    // บาง dependency เขียนแบบ CommonJS และเรียก require กับไฟล์ระบบ
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
    logLevel: "warning",
  });

  writeFileSync(
    join(FUNCTION_DIR, ".vc-config.json"),
    JSON.stringify({
      runtime: "nodejs24.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      regions: [REGION],
    }),
  );
  writeFileSync(join(OUTPUT, "config.json"), JSON.stringify({ version: 3, routes }));
  console.log(`vercel build: เรียบร้อย (function region ${REGION})`);
}

await main();
