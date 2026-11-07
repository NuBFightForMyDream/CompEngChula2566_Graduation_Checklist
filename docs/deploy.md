# คู่มือ deploy

ทั้งระบบเป็น Docker image เดียวที่รวมหน้าเว็บกับ API ใช้กับผู้ให้บริการไหนก็ได้ที่รัน Docker และต่อ Postgres ได้
คู่มือนี้ใช้ Supabase เป็นฐานข้อมูล และ Render เป็นตัวอย่างที่รัน image

ก่อนเริ่ม ลองรัน image ในเครื่องด้วย `pnpm test:e2e:image` ให้ผ่านก่อน

## 1. สร้างฐานข้อมูลบน Supabase

1. สร้างโปรเจกต์ใหม่ เลือก region ใกล้ผู้ใช้และใกล้เซิร์ฟเวอร์ แล้วเก็บรหัสผ่านฐานข้อมูลไว้
2. เปิดหน้า Connect แล้วคัดลอก connection string แบบ **Session pooler**
   - ไม่ใช้ Direct connection เพราะเป็น IPv6 โดยปกติ ผู้ให้บริการส่วนมากต่อไม่ได้
   - ไม่ใช้ Transaction pooler เพราะไม่รองรับ prepared statements และแอปนี้เป็นเซิร์ฟเวอร์ที่รันตลอด ไม่ใช่ serverless
3. เติม `?sslmode=require` ท้าย connection string
4. แนะนำให้ปิด Data API ใน Project Settings เพราะแอปนี้ไม่ได้ใช้ ทุกตารางเปิด Row Level Security แบบไม่มี policy ไว้แล้ว การปิดเป็นการป้องกันอีกชั้น

ตารางจะถูกสร้างเองตอน container เริ่มทำงาน ไม่ต้องรัน SQL เอง

> Free plan จะ pause โปรเจกต์เมื่อไม่มีการใช้งานราว 1 สัปดาห์ ข้อมูลยังอยู่ แต่เว็บจะใช้ไม่ได้จนกว่าจะกด restore ในหน้า Supabase

## 2. รัน image บน Render

1. สร้าง Web Service แล้วเชื่อมกับ repo เลือก branch ที่ต้องการ และ runtime เป็น Docker
2. เลือก region เดียวกับฐานข้อมูลถ้าทำได้
3. ตั้ง Health Check Path เป็น `/api/health`
4. ใส่ environment variables ตามตารางด้านล่าง

> Free plan จะหลับเมื่อไม่มีการใช้งาน 15 นาที และใช้เวลาตื่นราว 1 นาที คำขอแรกหลังจากนั้นจึงช้า

| ตัวแปร | ค่า | จำเป็น |
|---|---|---|
| `DATABASE_URL` | connection string จากขั้นที่ 1 | ต้องมี |
| `PUBLIC_ORIGIN` | ที่อยู่เว็บ เช่น `https://your-app.onrender.com` ไม่มี `/` ท้าย | ต้องมี |
| `DATABASE_MAX_CONNECTIONS` | `5` | แนะนำ เพื่อไม่ให้ชนเพดานของ pooler |
| `TRUSTED_PROXY_HOPS` | `1` แล้วตรวจตามขั้นที่ 4 | แนะนำ |
| `GOOGLE_CLIENT_ID` | จากขั้นที่ 3 | ถ้าต้องการ login |
| `GOOGLE_CLIENT_SECRET` | จากขั้นที่ 3 | ถ้าต้องการ login |

ใส่ค่าเหล่านี้ในหน้าตั้งค่าของผู้ให้บริการเท่านั้น ห้าม commit ลง repo เพราะ repo นี้เป็น public

## 3. ตั้งค่า Google สำหรับเว็บจริง

1. เพิ่ม Authorized redirect URI เป็น `https://ที่อยู่เว็บ/api/auth/google/callback`
2. เปลี่ยนสถานะหน้า OAuth consent จาก Testing เป็น In production
   ถ้ายังเป็น Testing จะ login ได้เฉพาะอีเมลที่เพิ่มเป็น test user

แนะนำให้สร้าง OAuth client แยกจากที่ใช้ในเครื่อง

## 4. ตรวจหลัง deploy

- [ ] `https://ที่อยู่เว็บ/api/health` ตอบ `{"status":"ok"}`
- [ ] หน้าเว็บเปิดได้ ฟอนต์และสีถูกต้อง และ Console ไม่มี error เรื่อง Content Security Policy
- [ ] login ด้วย Google ได้ ติ๊กวิชา แล้วเปิดจากอีกเครื่องเห็นข้อมูลเดียวกัน
- [ ] cookie ชื่อ `__Host-session` มี Secure และ HttpOnly
- [ ] ตรวจ `TRUSTED_PROXY_HOPS`: เปิด `/api/auth/google` จากเครือข่ายสองแห่ง ต้องถูกนับเพดานแยกกัน
      ถ้าถูกนับรวมกันแปลว่าค่าน้อยหรือมากเกินจำนวน proxy จริง ให้ปรับแล้วลองใหม่
- [ ] Data API เข้าถึงข้อมูลไม่ได้ ถ้าไม่ได้ปิด ให้เรียก `GET https://โปรเจกต์.supabase.co/rest/v1/users` ด้วย anon key ต้องไม่เห็นข้อมูลผู้ใช้
- [ ] ลองสำรองฐานข้อมูลตามหัวข้อด้านล่าง

## 5. เปลี่ยนจากเว็บเดิมบน GitHub Pages

เว็บเดิมเก็บข้อมูลใน `localStorage` ของโดเมน `github.io` ซึ่งเว็บใหม่อ่านเองไม่ได้
ไฟล์ `index.html` ที่ root ของ repo จึงเป็นหน้าที่ช่วยผู้ใช้เดิมดาวน์โหลดข้อมูลออกมา แล้วนำเข้าที่เว็บใหม่

ทำเมื่อขั้นที่ 1–4 ผ่านหมดแล้วเท่านั้น เพราะการ merge จะแทนที่เว็บเดิมทันที

1. ใส่ที่อยู่เว็บใหม่ใน `NEW_SITE_URL` ใน `index.html`
2. merge `restructure` เข้า `main`
3. เปิดเว็บเดิม แล้วตรวจว่าปุ่มดาวน์โหลดและลิงก์ไปเว็บใหม่ทำงาน

## สำรองและกู้คืนฐานข้อมูล

```bash
# สำรองเป็นไฟล์ใน backups/ ซึ่ง git ไม่เก็บ
DATABASE_URL='connection string' pnpm db:backup

# กู้คืนไปยังฐานข้อมูลปลายทาง (เขียนทับข้อมูลเดิม) ต้องติดตั้ง pg_restore หรือรันผ่าน image postgres:17
pg_restore --clean --if-exists --no-owner --no-privileges -d "$TARGET_DATABASE_URL" backups/ชื่อไฟล์.dump
```

ไฟล์สำรองมีอีเมลและเกรดของผู้ใช้ เก็บในที่ปลอดภัย และห้ามตั้ง backup อัตโนมัติผ่าน GitHub Actions แล้วเก็บเป็น artifact เพราะ repo นี้เป็น public

## อัปเดตเวอร์ชันใหม่

push ขึ้น branch ที่ผู้ให้บริการติดตามอยู่ ตอนเริ่มทำงาน container จะรัน migration และนำเข้าหลักสูตรให้เอง
ถ้า migration ล้ม container จะหยุด แทนการเปิดด้วยฐานข้อมูลที่ไม่ตรงกับโค้ด

Migration ควรเป็นแบบเพิ่มอย่างเดียวเมื่อทำได้ ถ้าต้องลบคอลัมน์หรือตาราง ให้สำรองข้อมูลก่อนเสมอ
