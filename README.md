# CompEngChula Graduation Roadmap

เว็บวางแผนการเรียนและเช็กเงื่อนไขจบการศึกษา วิศวกรรมคอมพิวเตอร์ จุฬาฯ
มองหลักสูตรเป็นกราฟ: วิชา = node, วิชาบังคับก่อน = edge โดยใช้แนวคิดจาก 2110211 Data Structure และ 2110327 Algorithm Design

> กำลังย้ายจาก static site ไปเป็น full-stack โค้ดพร้อม deploy บน Vercel แล้ว แต่ยังไม่ได้ขึ้นออนไลน์ ดู[คู่มือ deploy](docs/deploy.md)

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

### เปิดใช้ปุ่มเข้าสู่ระบบด้วย Google

ถ้ายังไม่ตั้งค่า ระบบทำงานได้ตามปกติ แต่จะซ่อนปุ่มเข้าสู่ระบบ

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/) แล้วสร้างโปรเจกต์
2. ตั้งค่าหน้า OAuth consent โดยขอ scope แค่ `openid`, `email`, `profile` และเพิ่มอีเมลตัวเองเป็น test user
3. สร้าง OAuth client ID แบบ Web application แล้วเพิ่ม Authorized redirect URI เป็น `http://localhost:5173/api/auth/google/callback`
4. สร้างไฟล์ `apps/api/.env` ซึ่ง git จะไม่เก็บ แล้วรัน `pnpm dev:full` ใหม่

```bash
GOOGLE_CLIENT_ID=ค่าที่ได้จาก Google
GOOGLE_CLIENT_SECRET=ค่าที่ได้จาก Google
```

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `pnpm test` | unit test ของ `core`, `contracts` และ integration test ของ API กับ Postgres จริง (ต้องเปิด Docker) |
| `pnpm test:e2e` | ทดสอบหน้าเว็บจริงด้วย Playwright (ครั้งแรกรัน `pnpm --filter @cp/web exec playwright install chromium`) |
| `pnpm test:e2e:api` | รัน E2E ผ่าน API และ Postgres รวมชุดทดสอบบัญชีและการบันทึกแผน |
| `pnpm build:vercel` | สร้างผลลัพธ์สำหรับ Vercel ลงใน `.vercel/output` |
| `pnpm test:e2e:image` | สร้าง Docker image ที่จะ deploy จริง แล้วรัน E2E กับ image นั้น |
| `pnpm image:up` / `pnpm image:down` | เปิด / ปิด image ที่ http://localhost:8090 |
| `pnpm db:backup` | สำรองฐานข้อมูลเป็นไฟล์ใน `backups/` (ต้องตั้ง `DATABASE_URL`) |
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
  src/modules/  API แยกตามเรื่อง: curricula, auth, plans
  src/db/       schema, migrate, seed
  drizzle/      ไฟล์ migration
  test/         integration test กับ Postgres จริง และ Google ปลอมที่ใช้เฉพาะตอนทดสอบ
packages/
  core/         กราฟ กฎ เกรด สรุปหน่วยกิต ฟังก์ชันล้วน ไม่แตะหน้าเว็บหรือฐานข้อมูล
  contracts/    Zod schema ของไฟล์หลักสูตร แผน และไฟล์สำรอง
  curricula/    JSON หลักสูตรและ Markdown ประกาศ
docs/deploy.md  คู่มือ deploy
scripts/        สร้างผลลัพธ์สำหรับ Vercel และสำรองฐานข้อมูล
Dockerfile      image ทางเลือก รวมหน้าเว็บกับ API
index.html      หน้าที่จะแทนเว็บเดิมบน GitHub Pages ช่วยผู้ใช้เดิมนำข้อมูลออก
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

| `GET /api/auth/google` | เริ่มเข้าสู่ระบบด้วย Google (Authorization Code + PKCE) |
| `POST /api/auth/logout` | ออกจากระบบ และยกเลิก session ฝั่ง server |
| `GET /api/me` | ผู้ใช้ปัจจุบัน หรือ `null` ถ้ายังไม่ได้เข้าสู่ระบบ |
| `GET /api/me/export` | ดาวน์โหลดข้อมูลทั้งหมดของฉัน |
| `DELETE /api/me` | ลบบัญชีและข้อมูลทั้งหมดถาวร |
| `GET`, `POST /api/plans` | แผนทั้งหมดของฉัน / สร้างแผนใหม่ (ไม่เกิน 10 แผน) |
| `GET`, `DELETE /api/plans/{id}` | อ่าน / ลบแผน |
| `PUT /api/plans/{id}/state` | บันทึกแผน พร้อม `version` กันการเขียนทับ ถ้าไม่ตรงจะตอบ 409 |

แผนของผู้ใช้คนอื่นตอบ 404 เสมอ เพื่อไม่บอกว่าแผนนั้นมีอยู่จริง และ server ตรวจแผนด้วย `validatePlan` ใน `packages/core` ทุกครั้งก่อนบันทึก

## การบันทึกแผน

- **ไม่เข้าสู่ระบบ:** บันทึกในเบราว์เซอร์นี้
- **เข้าสู่ระบบครั้งแรก:** ย้ายแผนในเบราว์เซอร์เข้าบัญชีให้ ถ้าบัญชีมีแผนที่ต่างกันอยู่แล้วจะให้เลือกฉบับที่จะเก็บ
- **ระหว่างแก้:** เก็บฉบับร่างในเบราว์เซอร์ก่อน แล้วส่งขึ้นบัญชีเมื่อหยุดแก้ 0.8 วินาที เน็ตหลุดหรือปิดแท็บก็ยังส่งต่อได้
- **แก้สองเครื่องพร้อมกัน:** เครื่องที่บันทึกทีหลังจะเห็นว่าสองฉบับต่างกันตรงไหน แล้วเลือกเอง ไม่มีการเขียนทับเงียบ ๆ

หน้าเว็บเลือกแหล่งข้อมูลด้วย `VITE_CURRICULUM_SOURCE`: `pnpm dev` อ่านจากไฟล์ที่ติดมากับเว็บและไม่มีระบบบัญชี ส่วน `pnpm dev:full` อ่านผ่าน API

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
| 4 | Google OAuth + บันทึกแผนข้ามเครื่อง | เสร็จแล้ว (รอทดสอบกับ Google จริง) |
| 5 | Vercel + Supabase, RLS, backup, หน้าย้ายข้อมูลจากเว็บเดิม | โค้ดเสร็จแล้ว รอ deploy จริง |
| 6 | หลายแผน, ประวัติ, ลิงก์แชร์, admin, สถิติ | ยังไม่เริ่ม |
