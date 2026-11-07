import { env } from "../env.ts";
import { createDb } from "./client.ts";
import { seedCurricula } from "./seed.ts";

const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
try {
  const result = await seedCurricula(db);
  console.log(
    result.written
      ? `seed: หลักสูตร ${result.curricula} รายการ, ประกาศ ${result.notices} รายการ`
      : "seed: ข้อมูลเป็นปัจจุบันอยู่แล้ว",
  );
} finally {
  await close();
}
