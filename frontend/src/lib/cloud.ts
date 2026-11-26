// Google login ด้วย Firebase Auth และเก็บแผนใน Firestore ที่ users/{uid}/plans/{curriculumId}
// Firestore เก็บสิ่งที่แก้ไว้ในเบราว์เซอร์ (IndexedDB) ก่อน แล้วส่งขึ้นเองเมื่อออนไลน์ ไม่ต้องเขียนระบบลองใหม่เอง

import { defaultSettings, type PlanSettings, planSettingsSchema, planStateSchema } from "@cp/contracts";
import type { PlanState } from "@cp/core";
import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  deleteUser,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  type User,
} from "firebase/auth";
import {
  clearIndexedDbPersistence,
  collection,
  connectFirestoreEmulator,
  type DocumentData,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp,
  setDoc,
  type Timestamp,
  terminate,
  waitForPendingWrites,
} from "firebase/firestore";
import { emulator, firebaseConfig } from "./firebaseConfig.ts";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
if (emulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8085);
}

export interface CloudUser {
  uid: string;
  name: string;
  email: string;
}

export interface CloudPlan {
  state: PlanState;
  settings: PlanSettings;
  /** null ระหว่างที่เซิร์ฟเวอร์ยังไม่ได้รับ */
  updatedAt: Date | null;
}

const toUser = (u: User | null): CloudUser | null =>
  u && { uid: u.uid, name: u.displayName ?? u.email ?? "ผู้ใช้", email: u.email ?? "" };

export async function currentUser() {
  await auth.authStateReady();
  return toUser(auth.currentUser);
}

/** เรียกทุกครั้งที่ login หรือออก รวมถึงจากแท็บอื่น */
export const onUserChange = (callback: (user: CloudUser | null) => void) =>
  onAuthStateChanged(auth, (u) => callback(toUser(u)));

export function signIn() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

const planDoc = (uid: string, curriculumId: string) => doc(db, "users", uid, "plans", curriculumId);

function parsePlan(data: DocumentData | undefined): CloudPlan | null {
  const state = planStateSchema.safeParse(data?.state);
  if (!data || !state.success) return null;
  const settings = planSettingsSchema.safeParse(data.settings);
  return {
    state: state.data as PlanState,
    settings: settings.success ? settings.data : defaultSettings,
    updatedAt: (data.updatedAt as Timestamp | null)?.toDate() ?? null,
  };
}

export async function loadPlan(uid: string, curriculumId: string) {
  return parsePlan((await getDoc(planDoc(uid, curriculumId))).data());
}

/** เก็บลงเครื่องทันที แล้ว resolve เมื่อเซิร์ฟเวอร์รับแล้ว ถ้าออฟไลน์จะรอจนกลับมาออนไลน์ */
export function savePlan(uid: string, curriculumId: string, state: PlanState, settings: PlanSettings) {
  return setDoc(planDoc(uid, curriculumId), { state, settings, updatedAt: serverTimestamp() });
}

/** แจ้งเมื่อแผนในบัญชีเปลี่ยนจากที่อื่น */
export function watchPlan(uid: string, curriculumId: string, onChange: (plan: CloudPlan) => void) {
  return onSnapshot(planDoc(uid, curriculumId), (snap) => {
    // การแก้ของเครื่องนี้ที่ยังส่งไม่เสร็จ ไม่ใช่การเปลี่ยนจากที่อื่น
    if (snap.metadata.hasPendingWrites) return;
    const plan = parsePlan(snap.data());
    if (plan) onChange(plan);
  });
}

/** คืน false ถ้ายังส่งไม่ครบภายในเวลาที่กำหนด เช่น ออฟไลน์อยู่ */
export async function waitForSaves(timeoutMs = 5000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const done = await Promise.race([waitForPendingWrites(db).then(() => true as const), timeout]);
  clearTimeout(timer);
  return done;
}

/** คอมพิวเตอร์ที่ใช้ร่วมกันจะได้ไม่มีข้อมูลของบัญชีค้างอยู่ในเบราว์เซอร์ */
async function forgetThisBrowser() {
  await terminate(db);
  // แท็บอื่นยังเปิดอยู่จะล้างไม่ได้ ข้อมูลที่ค้างอ่านได้เฉพาะผู้ที่ login บัญชีนั้น
  await clearIndexedDbPersistence(db).catch(() => {});
}

export async function signOut() {
  await firebaseSignOut(auth);
  await forgetThisBrowser();
}

export async function exportMyData(user: CloudUser) {
  const snap = await getDocs(collection(db, "users", user.uid, "plans"));
  return {
    exportedAt: new Date().toISOString(),
    user: { name: user.name, email: user.email },
    plans: snap.docs.map((d) => {
      const { state, settings, updatedAt } = d.data();
      return {
        curriculumId: d.id,
        state,
        settings,
        updatedAt: (updatedAt as Timestamp | null)?.toDate().toISOString() ?? null,
      };
    }),
  };
}

/** Firebase ลบบัญชีได้เฉพาะเมื่อเพิ่ง login จึงขอยืนยันตัวตนก่อนลบข้อมูลใด ๆ */
export async function deleteAccount() {
  const user = auth.currentUser;
  if (!user) return;
  await reauthenticateWithPopup(user, new GoogleAuthProvider());
  const plans = await getDocs(collection(db, "users", user.uid, "plans"));
  await Promise.all(plans.docs.map((d) => deleteDoc(d.ref)));
  await deleteUser(user);
  await forgetThisBrowser();
}
