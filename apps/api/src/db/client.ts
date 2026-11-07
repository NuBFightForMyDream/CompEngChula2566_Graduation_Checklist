import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Db = PostgresJsDatabase<typeof schema>;

export interface DbOptions {
  max?: number | undefined;
  /** ต้องเป็น false เมื่อต่อผ่าน transaction pooler */
  prepare?: boolean | undefined;
  /** ปล่อย connection ที่ไม่ได้ใช้ สำคัญกับ serverless ที่มีหลาย instance */
  idleTimeoutSeconds?: number | undefined;
}

export function createDb(url: string, options: DbOptions = {}) {
  const client = postgres(url, {
    max: options.max ?? 10,
    prepare: options.prepare ?? true,
    ...(options.idleTimeoutSeconds === undefined ? {} : { idle_timeout: options.idleTimeoutSeconds }),
    onnotice: () => {},
  });
  const db: Db = drizzle(client, { schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}
