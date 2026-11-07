// ขั้น 4: ตรวจลำดับเทอมและเลื่อนวิชาตาม — ตรรกะตอนลากการ์ดบนหน้าเว็บ
//
//   g++ -std=c++17 step4_shift.cpp -o step4 && ./step4
//
// ตัวจริงอยู่ที่ packages/core/src/graph.ts (findConflicts, shiftDependents, chainDepth)
//
//   2110101 ─┬─> 2110215
//            └─> 2110211 ─┬─> 2110327 <── 2110200
//                         └─> 2110313

#include <algorithm>
#include <iostream>
#include <map>
#include <set>
#include <string>
#include <utility>
#include <vector>
using namespace std;

struct Course {
    string id;
    vector<string> prereq;
    string offered;  // "1" = เทอมต้น, "2" = เทอมปลาย, "" = ทุกเทอม
};

const vector<Course> COURSES = {
    {"2110101", {}, ""},
    {"2110200", {}, "1"},
    {"2110211", {"2110101"}, "1"},
    {"2110215", {"2110101"}, ""},
    {"2110313", {"2110211"}, ""},
    {"2110327", {"2110200", "2110211"}, "2"},
};

const Course& findCourse(const string& id) {
    for (const Course& c : COURSES)
        if (c.id == id) return c;
    return COURSES[0];
}

// ลำดับที่ prereq มาก่อนเสมอ (ผลจาก topological sort ในขั้น 3)
const vector<string> ORDER = {"2110101", "2110200", "2110211", "2110215", "2110313", "2110327"};

const vector<string> SEMS = {"1/1", "1/2", "2/1", "2/2", "3/1", "3/2", "4/1", "4/2", "5/1", "5/2"};

// TODO 1: แปลงเทอมเป็นเลขลำดับ เช่น "1/1" = 0, "1/2" = 1, "2/1" = 2, "5/2" = 9
// ใบ้: (ปี - 1) * 2 + (เทอม - 1)  และ s[0] - '0' แปลงตัวอักษรเป็นตัวเลข
int semIdx(const string& sem) {
    return -1;
}

// TODO 2: วิชานี้เปิดสอนในเทอมนี้ไหม
// ใบ้: offered ว่าง = เปิดทุกเทอม ไม่งั้นเทียบกับตัวอักษรหลัง "/" ของ sem
bool offeredIn(const Course& c, const string& sem) {
    return false;
}

// TODO 3: หาคู่ {prereq, วิชา} ที่ prereq ไม่ได้อยู่เทอมก่อนหน้าแบบเคร่ง
// ใบ้: เทอมเดียวกันก็ถือว่าผิด ใช้ semIdx(place[p]) >= semIdx(place[id])
vector<pair<string, string>> findConflicts(map<string, string> place) {
    vector<pair<string, string>> bad;
    return bad;
}

struct ShiftResult {
    map<string, string> place;
    vector<string> stuck;  // วิชาที่ต้องเลื่อนเกินปี 5
};

// TODO 4: เดินตาม ORDER แล้วดันวิชาที่ผิดลำดับไปเทอมถัดจาก prereq ที่ช้าที่สุด
// ใบ้: ข้ามวิชาที่ไม่มี prereq
//      need = max(semIdx ของ prereq ทุกตัว ในแผนล่าสุด) + 1
//      while (need < 10 && วิชาไม่เปิดเทอม SEMS[need]) need++
//      ถ้าวิชาอยู่ที่ need หรือช้ากว่าแล้ว = ไม่ต้องทำอะไร
//      ถ้า need >= 10 ใส่ stuck แล้วปล่อยไว้ที่เดิม ไม่งั้นย้ายไป SEMS[need]
ShiftResult shiftDependents(map<string, string> place) {
    return {place, {}};
}

// TODO 5: DP บน DAG — ความยาวสายวิชาที่เหลือ นับตัวเองด้วย
// ใบ้: depth[v] = 1 + max(depth ของวิชาที่ v ปลดล็อก) ถ้าไม่ปลดล็อกอะไรเลย depth[v] = 1
//      เดิน ORDER จากหลังมาหน้า ค่าที่ต้องใช้จะคำนวณไว้แล้วเสมอ
map<string, int> chainDepth() {
    map<string, int> depth;
    return depth;
}

// ---------------- ตัวตรวจ (ไม่ต้องแก้) ----------------
void check(const string& name, bool ok) {
    cout << (ok ? "PASS  " : "FAIL  ") << name << "\n";
}

map<string, string> basePlan() {
    return {{"2110101", "1/1"}, {"2110200", "2/1"}, {"2110211", "2/1"},
            {"2110215", "1/2"}, {"2110313", "2/2"}, {"2110327", "2/2"}};
}

int main() {
    check("semIdx: 1/1 = 0, 2/1 = 2, 5/2 = 9", semIdx("1/1") == 0 && semIdx("2/1") == 2 && semIdx("5/2") == 9);

    check("offeredIn: 2110211 เปิดเทอมต้น ลง 3/1 ได้ ลง 2/2 ไม่ได้",
          offeredIn(findCourse("2110211"), "3/1") && !offeredIn(findCourse("2110211"), "2/2"));
    check("offeredIn: 2110215 เปิดทุกเทอม", offeredIn(findCourse("2110215"), "2/2"));

    check("แผนตั้งต้นไม่มีคู่ที่ผิดลำดับ", findConflicts(basePlan()).empty());
    auto moved = basePlan();
    moved["2110211"] = "2/2";  // อยู่เทอมเดียวกับ 2110313 และ 2110327 ซึ่งต้องเรียนต่อจากมัน
    auto bad = findConflicts(moved);
    set<pair<string, string>> badSet(bad.begin(), bad.end());
    check("เทอมเดียวกันนับว่าผิดลำดับ",
          badSet == set<pair<string, string>>{{"2110211", "2110313"}, {"2110211", "2110327"}});

    auto p1 = basePlan();
    p1["2110211"] = "3/1";
    auto r1 = shiftDependents(p1);
    check("ย้าย 2110211 ไป 3/1 แล้ววิชาที่ต่อเนื่องเลื่อนไป 3/2",
          r1.place["2110313"] == "3/2" && r1.place["2110327"] == "3/2" && r1.stuck.empty());

    auto p2 = basePlan();
    p2["2110200"] = "2/2";
    auto r2 = shiftDependents(p2);
    check("ข้ามเทอมที่ไม่เปิด: 2110327 เปิดเทอมปลาย จึงไป 3/2 ไม่ใช่ 3/1", r2.place["2110327"] == "3/2");

    auto p3 = basePlan();
    p3["2110101"] = "5/2";
    auto r3 = shiftDependents(p3);
    set<string> stuck(r3.stuck.begin(), r3.stuck.end());
    check("เลื่อนเกินปี 5 ไม่ได้: วิชาติด stuck และอยู่ที่เดิม",
          stuck.count("2110211") && stuck.count("2110215") && r3.place["2110211"] == "2/1");

    auto depth = chainDepth();
    check("chainDepth: 2110101 ยาว 3, 2110211 ยาว 2, 2110327 ยาว 1",
          depth["2110101"] == 3 && depth["2110211"] == 2 && depth["2110327"] == 1);
}
