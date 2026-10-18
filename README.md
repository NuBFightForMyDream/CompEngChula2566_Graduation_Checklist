# CompEngChula Graduation Checklist & Roadmap

Checklist และ roadmap เงื่อนไขการจบการศึกษา ที่เอาไอเดียจากวิชา 2110211 Data Structure และ 2110327 Algorithm Design มาใช้
โดยมองหลักสูตรเป็นกราฟ: วิชา = node, วิชาบังคับก่อน = edge

## ไฟล์

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `data/cp-2022.json` | ข้อมูลหลักสูตร 1 หลักสูตร (วิชา, หน่วยกิต, หมวด, เทอมตามแผน, prereq) |
| `data/index.json` | รายชื่อหลักสูตรทั้งหมดที่เว็บโหลดได้ |
| `cp52_checklist_graduation.py` | เวอร์ชัน Python อ่านง่าย มีคำอธิบายทุกอัลกอริทึม |
| `index.html` | หน้าเว็บ (HTML + JS ล้วน ไม่ต้อง build) |

## รันเวอร์ชัน Python

```bash
python3 cp52_checklist_graduation.py --passed 2110101,2110215,2110211
python3 cp52_checklist_graduation.py --passed-file my_passed.txt --why 2110327

# ย้ายวิชาไปเทอมอื่น แล้วให้เลื่อนวิชาที่ต่อเนื่องตามไปอัตโนมัติ
python3 cp52_checklist_graduation.py --move 2110211=3/1 --shift
```

## เปิดหน้าเว็บในเครื่อง

```bash
python3 -m http.server 8000
# แล้วเปิด http://localhost:8000
```

ถ้าจะ deploy ให้เปิด GitHub Pages ที่ Settings → Pages → Deploy from branch → `main` / root

## เงื่อนไขที่ระบบตรวจ

- **วิชาบังคับก่อน (`prereq`)** — ติ๊กว่าผ่านไม่ได้ถ้า prereq ยังไม่ผ่าน และ prereq ต้องอยู่เทอมก่อนหน้าเสมอ
- **เทอมที่เปิดสอน (`offered`)** — `["1"]` เปิดเฉพาะเทอมต้น, `["2"]` เฉพาะเทอมปลาย, ไม่ใส่ = ทุกเทอม
  วิชาแบบนี้เลื่อนข้ามปีได้ แต่ข้ามเทอมไม่ได้ (เช่น 2110211 ย้ายจาก 2/1 ไป 3/1 ได้ แต่ไป 2/2 ไม่ได้)
- **ช่องวิชาเลือก (`pool`)** — ELECTIVE / APPROVED / FREE เลือกวิชาจาก `pools` หรือกรอกเองได้
  (รายการใน `pools` ตอนนี้เป็นตัวอย่าง ให้แทนด้วยรายชื่อวิชาจริงจากภาควิชา)

## เพิ่มหลักสูตรใหม่

1. คัดลอก `data/cp-2022.json` เป็นไฟล์ใหม่ แล้วแก้รายวิชา
2. เพิ่มบรรทัดใน `data/index.json`

> ข้อมูล `cp-2022.json` ถอดจากแผนภาพหลักสูตร prerequisite ใส่เฉพาะตามลูกศรในรูป ควรตรวจกับเอกสารทางการอีกครั้ง
