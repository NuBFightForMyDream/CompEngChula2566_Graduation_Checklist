// จุดเริ่มต้นใน Docker: ปรับฐานข้อมูลก่อนเปิดรับผู้ใช้ ถ้าล้มจะหยุด แทนการเปิดด้วยฐานข้อมูลที่ไม่ตรงกับโค้ด
// รวมเป็นโปรเซสเดียว เพราะบนเครื่องสเปกต่ำการเปิด Node หลายรอบใช้เวลาเกือบทั้งหมดของการบูต

import { createDb } from "./db/client.ts";
import { runMigrations } from "./db/migrate.ts";
import { seedCurricula } from "./db/seed.ts";
import { env } from "./env.ts";

const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
try {
  await runMigrations(db);
  const seeded = await seedCurricula(db);
  console.log(`เตรียมฐานข้อมูลแล้ว${seeded.written ? " และอัปเดตหลักสูตร" : ""}`);
} finally {
  await close();
}

await import("./index.ts");
