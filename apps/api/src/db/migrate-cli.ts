import { env } from "../env.ts";
import { createDb } from "./client.ts";
import { runMigrations } from "./migrate.ts";

const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
try {
  await runMigrations(db);
  console.log("migrate: เรียบร้อย");
} finally {
  await close();
}
