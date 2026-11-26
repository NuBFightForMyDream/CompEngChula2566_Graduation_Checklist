// ขั้น 1: พื้นฐาน — ตัวแปร, for, ฟังก์ชัน, vector, string
//
// คอมไพล์และรัน:
//   g++ -std=c++17 step1_basics.cpp -o step1 && ./step1
//
// เป้าหมาย: เติมโค้ดตรง TODO ให้ทุกบรรทัดขึ้น PASS

#include <iostream>
#include <string>
#include <vector>
using namespace std;

// วิชาปี 1 เทอม 1 (ดูได้ใน data/cp-2022.json)
vector<string> codes   = {"2110101", "2110111", "2301107", "2304103", "2304183", "5500111"};
vector<string> names   = {"COMP PROG", "EXPL ENG WORLD", "CALCULUS I", "GEN PHYS I", "GEN PHYS LAB I", "EXP ENG I"};
vector<int>    credits = {3, 3, 3, 3, 1, 3};

// TODO 1: คืนผลรวมหน่วยกิตทั้งหมดใน vector
// ใบ้: ใช้ for (int c : list) { ... }
int totalCredits(const vector<int>& list) {
    return 0;
}

// TODO 2: คืนจำนวนวิชาที่มี 3 หน่วยกิต
int countThreeCredit(const vector<int>& list) {
    return 0;
}

// TODO 3: หาตำแหน่ง (index) ของรหัสวิชาใน codes ถ้าไม่เจอให้คืน -1
// ใบ้: for (int i = 0; i < (int)codes.size(); i++)
int findCourse(const vector<string>& codes, const string& code) {
    return -1;
}

// TODO 4: พิมพ์รายวิชาทุกวิชาในรูปแบบ  "2110101 COMP PROG (3)"  บรรทัดละวิชา
void printCourses() {
}

// ---------------- ตัวตรวจ (ไม่ต้องแก้) ----------------
void check(const string& name, bool ok) {
    cout << (ok ? "PASS  " : "FAIL  ") << name << "\n";
}

int main() {
    printCourses();
    cout << "----\n";
    check("totalCredits = 16", totalCredits(credits) == 16);
    check("countThreeCredit = 5", countThreeCredit(credits) == 5);
    check("findCourse(2304103) = 3", findCourse(codes, "2304103") == 3);
    check("findCourse(9999999) = -1", findCourse(codes, "9999999") == -1);
}
