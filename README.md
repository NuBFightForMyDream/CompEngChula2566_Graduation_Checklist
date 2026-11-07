# CompEngChula Graduation Roadmap

เว็บวางแผนการเรียนและเช็กเงื่อนไขจบการศึกษา วิศวกรรมคอมพิวเตอร์ จุฬาฯ
มองหลักสูตรเป็นกราฟ: วิชา = node, วิชาบังคับก่อน = edge โดยใช้แนวคิดจาก 2110211 Data Structure และ 2110327 Algorithm Design

> กำลังย้ายจาก static site ไปเป็น full-stack ตอนนี้เสร็จถึงเฟส 3 (API และฐานข้อมูลของหลักสูตร) ส่วนแผนของผู้ใช้ยังบันทึกในเบราว์เซอร์

## เริ่มใช้งาน

ต้องมี Node 24 ขึ้นไป

```bash
corepack enable        # ครั้งแรกครั้งเดียว ให้ใช้คำสั่ง pnpm ตามเวอร์ชันของโปรเจกต์ได้
pnpm install
pnpm dev               # เปิดหน้าเว็บที่ http://localhost:5173
```

รันทั้งระบบ (ต้องเปิด Docker ไว้):

```bash
pnpm dev:full          # เปิด Postgres, migrate + seed, API (:8080) และหน้าเว็บ (:5173) พร้อมกัน
```

เอกสาร API อยู่ที่ http://localhost:8080/api/docs ค่าเริ่มต้นอยู่ใน `apps/api/.env.example` ถ้าต้องการค่าอื่นให้สร้าง `apps/api/.env`

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `pnpm test` | unit test ของ `core`, `contracts` และ integration test ของ API กับ Postgres จริง (ต้องเปิด Docker) |
| `pnpm test:e2e` | ทดสอบหน้าเว็บจริงด้วย Playwright (ครั้งแรกรัน `pnpm --filter @cp/web exec playwright install chromium`) |
| `pnpm test:e2e:api` | รัน E2E ชุดเดียวกัน โดยให้หน้าเว็บโหลดหลักสูตรผ่าน API และ Postgres |
| `pnpm db:up` / `pnpm db:down` | เปิด / ปิด Postgres ใน Docker (ข้อมูลยังอยู่) |
| `pnpm db:setup` | migrate แล้ว seed หลักสูตรเข้าฐานข้อมูล รันซ้ำได้ |
| `pnpm --filter @cp/api db:generate` | สร้างไฟล์ migration หลังแก้ `apps/api/src/db/schema.ts` |
| `pnpm typecheck` | ตรวจ TypeScript |
| `pnpm lint` / `pnpm format` | ตรวจ / จัดรูปแบบโค้ดด้วย Biome |
| `pnpm build` | build หน้าเว็บไปที่ `apps/web/dist` |
| `pnpm checklist --why 2110327` | รันเวอร์ชัน Python |

## โครงสร้าง

```text
apps/web/src/
  app/          จุดเริ่มต้นและโครงหน้า
  features/     หน้าจอแยกตามเรื่อง: board, course-info, summary, grades, planner, notices, export, settings
  stores/       planStore (แผน + undo + บันทึก), uiStore (สถานะหน้าจอ)
  lib/          planRepository, curriculumSource, messages, colors
  styles/       tokens, layout, board, panels, print
apps/api/
  src/modules/  API แยกตามเรื่อง ตอนนี้มี curricula (routes + repo)
  src/db/       schema, migrate, seed
  drizzle/      ไฟล์ migration
  test/         integration test กับ Postgres จริงผ่าน Testcontainers
packages/
  core/         กราฟ กฎ เกรด สรุปหน่วยกิต ฟังก์ชันล้วน ไม่แตะหน้าเว็บหรือฐานข้อมูล
  contracts/    Zod schema ของไฟล์หลักสูตร แผน และไฟล์สำรอง
  curricula/    JSON หลักสูตรและ Markdown ประกาศ
learning/
  python/       เวอร์ชัน Python อ่านง่าย มีคำอธิบายทุกอัลกอริทึม
  cpp/          แบบฝึก C++ ทีละขั้น พร้อมตัวตรวจ PASS / FAIL
```

กฎของระบบอยู่ใน `packages/core` ที่เดียว หน้าเว็บเรียกใช้โดยตรง และเมื่อ API รับแผนจากผู้ใช้ในเฟส 4 จะใช้กฎชุดเดียวกันตรวจซ้ำ

## API

| Endpoint | ใช้ทำอะไร |
|---|---|
| `GET /api/health` | ตรวจว่า API ต่อฐานข้อมูลได้ |
| `GET /api/curricula` | รายชื่อหลักสูตร |
| `GET /api/curricula/{id}` | ข้อมูลหลักสูตรทั้งหมด รูปแบบเดียวกับไฟล์ JSON |
| `GET /api/curricula/{id}/notices` | ประกาศของหลักสูตร |
| `GET /api/curricula/{id}/courses/{courseId}/chain` | วิชาที่ต้องผ่านก่อนและวิชาที่จะกระทบ ด้วย recursive CTE |

หน้าเว็บเลือกแหล่งข้อมูลด้วย `VITE_CURRICULUM_SOURCE`: `pnpm dev` อ่านจากไฟล์ที่ติดมากับเว็บ ส่วน `pnpm dev:full` อ่านผ่าน API

## เงื่อนไขที่ระบบตรวจ

- **วิชาบังคับก่อน (`prereq`)** ติ๊กผ่านไม่ได้ถ้า prereq ยังไม่ผ่าน และ prereq ต้องอยู่เทอมก่อนหน้าเสมอ
- **เทอมที่เปิดสอน (`offered`)** `["1"]` เทอมต้น, `["2"]` เทอมปลาย, ไม่ระบุ = ทุกเทอม เลื่อนข้ามปีได้ แต่ข้ามเทอมไม่ได้
- **เลื่อนตามอัตโนมัติ** ย้ายวิชาแล้ว วิชาที่ต่อเนื่องเลื่อนไปเทอมถัดจาก prereq ที่ช้าที่สุด ปิดได้ในหน้าตั้งค่า
- **วิชาเลือก (`pool`)** เลือกวิชาลงช่องแล้ว ช่องจะได้ `prereq` และ `offered` ของวิชานั้น ถ้าเทอมเดิมไม่เปิดสอนจะย้ายให้ และเลือกวิชาเดียวกันซ้ำในหลายช่องไม่ได้ แม้อยู่คนละ pool
- **วิชาเรียนเพิ่ม** นับเข้า GenEd, 21st Century, Approved, CP Elective หรือ Free Elective ได้ หรือเลือกไม่นับ และนับเป็นภาระหน่วยกิตต่อเทอมเสมอ
- **หน่วยกิตครบ** ต้องครบทุกหมวด หน่วยกิตส่วนเกินของหมวดหนึ่งไม่ชดเชยอีกหมวด

## เกรดและ GPAX

- กดชื่อวิชาแล้วเลือกเกรด A–D และ S นับว่าผ่าน ส่วน F, U, W ไม่ผ่าน และวิชาที่ต่อจากนี้จะถูกยกเลิกผ่านตามด้วย
- GPA คิด Σ(แต้มเกรด × หน่วยกิต) ÷ Σหน่วยกิต เฉพาะเกรด A–F และแสดง 2 ตำแหน่งโดยตัดทศนิยมที่เหลือทิ้ง
- **กรอกเกรดหลายวิชา** วาง `2110101 A` บรรทัดละวิชา หรือรูปแบบ `{"2110101","A"}` จากโค้ด C++

## แก้ข้อมูลหลักสูตร

- รายวิชาอยู่ที่ `packages/curricula/data/comp-eng-2566.json` รายชื่อหลักสูตรอยู่ที่ `data/index.json`
- ไฟล์ JSON คือต้นฉบับของข้อมูล แก้แล้วรัน `pnpm db:setup` เพื่ออัปเดตฐานข้อมูล
- ประกาศเขียนเป็น Markdown ใน `data/notices/` แล้วระบุไฟล์ใน `index.json`
- `pnpm test` ตรวจไฟล์หลักสูตรให้ว่ารหัสอ้างอิงครบ ไม่มี prereq วน และหน่วยกิตแต่ละหมวดรวมกันถูกต้อง

> ข้อมูลถอดจากแผนภาพหลักสูตร ควรตรวจกับเอกสารทางการอีกครั้ง

## แผนถัดไป

| เฟส | งาน | สถานะ |
|---|---|---|
| 0–2 | Monorepo, `core` + test, React + UI ใหม่ | เสร็จแล้ว |
| 3 | PostgreSQL ใน Docker + Hono API อ่านหลักสูตร | เสร็จแล้ว |
| 4 | Google OAuth + บันทึกแผนข้ามเครื่อง | ยังไม่เริ่ม |
| 5 | Deploy (ฐานข้อมูลบน Supabase) และย้ายข้อมูลจากเว็บเดิม | ยังไม่เริ่ม |
| 6 | หลายแผน, ประวัติ, ลิงก์แชร์, admin, สถิติ | ยังไม่เริ่ม |
