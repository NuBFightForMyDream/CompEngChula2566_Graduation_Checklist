#!/bin/sh
# ปรับโครงสร้างฐานข้อมูลก่อนเปิดรับผู้ใช้ ถ้าขั้นตอนไหนล้ม container จะหยุดแทนการเปิดด้วยฐานข้อมูลที่ไม่ตรงกับโค้ด
set -e
node src/db/migrate-cli.ts
node src/db/seed-cli.ts
# exec เพื่อให้ Node รับสัญญาณปิดจาก Docker โดยตรง และปิดการเชื่อมต่อได้เรียบร้อย
exec node src/index.ts
