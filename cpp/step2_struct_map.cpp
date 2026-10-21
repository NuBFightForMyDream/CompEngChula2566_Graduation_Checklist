// ขั้น 2: struct, unordered_map, set
//
//   g++ -std=c++17 step2_struct_map.cpp -o step2 && ./step2
//
// เทียบกับ section 1 และ 8 ใน cp52_checklist_graduation.py

#include <iostream>
#include <set>
#include <string>
#include <unordered_map>
#include <vector>
using namespace std;

// struct = กล่องที่เก็บข้อมูลหลายอย่างของ "วิชาหนึ่งวิชา" ไว้ด้วยกัน
struct Course {
    string id;
    string name;
    int credits;
    string category;   // "gened", "sci", "engfund", "core", ...
};

vector<Course> allCourses = {
    {"2110101", "COMP PROG",       3, "engfund"},
    {"2110111", "EXPL ENG WORLD",  3, "gened"},
    {"2301107", "CALCULUS I",      3, "sci"},
    {"2304103", "GEN PHYS I",      3, "sci"},
    {"2304183", "GEN PHYS LAB I",  1, "sci"},
    {"5500111", "EXP ENG I",       3, "gened"},
    {"2110215", "PROG METH I",     3, "core"},
    {"2110211", "INTRO DATA STRUCT", 3, "core"},
};

// TODO 1: สร้าง map จากรหัสวิชา -> Course  (hash map ค้นหาได้ O(1))
// ใบ้: m[c.id] = c;
unordered_map<string, Course> buildIndex(const vector<Course>& list) {
    unordered_map<string, Course> m;
    return m;
}

// TODO 2: รวมหน่วยกิตของวิชาที่ผ่านแล้ว แยกตามหมวด
// ผลลัพธ์ เช่น {"sci": 7, "gened": 6, "engfund": 3}
// ใบ้: for (const string& id : passed) { result[index.at(id).category] += ...; }
unordered_map<string, int> creditsByCategory(const unordered_map<string, Course>& index,
                                             const set<string>& passed) {
    unordered_map<string, int> result;
    return result;
}

// TODO 3: คืนรายชื่อรหัสวิชาที่ "ยังไม่ผ่าน"
vector<string> notPassed(const vector<Course>& list, const set<string>& passed) {
    return {};
}

// ---------------- ตัวตรวจ (ไม่ต้องแก้) ----------------
void check(const string& name, bool ok) {
    cout << (ok ? "PASS  " : "FAIL  ") << name << "\n";
}

int main() {
    auto index = buildIndex(allCourses);
    check("index มี 8 วิชา", index.size() == 8);
    check("index[2110211].name", index.count("2110211") && index["2110211"].name == "INTRO DATA STRUCT");

    set<string> passed = {"2110101", "2110111", "2301107", "2304103", "2304183", "5500111"};
    auto got = creditsByCategory(index, passed);
    check("sci = 7", got["sci"] == 7);
    check("gened = 6", got["gened"] == 6);
    check("engfund = 3", got["engfund"] == 3);
    check("core = 0", got["core"] == 0);

    auto left = notPassed(allCourses, passed);
    check("ยังไม่ผ่าน 2 วิชา", left.size() == 2);
}
