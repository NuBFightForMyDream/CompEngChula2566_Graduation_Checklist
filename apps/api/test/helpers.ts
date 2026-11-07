import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { inject } from "vitest";
import { createDb } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";

/** แต่ละไฟล์ test ได้ฐานข้อมูลของตัวเอง จึงรันพร้อมกันได้โดยไม่กวนกัน */
export async function createTestDb() {
  const adminUrl = inject("pgUrl");
  const name = `t_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const handle = createDb(url.toString(), { max: 4 });
  await runMigrations(handle.db);
  return handle;
}
