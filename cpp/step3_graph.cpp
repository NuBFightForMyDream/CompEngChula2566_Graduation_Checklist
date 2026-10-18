// ขั้น 3: กราฟ — หัวใจของโปรเจกต์ (เนื้อหา 2110211 / 2110327)
//
//   g++ -std=c++17 step3_graph.cpp -o step3 && ./step3
//
// เทียบกับ section 3–6 ใน cp52_checklist_graduation.py
//
// กราฟ:  วิชา = node,  prereq = ลูกศร
//
//   2110101 ─┬─> 2110215
//            └─> 2110211 ─┬─> 2110327 <── 2110200
//                         └─> 2110313
//   2110263 ───> 2110366

#include <algorithm>
#include <iostream>
#include <queue>
#include <set>
#include <stack>
#include <string>
#include <unordered_map>
#include <vector>
using namespace std;

// prereqs[วิชา] = วิชาที่ต้องผ่านก่อน   (ลูกศรขาเข้า)
unordered_map<string, vector<string>> prereqs = {
    {"2110101", {}},
    {"2110215", {"2110101"}},
    {"2110211", {"2110101"}},
    {"2110200", {}},
    {"2110327", {"2110200", "2110211"}},
    {"2110313", {"2110211"}},
    {"2110263", {}},
    {"2110366", {"2110263"}},
};

// TODO 1: สร้าง unlocks[วิชา] = วิชาที่วิชานี้ปลดล็อก   (ลูกศรขาออก = adjacency list)
// ใบ้: ทุก (v, pres) ใน prereqs  ->  ทุก p ใน pres  ->  unlocks[p].push_back(v)
//      อย่าลืมใส่ unlocks[v] = {} ให้ทุกวิชาก่อน
unordered_map<string, vector<string>> buildUnlocks() {
    unordered_map<string, vector<string>> unlocks;
    return unlocks;
}

// TODO 2: วิชาที่ "ลงได้ตอนนี้" = ยังไม่ผ่าน และ prereq ทุกตัวผ่านแล้ว
vector<string> availableCourses(const set<string>& passed) {
    vector<string> result;
    return result;
}

// TODO 3: DFS ย้อนกลับ — วิชาทั้งหมดที่ต้องผ่านก่อนจะลง target ได้ (ทุกชั้น)
// ใบ้: stack<string> st; st.push(target);
//      while (!st.empty()) { u = st.top(); st.pop(); for p in prereqs[u]: ถ้ายังไม่เคยเห็น -> ใส่ seen, push }
set<string> prereqChain(const string& target) {
    set<string> seen;
    return seen;
}

// TODO 4: BFS ไปข้างหน้า — ถ้าตก failed จะกระทบวิชาไหนบ้าง
// ใบ้: เหมือน TODO 3 แต่ใช้ queue<string> และเดินตาม unlocks
set<string> affectedCourses(const unordered_map<string, vector<string>>& unlocks, const string& failed) {
    set<string> seen;
    return seen;
}

// TODO 5: Kahn's algorithm — topological sort
// ใบ้: inDegree[v] = จำนวน prereq ของ v
//      queue เริ่มจากวิชาที่ inDegree == 0
//      หยิบ u ออก -> ใส่ order -> ทุก v ใน unlocks[u]: inDegree[v]-- ถ้าเหลือ 0 ใส่ queue
vector<string> topologicalSort(const unordered_map<string, vector<string>>& unlocks) {
    vector<string> order;
    return order;
}

// ---------------- ตัวตรวจ (ไม่ต้องแก้) ----------------
void check(const string& name, bool ok) {
    cout << (ok ? "PASS  " : "FAIL  ") << name << "\n";
}

bool isValidOrder(const vector<string>& order) {
    if (order.size() != prereqs.size()) return false;
    unordered_map<string, int> pos;
    for (int i = 0; i < (int)order.size(); i++) pos[order[i]] = i;
    for (const auto& [v, pres] : prereqs)
        for (const string& p : pres)
            if (!pos.count(p) || !pos.count(v) || pos[p] >= pos[v]) return false;
    return true;
}

int main() {
    auto unlocks = buildUnlocks();
    check("unlocks[2110211] = {2110327, 2110313}",
          unlocks.count("2110211") && set<string>(unlocks["2110211"].begin(), unlocks["2110211"].end())
                                          == set<string>{"2110327", "2110313"});

    auto avail = availableCourses({"2110101"});
    check("ผ่าน 2110101 แล้ว ลงได้ 2110215, 2110211, 2110200, 2110263",
          set<string>(avail.begin(), avail.end()) == set<string>{"2110215", "2110211", "2110200", "2110263"});

    check("prereqChain(2110327) = {2110200, 2110211, 2110101}",
          prereqChain("2110327") == set<string>{"2110200", "2110211", "2110101"});

    check("affected(2110101) = {2110215, 2110211, 2110327, 2110313}",
          affectedCourses(unlocks, "2110101") == set<string>{"2110215", "2110211", "2110327", "2110313"});

    auto order = topologicalSort(unlocks);
    check("topologicalSort เรียงถูก (prereq มาก่อนเสมอ)", isValidOrder(order));

    cout << "order:";
    for (const string& c : order) cout << " " << c;
    cout << "\n";
}
