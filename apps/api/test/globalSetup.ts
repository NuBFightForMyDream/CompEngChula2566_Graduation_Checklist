// เปิด Postgres จริงหนึ่งตัวต่อการรัน test หนึ่งรอบ โดยใช้รุ่นเดียวกับ docker-compose.yml
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    pgUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer("postgres:17-alpine").start();
  project.provide("pgUrl", container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}
