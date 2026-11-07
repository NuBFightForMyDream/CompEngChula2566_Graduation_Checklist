# คู่มือ deploy

ใช้ Vercel รันหน้าเว็บกับ API และ Supabase เป็นฐานข้อมูล
หน้าเว็บเสิร์ฟจาก CDN ส่วน API รันเป็น function เดียวใน origin เดียวกัน `scripts/vercel-build.ts` เป็นตัวสร้างทั้งสองส่วน

ต้องใช้บัญชี Supabase, Vercel และ Google Cloud ใส่ค่าลับในหน้าตั้งค่าของแต่ละบริการเท่านั้น ห้าม commit ลง repo เพราะ repo นี้เป็น public

## 1. สร้างฐานข้อมูลบน Supabase

1. สร้างโปรเจกต์ใหม่ เลือก region Southeast Asia (Singapore) ให้ตรงกับ function ซึ่งตั้งไว้ที่ `sin1` แล้วเก็บรหัสผ่านฐานข้อมูลไว้
2. เปิดหน้า Connect แล้วคัดลอก connection string 2 แบบ และเติม `?sslmode=require` ท้ายทั้งคู่

| แบบ | พอร์ต | ใช้เป็น | เหตุผล |
|---|---|---|---|
| Transaction pooler | 6543 | `DATABASE_URL` | เหมาะกับ serverless ที่เปิด connection สั้น ๆ จำนวนมาก |
| Session pooler | 5432 | `MIGRATION_DATABASE_URL` | ใช้ตอน migrate และ seed ระหว่าง build |

3. แนะนำให้ปิด Data API ใน Project Settings เพราะแอปนี้ไม่ได้ใช้ ทุกตารางเปิด Row Level Security แบบไม่มี policy ไว้แล้ว การปิดเป็นการป้องกันอีกชั้น

ตารางจะถูกสร้างเองตอน deploy production ไม่ต้องรัน SQL เอง

> Free plan จะ pause โปรเจกต์เมื่อไม่มีการใช้งานราว 1 สัปดาห์ ข้อมูลยังอยู่ แต่เว็บจะโหลดไม่ได้ และ deploy ใหม่จะล้มจนกว่าจะกด restore ในหน้า Supabase

## 2. สร้างโปรเจกต์บน Vercel

1. Add New → Project แล้ว import repo นี้ ไม่ต้องเปลี่ยน Root Directory ค่า install และ build อ่านจาก `vercel.json`
2. ใส่ environment variables ตามตารางด้านล่าง โดยเลือก scope เป็น **Production เท่านั้น**
3. ไปที่ Settings → Environments → Production แล้วเปลี่ยน branch เป็น `restructure`
   ค่าเริ่มต้นคือ `main` ซึ่งยังเป็นเว็บเดิม deployment แรกจึงจะยังไม่ใช่เว็บใหม่
4. กด Redeploy หรือ push ขึ้น `restructure` อีกครั้ง

| ตัวแปร | ค่า | จำเป็น |
|---|---|---|
| `DATABASE_URL` | Transaction pooler จากขั้นที่ 1 | ต้องมี |
| `MIGRATION_DATABASE_URL` | Session pooler จากขั้นที่ 1 | แนะนำ |
| `GOOGLE_CLIENT_ID` | จากขั้นที่ 3 | ถ้าต้องการ login |
| `GOOGLE_CLIENT_SECRET` | จากขั้นที่ 3 | ถ้าต้องการ login |
| `PUBLIC_ORIGIN` | เช่น `https://your-app.vercel.app` ไม่มี `/` ท้าย | ต้องตั้งเมื่อใช้โดเมนอื่น ถ้าไม่ตั้งจะใช้โดเมนหลักของโปรเจกต์ |
| `VERCEL_FUNCTION_REGION` | region ของ function ค่าเริ่มต้น `sin1` | ตั้งเมื่อฐานข้อมูลอยู่ที่อื่น |

Preview deployment จะไม่มีฐานข้อมูลเพราะตัวแปรตั้งไว้เฉพาะ Production หน้าเว็บจึงขึ้นว่าโหลดหลักสูตรไม่สำเร็จ และ build จะไม่ migrate ฐานข้อมูลจริง เป็นพฤติกรรมที่ตั้งใจไว้

## 3. ตั้งค่า Google สำหรับเว็บจริง

1. เพิ่ม Authorized redirect URI เป็น `https://ที่อยู่เว็บ/api/auth/google/callback`
2. เปลี่ยนสถานะหน้า OAuth consent จาก Testing เป็น In production
   ถ้ายังเป็น Testing จะ login ได้เฉพาะอีเมลที่เพิ่มเป็น test user

แนะนำให้สร้าง OAuth client แยกจากที่ใช้ในเครื่อง หลังใส่ค่าใน Vercel แล้วต้อง Redeploy

## 4. ตรวจหลัง deploy

- [ ] Build log มี `migrate: เรียบร้อย`
- [ ] `https://ที่อยู่เว็บ/api/health` ตอบ `{"status":"ok"}`
- [ ] หน้าเว็บเปิดได้ ฟอนต์และสีถูกต้อง และ Console ไม่มี error เรื่อง Content Security Policy
- [ ] header `x-vercel-id` ของ `/api/health` ลงท้ายด้วย function ใน `sin1` ถ้าเป็น `iad1` แปลว่า region ไม่ถูกใช้ และเว็บจะช้า
- [ ] login ด้วย Google ได้ ติ๊กวิชา แล้วเปิดจากอีกเครื่องเห็นข้อมูลเดียวกัน
- [ ] cookie ชื่อ `__Host-session` มี Secure และ HttpOnly
- [ ] ถ้าไม่ได้ปิด Data API ให้เรียก `GET https://โปรเจกต์.supabase.co/rest/v1/users` ด้วย anon key ต้องไม่เห็นข้อมูลผู้ใช้
- [ ] ลองสำรองฐานข้อมูลตามหัวข้อด้านล่าง

## 5. เปลี่ยนจากเว็บเดิมบน GitHub Pages

เว็บเดิมเก็บข้อมูลใน `localStorage` ของโดเมน `github.io` ซึ่งเว็บใหม่อ่านเองไม่ได้
ไฟล์ `index.html` ที่ root ของ repo จึงเป็นหน้าที่ช่วยผู้ใช้เดิมดาวน์โหลดข้อมูลออกมา แล้วนำเข้าที่เว็บใหม่

ทำเมื่อขั้นที่ 1–4 ผ่านหมดแล้วเท่านั้น เพราะการ merge จะแทนที่เว็บเดิมทันที

1. ใส่ที่อยู่เว็บใหม่ใน `NEW_SITE_URL` ใน `index.html`
2. merge `restructure` เข้า `main`
3. เปิดเว็บเดิม แล้วตรวจว่าปุ่มดาวน์โหลดและลิงก์ไปเว็บใหม่ทำงาน
4. เปลี่ยน Production branch บน Vercel กลับเป็น `main`

## สำรองและกู้คืนฐานข้อมูล

ใช้ Session pooler เพราะ `pg_dump` ต้องถือ connection ไว้ตลอดการทำงาน

```bash
# สำรองเป็นไฟล์ใน backups/ ซึ่ง git ไม่เก็บ
DATABASE_URL='session pooler connection string' pnpm db:backup

# กู้คืนไปยังฐานข้อมูลปลายทาง (เขียนทับข้อมูลเดิม) ต้องติดตั้ง pg_restore หรือรันผ่าน image postgres:17
pg_restore --clean --if-exists --no-owner --no-privileges -d "$TARGET_DATABASE_URL" backups/ชื่อไฟล์.dump
```

ไฟล์สำรองมีอีเมลและเกรดของผู้ใช้ เก็บในที่ปลอดภัย และห้ามตั้ง backup อัตโนมัติผ่าน GitHub Actions แล้วเก็บเป็น artifact เพราะ repo นี้เป็น public

## อัปเดตเวอร์ชันใหม่

push ขึ้น Production branch ได้เลย build จะ migrate และนำเข้าหลักสูตรให้ก่อนเปิดเวอร์ชันใหม่
ถ้า migration ล้ม build จะล้ม และเวอร์ชันเดิมยังทำงานต่อ

- โค้ดเวอร์ชันเดิมยังทำงานอยู่ระหว่าง build จึงควร migrate แบบเพิ่มอย่างเดียวเมื่อทำได้ ถ้าต้องลบคอลัมน์หรือตาราง ให้สำรองข้อมูลก่อนเสมอ
- ข้อมูลหลักสูตรถูกเก็บที่ CDN 5 นาที หลังแก้ JSON หน้าเว็บอาจเห็นของเดิมอีกสักครู่

## ทางเลือกอื่น: Docker

`Dockerfile` สร้าง image เดียวที่รวมหน้าเว็บกับ API ใช้กับผู้ให้บริการอื่นได้ และ CI ใช้ทดสอบระบบแบบรวมทุกส่วน
ต้องตั้ง `DATABASE_URL` เป็น Session pooler, `PUBLIC_ORIGIN` และ `TRUSTED_PROXY_HOPS` ตามจำนวน proxy ของผู้ให้บริการนั้น
