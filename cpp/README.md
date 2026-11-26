# แบบฝึก C++ จากโปรเจกต์ Graduation Checklist

เขียนตรรกะในไฟล์ `cp52_checklist_graduation.py` ใหม่เป็น C++ ทีละขั้น
แต่ละไฟล์มีโครงโค้ด มี `// TODO` ให้เติมเอง และมีตัวตรวจที่พิมพ์ `PASS` / `FAIL`

| ไฟล์ | ฝึกอะไร | เทียบกับ Python |
|---|---|---|
| `step1_basics.cpp` | ตัวแปร, `for`, ฟังก์ชัน, `vector`, `string` | — |
| `step2_struct_map.cpp` | `struct`, `unordered_map`, `set` | section 1, 8 |
| `step3_graph.cpp` | adjacency list, DFS (`stack`), BFS (`queue`), topological sort | section 3–6 |

## เตรียมเครื่อง

- **Windows:** ติดตั้ง [MSYS2](https://www.msys2.org/) แล้วรัน `pacman -S mingw-w64-ucrt-x86_64-gcc`
- **Mac:** รัน `xcode-select --install` ใน Terminal
- **ยังไม่อยากติดตั้งอะไร:** ใช้ https://www.onlinegdb.com/ เลือกภาษา C++17 แล้ววางโค้ดทั้งไฟล์

แนะนำ VS Code + ส่วนเสริม "C/C++" ของ Microsoft

## วิธีทำ

```bash
cd cpp
g++ -std=c++17 step1_basics.cpp -o step1
./step1          # Windows: step1.exe
```

ตอนเริ่มจะขึ้น `FAIL` ทุกข้อ (ถูกต้องแล้ว) เติมโค้ดตรง `TODO` ทีละข้อ แล้วคอมไพล์ใหม่จนขึ้น `PASS` ครบ

## ขั้นถัดไป (หลังผ่านทั้ง 3 ไฟล์)

4. อ่าน `data/cp-2022.json` จริงด้วยไลบรารี [nlohmann/json](https://github.com/nlohmann/json) (ไฟล์ `json.hpp` ไฟล์เดียว)
5. ทำเป็นเซิร์ฟเวอร์ด้วย [cpp-httplib](https://github.com/yhirose/cpp-httplib) เช่น `GET /api/available?passed=2110101`
