# คู่มือตั้งค่า Firebase และ deploy

เว็บนี้เป็นไฟล์ static ล้วน ไม่มีเซิร์ฟเวอร์ของตัวเอง

- **Firebase Authentication** ทำหน้าที่ Google login
- **Cloud Firestore** เก็บแผนของแต่ละคนที่ `users/{uid}/plans/{curriculumId}`
- **Vercel** เสิร์ฟหน้าเว็บ จะย้ายไปที่อื่นที่เสิร์ฟไฟล์ static ได้ก็ได้ เช่น GitHub Pages หรือ Firebase Hosting

ทุกอย่างใช้ free plan ได้ ไม่ต้องผูกบัตร

## 1. สร้างโปรเจกต์ Firebase

1. เข้า [Firebase console](https://console.firebase.google.com/) แล้วกด Create a project ไม่ต้องเปิด Google Analytics
2. **Authentication** → Get started → Sign-in method → Google → Enable → เลือกอีเมลสำหรับ support → Save
3. **Firestore Database** → Create database
   - Location: `asia-southeast1 (Singapore)` เปลี่ยนทีหลังไม่ได้
   - เลือก Start in **production mode**
4. ในหน้า Firestore เปิดแท็บ **Rules** แล้ววางเนื้อหาทั้งหมดของ [`firestore.rules`](../firestore.rules) ทับของเดิม แล้วกด Publish
   ถ้าไม่ทำข้อนี้ จะบันทึกแผนไม่ได้ เพราะ production mode ปฏิเสธทุกคำขอ

## 2. ใส่ค่าของโปรเจกต์ลงในโค้ด

1. กดรูปเฟือง → Project settings → Your apps → ไอคอน `</>` (Web) → ตั้งชื่อแอป → Register app ไม่ต้องติ๊ก Firebase Hosting
2. คัดลอก 4 ค่าจาก `firebaseConfig` ที่ขึ้นมา ไปใส่ใน [`apps/web/src/lib/firebaseConfig.ts`](../apps/web/src/lib/firebaseConfig.ts)

```ts
const project = {
  apiKey: "AIza...",
  authDomain: "ชื่อโปรเจกต์.firebaseapp.com",
  projectId: "ชื่อโปรเจกต์",
  appId: "1:...:web:...",
};
```

ค่าเหล่านี้ commit ลง repo ได้ เพราะไม่ใช่ความลับ ทุกคนที่เปิดเว็บก็เห็นอยู่แล้ว สิ่งที่กันไม่ให้คนอื่นอ่านข้อมูลคือ `firestore.rules`

3. รัน `pnpm dev` แล้วเปิด http://localhost:5173 จะมีปุ่ม "เข้าสู่ระบบด้วย Google" ลอง login แล้วติ๊กวิชา แล้วดูว่าข้อมูลขึ้นใน Firestore → Data
   `localhost` ได้รับอนุญาตให้ login อยู่แล้ว ไม่ต้องตั้งเพิ่ม

## 3. Deploy บน Vercel

1. Add New → Project แล้ว import repo นี้ ไม่ต้องเปลี่ยน Root Directory และไม่ต้องตั้ง environment variable ค่า install และ build อ่านจาก [`vercel.json`](../vercel.json)
2. ไปที่ Settings → Environments → Production แล้วเปลี่ยน branch เป็น `firebase` ค่าเริ่มต้นคือ `main` ซึ่งยังเป็นเว็บเดิม
3. กด Redeploy แล้วจดที่อยู่เว็บไว้ เช่น `https://ชื่อโปรเจกต์.vercel.app`
4. กลับไปที่ Firebase → Authentication → Settings → **Authorized domains** → Add domain แล้วใส่ที่อยู่เว็บโดยไม่ใส่ `https://`
   ถ้าไม่เพิ่ม หน้าต่าง login จะขึ้น error ว่าโดเมนนี้ไม่ได้รับอนุญาต

## 4. ตรวจหลัง deploy

- [ ] หน้าเว็บเปิดได้ ฟอนต์และสีถูกต้อง และ Console ไม่มี error
- [ ] login ด้วย Google ได้ ติ๊กวิชา แล้วเปิดจากอีกเครื่องเห็นข้อมูลเดียวกัน
- [ ] เปิดสองเครื่องพร้อมกัน แก้จากเครื่องหนึ่ง อีกเครื่องเปลี่ยนตามโดยไม่ต้อง reload
- [ ] ออกจากระบบแล้วกระดานกลับเป็นแผนว่าง

## แก้ข้อมูลหลักสูตรหรือประกาศ

แก้ไฟล์ใน [`data/`](../data) แล้ว push ขึ้น branch ที่ Vercel ใช้ Vercel จะ build และเปิดเวอร์ชันใหม่ให้เอง

## แก้ firestore.rules

หลังแก้ไฟล์ ต้องวางเนื้อหาใหม่ในแท็บ Rules แล้วกด Publish อีกครั้ง
หรือใช้คำสั่ง (ครั้งแรกต้อง login ก่อนด้วย `pnpm exec firebase login`)

```bash
pnpm exec firebase deploy --only firestore:rules --project ชื่อโปรเจกต์
```

ก่อนแก้ ควรรัน `pnpm test:e2e:firebase` เพราะมี test ที่ตรวจว่าบัญชีอื่นอ่านแผนของเราไม่ได้

## ข้อจำกัดของ free plan (Spark)

- Firestore มีโควตาต่อวัน ตอนที่เขียนคู่มือนี้คืออ่าน 50,000 ครั้ง เขียน 20,000 ครั้ง และเก็บได้ 1 GiB ถ้าเกินจะใช้งานไม่ได้จนถึงวันถัดไป ไม่มีการเก็บเงิน ควรตรวจตัวเลขล่าสุดที่หน้าราคาของ Firebase
- เว็บรอหยุดแก้ 0.8 วินาทีก่อนบันทึก การติ๊กรัว ๆ จึงนับเป็นการเขียนครั้งเดียว
- ไม่มี backup อัตโนมัติ ผู้ใช้ดาวน์โหลดข้อมูลของตัวเองได้จากเมนูบัญชี → "ดาวน์โหลดข้อมูลของฉัน"

## เปลี่ยนจากเว็บเดิมบน GitHub Pages

เว็บเดิมเก็บข้อมูลใน `localStorage` ของโดเมน `github.io` ซึ่งเว็บใหม่บน Vercel อ่านเองไม่ได้
ไฟล์ `index.html` ที่ root ของ repo จึงเป็นหน้าที่ช่วยผู้ใช้เดิมดาวน์โหลดข้อมูลออกมา แล้วนำเข้าที่เว็บใหม่

ทำเมื่อขั้นที่ 1–4 ผ่านหมดแล้วเท่านั้น เพราะการ merge จะแทนที่เว็บเดิมทันที

1. ใส่ที่อยู่เว็บใหม่ใน `NEW_SITE_URL` ใน `index.html`
2. merge `firebase` เข้า `main`
3. เปิดเว็บเดิม แล้วตรวจว่าปุ่มดาวน์โหลดและลิงก์ไปเว็บใหม่ทำงาน
4. เปลี่ยน Production branch บน Vercel กลับเป็น `main`
