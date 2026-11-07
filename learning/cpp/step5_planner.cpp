// ขั้น 5: GPA, สรุปหน่วยกิต, วิชาเลือก และจัดแผนเทอมที่เหลือ
//
//   g++ -std=c++17 step5_planner.cpp -o step5 && ./step5
//
// ตัวจริงอยู่ที่ packages/core/src/ (grades.ts, summary.ts, model.ts, planner.ts)

#include <algorithm>
#include <cmath>
#include <iostream>
#include <map>
#include <set>
#include <string>
#include <vector>
using namespace std;

// ---------- ส่วนที่ 1: เกรด ----------
struct Record {
    string grade;
    int credits;
};

// TODO 1: GPA = Σ(แต้ม × หน่วยกิต) / Σหน่วยกิต คืน -1 ถ้าไม่มีวิชาที่นับ
// ใบ้: A=4 B+=3.5 B=3 C+=2.5 C=2 D+=1.5 D=1 F=0 ส่วน S, U, W ไม่นับ
double gpa(const vector<Record>& records) {
    return -1;
}

// TODO 2: ตัดให้เหลือ 2 ตำแหน่งโดยไม่ปัดขึ้น เช่น 3.999 -> 3.99
// ใบ้: floor(x * 100 + 1e-9) / 100  ส่วน 1e-9 กันปัญหาทศนิยมของ double
double truncate2(double x) {
    return x;
}

// ---------- ส่วนที่ 2: หน่วยกิตรายหมวด ----------
struct Category {
    string key;
    int required;
    int got;
};

// TODO 3: หน่วยกิตที่ยังขาด โดยหน่วยกิตส่วนเกินของหมวดหนึ่งชดเชยอีกหมวดไม่ได้
// ใบ้: รวม max(0, required - got) ของทุกหมวด
int remainingCredits(const vector<Category>& categories) {
    return -1;
}

// ---------- ส่วนที่ 3: วิชาเลือก ----------
struct Option {
    string id;
    vector<string> prereq;
    string offered;
};

struct Slot {
    string id;
    vector<string> prereq;
    string offered;
};

// TODO 4: ช่องที่เลือกวิชาแล้ว ต้องได้ prereq และ offered ของวิชาที่เลือก
// ใบ้: choice ว่าง = ยังไม่เลือก คืนช่องเดิม
//      หา option ที่ id ตรงกับ choice ถ้าไม่เจอให้คืนช่องเดิม
Slot effectiveSlot(const Slot& slot, const vector<Option>& options, const string& choice) {
    return slot;
}

// ---------- ส่วนที่ 4: จัดแผนเทอมที่เหลือ ----------
struct Course {
    string id;
    vector<string> prereq;
    int credits;
    string offered;
};

struct Term {
    string sem;
    vector<string> courses;
    int credits;
};

// แปลงเลขลำดับเป็นเทอม: 0 = "1/1", 1 = "1/2", 2 = "2/1"
string semAt(int i) {
    return to_string(i / 2 + 1) + "/" + to_string(i % 2 + 1);
}

// TODO 5: Greedy — แต่ละรอบคือหนึ่งเทอมจริง เริ่มจากเทอมลำดับ start
// ใบ้: เลือกจากวิชาที่ยังไม่ผ่าน, prereq ผ่านครบแล้ว และเปิดเทอมนี้
//      เรียงตาม id เพื่อให้ผลคงที่ แล้วหยิบตามลำดับ ถ้าหยิบแล้วไม่เกิน maxCredits
//      วิชาที่เพิ่งหยิบในเทอมนี้ยังนับเป็น prereq ไม่ได้จนจบเทอม
//      ถ้าไม่มีวิชาที่ปลดล็อกแล้วเลย หรือมีแต่หยิบไม่ลงสักตัว ให้หยุด
vector<Term> planRemaining(const vector<Course>& courses, set<string> passed, int start, int maxCredits) {
    vector<Term> plan;
    return plan;
}

// ---------------- ตัวตรวจ (ไม่ต้องแก้) ----------------
void check(const string& name, bool ok) {
    cout << (ok ? "PASS  " : "FAIL  ") << name << "\n";
}

bool near(double a, double b) {
    return fabs(a - b) < 1e-9;
}

int main() {
    check("gpa ถ่วงด้วยหน่วยกิต: A(3) กับ C(1) = 3.5", near(gpa({{"A", 3}, {"C", 1}}), 3.5));
    check("gpa ไม่นับ S U W", near(gpa({{"B", 3}, {"S", 3}, {"U", 1}, {"W", 3}}), 3.0));
    check("gpa คืน -1 เมื่อไม่มีวิชาที่นับ", near(gpa({{"S", 3}}), -1));

    check("truncate2(3.999) = 3.99 ไม่ปัดเป็น 4.00", near(truncate2(3.999), 3.99));
    check("truncate2(3.29) = 3.29 ไม่หล่นเป็น 3.28", near(truncate2(3.29), 3.29));

    check("ยังขาด 40 หน่วยกิต", remainingCredits({{"core", 40, 0}, {"free", 6, 6}}) == 40);
    check("เรียนเกินหมวด free ไม่ไปชดเชยหมวด core", remainingCredits({{"core", 40, 0}, {"free", 6, 50}}) == 40);

    Slot slot{"APPR-2", {}, ""};
    vector<Option> options = {{"2110413", {"2110313", "2110471"}, "1"}, {"2110452", {"2110352"}, "2"}};
    check("ยังไม่เลือก = ใช้ช่องเดิม", effectiveSlot(slot, options, "").prereq.empty());
    Slot chosen = effectiveSlot(slot, options, "2110452");
    check("เลือกแล้วได้ prereq และ offered ของวิชานั้น",
          chosen.prereq == vector<string>{"2110352"} && chosen.offered == "2" && chosen.id == "APPR-2");

    vector<Course> courses = {
        {"A", {}, 3, ""},
        {"B", {"A"}, 3, ""},
        {"C", {}, 3, "2"},
        {"D", {"B"}, 3, "1"},
    };
    auto plan = planRemaining(courses, {}, 0, 6);
    check("เทอม 1/1: หยิบ A ส่วน C เปิดเทอมปลาย และ B ยังติด prereq",
          plan.size() > 0 && plan[0].sem == "1/1" && plan[0].courses == vector<string>{"A"} && plan[0].credits == 3);
    check("เทอม 1/2: หยิบ B กับ C", plan.size() > 1 && plan[1].courses == vector<string>{"B", "C"});
    check("เทอม 2/1: หยิบ D", plan.size() == 3 && plan[2].sem == "2/1" && plan[2].courses == vector<string>{"D"});

    auto partial = planRemaining(courses, {"A", "B"}, 3, 3);
    check("เริ่มจากเทอม 2/2 และไม่เกินเพดานหน่วยกิต",
          partial.size() == 2 && partial[0].sem == "2/2" && partial[0].courses == vector<string>{"C"} &&
              partial[1].courses == vector<string>{"D"});

    check("หน่วยกิตเกินเพดานต้องหยุด ไม่วนไม่รู้จบ", planRemaining(courses, {}, 0, 2).empty());
}
