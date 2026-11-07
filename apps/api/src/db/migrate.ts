import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Db } from "./client.ts";

const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

export const runMigrations = (db: Db) => migrate(db, { migrationsFolder: MIGRATIONS });
