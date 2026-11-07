// โครงสร้างข้อมูลหลักของระบบ ใช้ร่วมกันทั้ง web, api และตัวตรวจ schema

export type Sem = string; // รูปแบบ "ปี/เทอม" เช่น "3/1"

export interface Course {
  id: string;
  code?: string;
  name: string;
  credits: number;
  category: string;
  semester: Sem;
  prereq: string[];
  group?: string;
  pool?: string;
  /** "1" = เทอมต้น, "2" = เทอมปลาย ถ้าไม่ระบุ = เปิดทุกเทอม */
  offered?: string[];
  extra?: boolean;
}

export interface PoolOption {
  id: string;
  code: string;
  name: string;
  credits: number;
  prereq?: string[];
  offered?: string[];
}

export interface Pool {
  label: string;
  note?: string;
  options: PoolOption[];
}

export interface Category {
  label: string;
  required: number;
  color: string;
}

export interface Group {
  label: string;
  color: string;
}

export interface Curriculum {
  id: string;
  name: string;
  totalCredits: number;
  maxCreditsPerSemester: number;
  note?: string;
  offeredNote?: string;
  categories: Record<string, Category>;
  groups?: Record<string, Group>;
  pools?: Record<string, Pool>;
  courses: Course[];
}

/** id = null คือวิชาที่ผู้ใช้กรอกเอง ไม่ได้มาจากรายการใน pool */
export interface Choice {
  id: string | null;
  code: string;
  name: string;
  credits: number;
}

export interface ExtraCourse {
  id: string;
  code: string;
  name: string;
  credits: number;
  category: string;
  semester: Sem;
}

export type Grade = "A" | "B+" | "B" | "C+" | "C" | "D+" | "D" | "F" | "S" | "U" | "W";

export interface PlanState {
  passed: string[];
  place: Record<string, Sem>;
  choices: Record<string, Choice>;
  extras: ExtraCourse[];
  grades: Record<string, Grade>;
}

export type CourseStatus = "passed" | "available" | "locked";
