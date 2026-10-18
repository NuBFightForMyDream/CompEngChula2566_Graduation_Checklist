"""
Graduation Checklist & Roadmap — เวอร์ชัน Python (อ่านเพื่อทำความเข้าใจไอเดีย)

ไอเดียหลัก: มองหลักสูตรเป็น "กราฟมีทิศทาง" (Directed Acyclic Graph, DAG)
    - node  = รายวิชา
    - edge  = วิชาบังคับก่อน (prerequisite)  เช่น  2110211 -> 2110327
              แปลว่า "ต้องผ่าน Data Struct ก่อน ถึงจะลง Algo Design ได้"

แล้วเอาของจาก 2110211 Data Structure / 2110327 Algorithm Design มาใช้:
    1. Hash map (dict)          — ค้นวิชาจากรหัสได้ O(1)
    2. Adjacency list           — เก็บกราฟ
    3. DFS (3 สี)               — ตรวจว่าข้อมูลหลักสูตรมี prereq วนกันไหม
    4. DFS ย้อนกลับ             — หาวิชาทั้งหมดที่ต้องผ่านก่อน (สายบังคับก่อน)
    5. BFS ไปข้างหน้า           — ถ้าตกวิชานี้ จะกระทบวิชาไหนบ้าง
    6. Kahn's algorithm         — topological sort (เรียงวิชาให้ลงได้ตามลำดับ)
    7. DP บน DAG (longest path) — ต้องใช้อย่างน้อยกี่เทอมถึงจะจบ
    8. Greedy + Priority Queue  — จัดแผนเทอมที่เหลืออัตโนมัติ

วิธีรัน:
    python3 cp52_checklist_graduation.py
    python3 cp52_checklist_graduation.py --passed 2110101,2110215,2110211
    python3 cp52_checklist_graduation.py --passed-file my_passed.txt
    python3 cp52_checklist_graduation.py --curriculum data/cp-2022.json --why 2110327
"""

import argparse
import heapq
import json
from collections import deque
from pathlib import Path

DEFAULT_CURRICULUM = Path(__file__).parent / "data" / "cp-2022.json"


# ---------------------------------------------------------------------------
# 1) โหลดข้อมูล + สร้างกราฟ
# ---------------------------------------------------------------------------

def load_curriculum(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_graph(curriculum):
    """
    คืนค่า 3 อย่าง:
      courses  : dict  id -> ข้อมูลวิชา        (hash map, ค้นหา O(1))
      prereqs  : dict  id -> [วิชาที่ต้องผ่านก่อน]   (edge ขาเข้า)
      unlocks  : dict  id -> [วิชาที่วิชานี้ปลดล็อก]  (edge ขาออก = adjacency list)
    """
    courses = {c["id"]: c for c in curriculum["courses"]}
    prereqs = {cid: list(c["prereq"]) for cid, c in courses.items()}
    unlocks = {cid: [] for cid in courses}
    for cid, pres in prereqs.items():
        for p in pres:
            if p not in courses:
                raise ValueError(f"{cid} อ้างถึง prereq {p} ที่ไม่มีในหลักสูตร")
            unlocks[p].append(cid)
    return courses, prereqs, unlocks


# ---------------------------------------------------------------------------
# 2) DFS ตรวจหา cycle  (ถ้า A ต้องผ่าน B และ B ต้องผ่าน A = ข้อมูลผิด)
# ---------------------------------------------------------------------------

def find_cycle(unlocks):
    """
    DFS แบบ 3 สี:  WHITE = ยังไม่เคยไป, GRAY = กำลังอยู่ใน stack, BLACK = เสร็จแล้ว
    ถ้าเดินไปเจอ node สี GRAY แปลว่าวนกลับมาหาตัวเอง -> มี cycle
    คืน list ของวิชาที่วน หรือ None ถ้าไม่มี
    """
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {v: WHITE for v in unlocks}
    parent = {}

    def dfs(u):
        color[u] = GRAY
        for v in unlocks[u]:
            if color[v] == GRAY:              # เจอ back edge
                cycle = [v, u]
                while u != v:
                    u = parent[u]
                    cycle.append(u)
                return cycle[::-1]
            if color[v] == WHITE:
                parent[v] = u
                found = dfs(v)
                if found:
                    return found
        color[u] = BLACK
        return None

    for v in unlocks:
        if color[v] == WHITE:
            found = dfs(v)
            if found:
                return found
    return None


# ---------------------------------------------------------------------------
# 3) วิชาที่ "ลงได้ตอนนี้"
# ---------------------------------------------------------------------------

def available_courses(prereqs, passed):
    """วิชาที่ยังไม่ผ่าน และ prereq ทุกตัวผ่านหมดแล้ว"""
    return [cid for cid, pres in prereqs.items()
            if cid not in passed and all(p in passed for p in pres)]


def clean_passed(order, prereqs, passed):
    """
    ล็อกวิชา: จะนับว่าผ่านได้ ก็ต่อเมื่อ prereq ทุกตัวผ่านแล้ว
    เดินตาม topological order รอบเดียว — prereq ถูกตัดสินก่อนเสมอ
    คืน (ที่ผ่านจริง, ที่ถูกตัดออก)
    """
    ok = set()
    for v in order:
        if v in passed and all(p in ok for p in prereqs[v]):
            ok.add(v)
    return ok, passed - ok


# ---------------------------------------------------------------------------
# 4) DFS ย้อนกลับ: "จะลงวิชานี้ ต้องผ่านอะไรมาก่อนบ้าง" (ทุกชั้น)
# ---------------------------------------------------------------------------

def prereq_chain(prereqs, target):
    seen = set()
    stack = [target]                      # ใช้ stack = DFS แบบไม่ recursive
    while stack:
        u = stack.pop()
        for p in prereqs[u]:
            if p not in seen:
                seen.add(p)
                stack.append(p)
    return seen


# ---------------------------------------------------------------------------
# 5) BFS ไปข้างหน้า: "ถ้าตกวิชานี้ จะโดนล็อกวิชาไหนบ้าง"
# ---------------------------------------------------------------------------

def affected_courses(unlocks, failed):
    seen = set()
    queue = deque([failed])               # ใช้ queue = BFS
    while queue:
        u = queue.popleft()
        for v in unlocks[u]:
            if v not in seen:
                seen.add(v)
                queue.append(v)
    return seen


# ---------------------------------------------------------------------------
# 6) Kahn's algorithm: topological sort
# ---------------------------------------------------------------------------

def topological_sort(prereqs, unlocks):
    """
    in_degree[v] = จำนวน prereq ของ v ที่ยังไม่ได้ถูกหยิบ
    หยิบวิชาที่ in_degree = 0 (ไม่ติดอะไรแล้ว) ออกมาทีละตัว
    แล้วลด in_degree ของวิชาที่มันปลดล็อก
    """
    in_degree = {v: len(prereqs[v]) for v in prereqs}
    queue = deque(v for v in prereqs if in_degree[v] == 0)
    order = []
    while queue:
        u = queue.popleft()
        order.append(u)
        for v in unlocks[u]:
            in_degree[v] -= 1
            if in_degree[v] == 0:
                queue.append(v)
    if len(order) != len(prereqs):
        raise ValueError("หลักสูตรมี prereq วนกัน เรียง topological ไม่ได้")
    return order


# ---------------------------------------------------------------------------
# 7) DP บน DAG: longest path = จำนวนเทอมขั้นต่ำที่ต้องใช้
# ---------------------------------------------------------------------------

def chain_length_after(order, unlocks, remaining):
    """
    depth[v] = นับตัว v ด้วย ยังต้องเรียนต่อเป็นสายยาวอีกกี่เทอม
             = 1 + max(depth[วิชาที่ v ปลดล็อก])
    คำนวณย้อนจากท้าย topological order (เพราะลูกต้องเสร็จก่อนพ่อ)
    ใช้เป็น "ความสำคัญ" ของวิชา: ยิ่งสายยาว ยิ่งควรลงก่อน
    """
    depth = {}
    for v in reversed(order):
        if v not in remaining:
            continue
        depth[v] = 1 + max((depth[w] for w in unlocks[v] if w in remaining), default=0)
    return depth


def min_semesters_left(order, unlocks, remaining):
    depth = chain_length_after(order, unlocks, remaining)
    return max(depth.values(), default=0)


# ---------------------------------------------------------------------------
# 8) นับหน่วยกิตแต่ละหมวด
# ---------------------------------------------------------------------------

def credit_summary(curriculum, courses, passed):
    got = {cat: 0 for cat in curriculum["categories"]}     # hash map นับ
    for cid in passed:
        c = courses[cid]
        got[c["category"]] += c["credits"]
    rows = []
    for cat, info in curriculum["categories"].items():
        rows.append((info["label"], got[cat], info["required"]))
    total = sum(got.values())
    return rows, total


# ---------------------------------------------------------------------------
# เทอม: "ปี/เทอม" <-> เลข index  (1/1 -> 0, 1/2 -> 1, 2/1 -> 2, ...)
# ---------------------------------------------------------------------------

SEMESTERS = ["1/1", "1/2", "2/1", "2/2", "3/1", "3/2", "4/1", "4/2", "5/1", "5/2"]


def sem_index(sem):
    year, term = sem.split("/")
    return (int(year) - 1) * 2 + (int(term) - 1)


def sem_name(i):
    return f"{i // 2 + 1}/{i % 2 + 1}"


def offered_in(course, sem):
    """
    วิชาเปิดสอนในเทอมนี้ไหม  offered = ["1"] เปิดเฉพาะเทอมต้น, ["2"] เฉพาะเทอมปลาย
    ไม่ใส่ = เปิดทุกเทอม   — เลื่อนข้ามปีได้ แต่ข้ามเทอมไม่ได้
    """
    offered = course.get("offered")
    return not offered or sem.split("/")[1] in offered


# ---------------------------------------------------------------------------
# 9) Greedy + Priority Queue: จัดแผนเทอมที่เหลือ
# ---------------------------------------------------------------------------

def next_semester(passed, placement):
    """เทอมถัดจากเทอมสุดท้ายที่มีวิชาผ่านแล้ว (ยังไม่ผ่านอะไรเลย = 1/1)"""
    if not passed:
        return 0
    return max(sem_index(placement[c]) for c in passed) + 1


def plan_remaining(courses, prereqs, unlocks, order, passed, max_credits, placement=None):
    """
    ทุกเทอม:
      - หยิบวิชาที่ลงได้ (prereq ผ่านหมด) ใส่ priority queue
      - ความสำคัญ (tuple เทียบทีละช่อง):
          1. เทอมตามแผนหลักสูตร (เร็ว = ด่วน)  — กันไม่ให้ลง Cap Proj ตั้งแต่ปี 1
          2. สายวิชาที่ต่อจากมันยาวแค่ไหน (มาก = ด่วน)
        heapq ของ Python เป็น min-heap จึงใส่ค่าติดลบให้ข้อ 2
      - หยิบวิชาด่วนสุดใส่เทอมจนกว่าหน่วยกิตจะเต็ม
    วิชาที่ลงเทอมนี้ จะนับว่า "ผ่าน" ตอนเริ่มเทอมถัดไป
    แต่ละเทอมของแผนคือเทอมจริง (เช่น 2/1) จึงหยิบเฉพาะวิชาที่ "เปิดสอนเทอมนั้น"
    (เป็น heuristic ไม่ได้รับประกันว่าดีที่สุดเสมอ แต่ใช้ได้ดีในทางปฏิบัติ)
    คืน list ของ (ชื่อเทอม, [วิชา], หน่วยกิต)
    """
    placement = placement or default_placement(courses)
    done = set(passed)
    remaining = set(courses) - done
    depth = chain_length_after(order, unlocks, remaining)
    plan = []
    now = next_semester(passed, placement)
    while remaining:
        sem = sem_name(now)
        ready = [c for c in remaining if all(p in done for p in prereqs[c])]
        if not ready:
            raise ValueError("จัดแผนไม่ได้: วิชาที่เหลือติด prereq ทั้งหมด")
        heap = [(sem_index(placement[c]), -depth[c], -courses[c]["credits"], c)
                for c in ready if offered_in(courses[c], sem)]
        heapq.heapify(heap)
        term, credits, skipped = [], 0, []
        while heap:
            item = heapq.heappop(heap)
            cid = item[-1]
            if credits + courses[cid]["credits"] <= max_credits:
                term.append(cid)
                credits += courses[cid]["credits"]
            else:
                skipped.append(item)
        if not term and heap:
            raise ValueError("จัดแผนไม่ได้: มีวิชาหน่วยกิตเกินเพดานต่อเทอม")
        plan.append((sem, term, credits))      # term ว่างได้ ถ้าเทอมนี้ไม่มีวิชาที่เปิด
        done.update(term)
        remaining.difference_update(term)
        now += 1
    return plan


# ---------------------------------------------------------------------------
# 10) ย้ายวิชาไปเทอมอื่น + ตรวจลำดับ + เลื่อนวิชาที่ต่อเนื่องตามไป
# ---------------------------------------------------------------------------
#
# placement : dict  id -> เทอมที่จะลง เช่น {"2110211": "3/1", ...}
# กฎ: prereq ต้องอยู่ "ก่อน" วิชานั้นแบบเคร่ง (เทอมเดียวกันไม่ได้)

def default_placement(courses):
    return {cid: c["semester"] for cid, c in courses.items()}


def find_conflicts(prereqs, placement):
    """คืน list ของ (prereq, วิชา) ที่ prereq ไม่ได้อยู่เทอมก่อนหน้า"""
    bad = []
    for cid, pres in prereqs.items():
        for p in pres:
            if sem_index(placement[p]) >= sem_index(placement[cid]):
                bad.append((p, cid))
    return bad


def shift_dependents(order, prereqs, placement, passed, courses):
    """
    เดินตาม topological order (prereq มาก่อนเสมอ) แล้วดันวิชาที่ผิดลำดับ
    ไปไว้ "เทอมถัดจาก prereq ที่ช้าที่สุด" — เดินรอบเดียวก็พอ
    เพราะตอนถึงวิชา v, prereq ของ v ถูกจัดที่เรียบร้อยแล้วทุกตัว
    ถ้าเทอมนั้นไม่เปิดสอน ให้ขยับต่อไปจนเจอเทอมที่เปิด (ข้ามปี ไม่ข้ามเทอม)
    รวมวิชาที่ผ่านแล้วด้วย เพราะผู้ใช้เป็นคนจัดแผนเอง (ถ้าไม่ย้าย ลำดับจะผิดค้างอยู่)
    คืน (placement ใหม่, list ของ (วิชา, เทอมเดิม, เทอมใหม่))
    """
    new = dict(placement)
    moved = []
    for v in order:
        if not prereqs[v]:
            continue
        need = max(sem_index(new[p]) for p in prereqs[v]) + 1
        while need < len(SEMESTERS) and not offered_in(courses[v], SEMESTERS[need]):
            need += 1
        if sem_index(new[v]) < need:
            if need >= len(SEMESTERS):
                raise ValueError(f"เลื่อน {v} เกินปี 5 แล้ว")
            moved.append((v, new[v], SEMESTERS[need]))
            new[v] = SEMESTERS[need]
    return new, moved


def credits_per_semester(courses, placement):
    load = {}
    for cid, sem in placement.items():
        load[sem] = load.get(sem, 0) + courses[cid]["credits"]
    return load


# ---------------------------------------------------------------------------
# แสดงผล
# ---------------------------------------------------------------------------

def label(course):
    code = course.get("code", course["id"])
    return f"{code} {course['name']} ({course['credits']})"


def bar(got, need, width=20):
    filled = min(width, round(width * got / need)) if need else width
    return "█" * filled + "░" * (width - filled)


def read_passed(args, courses):
    ids = []
    if args.passed:
        ids += [x.strip() for x in args.passed.split(",") if x.strip()]
    if args.passed_file:
        text = Path(args.passed_file).read_text(encoding="utf-8")
        ids += [line.split("#")[0].strip() for line in text.splitlines()]
    passed = set()
    for cid in filter(None, ids):
        if cid not in courses:
            print(f"! ไม่รู้จักรหัส {cid} (ข้าม)")
        else:
            passed.add(cid)
    return passed


def show_moves(args, courses, prereqs, order, passed, max_credits):
    placement = default_placement(courses)
    print("\n=== ย้ายวิชา ===")
    for m in args.move:
        cid, _, sem = m.partition("=")
        if cid not in courses or sem not in SEMESTERS:
            print(f"! รูปแบบไม่ถูก: {m} (ตัวอย่าง 2110211=3/1)")
            continue
        if not offered_in(courses[cid], sem):
            print(f"  ✗ ย้าย {label(courses[cid])} ไป {sem} ไม่ได้: เปิดสอนเฉพาะเทอม {', '.join(courses[cid]['offered'])}")
            continue
        print(f"  ย้าย {label(courses[cid])}: {placement[cid]} -> {sem}")
        placement[cid] = sem

    conflicts = find_conflicts(prereqs, placement)
    if not conflicts:
        print("  ลำดับ prereq ยังถูกต้องทั้งหมด")
    for p, c in conflicts:
        print(f"  ✗ {label(courses[c])} อยู่ {placement[c]} แต่ prereq {label(courses[p])} อยู่ {placement[p]}")

    if conflicts and args.shift:
        placement, moved = shift_dependents(order, prereqs, placement, passed, courses)
        print("  เลื่อนตามอัตโนมัติ:")
        for cid, old, new in moved:
            print(f"     {label(courses[cid])}: {old} -> {new}")

    load = credits_per_semester(courses, placement)
    print("  หน่วยกิตต่อเทอมหลังย้าย:")
    for sem in SEMESTERS:
        if sem in load:
            warn = f"  ← เกิน {max_credits}" if load[sem] > max_credits else ""
            print(f"     {sem}: {load[sem]}{warn}")


def main():
    ap = argparse.ArgumentParser(description="Graduation checklist & roadmap")
    ap.add_argument("--curriculum", default=DEFAULT_CURRICULUM, help="ไฟล์ JSON ของหลักสูตร")
    ap.add_argument("--passed", help="รหัสวิชาที่ผ่านแล้ว คั่นด้วย , เช่น 2110101,2110215")
    ap.add_argument("--passed-file", help="ไฟล์ที่มีรหัสวิชาบรรทัดละ 1 วิชา")
    ap.add_argument("--why", help="ดูว่าวิชานี้ต้องผ่านอะไรก่อน และถ้าตกจะกระทบอะไร")
    ap.add_argument("--move", action="append", default=[], metavar="ID=เทอม",
                    help="ย้ายวิชา เช่น --move 2110211=3/1 (ใส่ซ้ำได้หลายครั้ง)")
    ap.add_argument("--shift", action="store_true",
                    help="หลังย้าย ให้เลื่อนวิชาที่ต่อเนื่องตามไปอัตโนมัติ")
    args = ap.parse_args()

    cur = load_curriculum(args.curriculum)
    courses, prereqs, unlocks = build_graph(cur)

    cycle = find_cycle(unlocks)
    if cycle:
        print("ข้อมูลหลักสูตรผิด: prereq วนกัน ->", " -> ".join(cycle))
        return

    passed = read_passed(args, courses)
    order = topological_sort(prereqs, unlocks)
    passed, dropped = clean_passed(order, prereqs, passed)
    for cid in dropped:
        missing = [label(courses[p]) for p in prereqs[cid] if p not in passed]
        print(f"! นับ {label(courses[cid])} ว่าผ่านไม่ได้ ต้องผ่าน {', '.join(missing) or 'วิชาก่อนหน้า'} ก่อน")

    print(f"\n=== {cur['name']} ===\n")

    rows, total = credit_summary(cur, courses, passed)
    print("หน่วยกิตแต่ละหมวด")
    for name, got, need in rows:
        mark = "✔" if got >= need else " "
        print(f"  {mark} {name:<26} {bar(got, need)} {got:>3}/{need}")
    print(f"  รวม {total}/{cur['totalCredits']} หน่วยกิต\n")

    print("ลงได้ตอนนี้:")
    for cid in sorted(available_courses(prereqs, passed), key=lambda c: courses[c]["semester"]):
        print(f"  - [{courses[cid]['semester']}] {label(courses[cid])}")

    remaining = set(courses) - passed
    print(f"\nสาย prereq ที่ยาวที่สุดที่เหลือ: อย่างน้อย {min_semesters_left(order, unlocks, remaining)} เทอม")

    plan = plan_remaining(courses, prereqs, unlocks, order, passed, cur["maxCreditsPerSemester"])
    print(f"แผนแนะนำ (ไม่เกิน {cur['maxCreditsPerSemester']} หน่วย/เทอม): {len(plan)} เทอม")
    for sem, term, credits in plan:
        print(f"  ปี {sem[0]} เทอม {sem[2]} ({credits} หน่วยกิต)" + ("" if term else " — ไม่มีวิชาที่เปิดสอนเทอมนี้"))
        for cid in term:
            print(f"     {label(courses[cid])}")

    if args.move:
        show_moves(args, courses, prereqs, order, passed, cur["maxCreditsPerSemester"])

    if args.why:
        cid = args.why
        if cid not in courses:
            print(f"\nไม่รู้จักรหัส {cid}")
            return
        print(f"\n{label(courses[cid])}")
        need = prereq_chain(prereqs, cid)
        hit = affected_courses(unlocks, cid)
        print("  ต้องผ่านก่อน:", ", ".join(label(courses[c]) for c in need) or "-")
        print("  ถ้าตก จะกระทบ:", ", ".join(label(courses[c]) for c in hit) or "-")


if __name__ == "__main__":
    main()
