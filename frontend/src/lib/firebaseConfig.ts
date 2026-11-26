// ค่าจาก Firebase console → Project settings → Your apps → แอปแบบ Web
// ไม่ใช่ความลับ ทุกคนที่เปิดเว็บเห็นค่านี้อยู่แล้ว ข้อมูลปลอดภัยเพราะ firestore.rules
const project = {
  apiKey: "AIzaSyCl7GBn2rxYjpa_slcHmqBFGi712ayapzo",
  authDomain: "custom-cable-507002-p1.firebaseapp.com",
  projectId: "custom-cable-507002-p1",
  appId: "1:386462619945:web:a503af85aeb4c22ae63f38",
};

/** pnpm dev:emulator ใช้ Firebase จำลองในเครื่อง ไม่ต้องมีโปรเจกต์จริง */
export const emulator = import.meta.env.VITE_FIREBASE_EMULATOR === "1";

export const firebaseConfig = emulator
  ? { apiKey: "demo-key", authDomain: "demo-cp.firebaseapp.com", projectId: "demo-cp", appId: "demo-app" }
  : project;

/** ยังไม่ได้ใส่ค่า: บันทึกในเบราว์เซอร์อย่างเดียว และไม่แสดงปุ่มเข้าสู่ระบบ */
export const accountsEnabled = firebaseConfig.apiKey !== "";
