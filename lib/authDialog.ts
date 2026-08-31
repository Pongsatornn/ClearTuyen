import { isMockAuthEnabled, mockSignIn } from './mockAuth';

/**
 * ตัวกลางสำหรับ "เปิดกล่องเข้าสู่ระบบ" จากที่ไหนก็ได้ในแอป
 *
 * มี 3 จุดที่ชวนผู้ใช้ล็อกอิน — ปุ่มมุมบน (`AuthButton`), แผงเมนูที่บันทึกไว้
 * (`SavedRecipes`) และกล่องที่เด้งตอนกดหัวใจ (`app/page.tsx`) — ทั้งสามอยู่คนละที่
 * ในต้นไม้ component และไม่มีพ่อร่วมกันที่ใกล้พอจะส่ง prop ลงไปได้สวยๆ
 *
 * แทนที่จะ copy ฟอร์มไปวางสามรอบ (แก้ทีต้องแก้สามที่ และมีสิทธิ์ลืมที่ใดที่หนึ่ง)
 * ให้ mount `<AuthDialog />` ไว้ที่ layout ตัวเดียว แล้วทุกจุดเรียก `startSignIn()`
 * ผ่าน store เล็กๆ ตัวนี้ — pattern เดียวกับ `mockAuth.ts` (Set ของ listener)
 * เพื่อไม่ต้องใส่ Context ครอบทั้งแอปเพื่อ state ตัวเดียวที่เปลี่ยนนานๆ ครั้ง
 */

export interface AuthDialogRequest {
  /**
   * เรียกเมื่อล็อกอินสำเร็จ "โดยไม่ออกนอกแอป" — คือ email/password กับโหมดจำลอง
   *
   * ทาง Google ไม่ผ่านตรงนี้ เพราะเบราว์เซอร์เด้งออกไปแล้วโหลดหน้าใหม่ทั้งหน้า
   * callback ที่ค้างอยู่ใน memory จึงหายไปพร้อมกัน — จุดที่ต้องรีเซ็ต UI หลังล็อกอิน
   * ต้องเช็คจาก `useUser()` เพิ่มด้วย ไม่ใช่พึ่ง callback นี้อย่างเดียว
   */
  onSuccess?: () => void;
}

type Listener = (request: AuthDialogRequest | null) => void;

const listeners = new Set<Listener>();

// null = ปิดอยู่ เก็บเป็นตัวแปรใน module ไม่ใช่ localStorage เพราะกล่องล็อกอินที่ค้าง
// เปิดอยู่ข้ามการรีเฟรชหน้าไม่ได้ช่วยอะไร มีแต่จะทับหน้าจอตอนผู้ใช้กลับมา
let current: AuthDialogRequest | null = null;

function notify() {
  for (const listener of listeners) listener(current);
}

export function subscribeAuthDialog(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

export function openAuthDialog(request: AuthDialogRequest = {}) {
  current = request;
  notify();
}

export function closeAuthDialog() {
  current = null;
  notify();
}

/**
 * จุดเริ่มของการล็อกอินทุกทางในแอป — เรียกอันนี้ ไม่ใช่ `signInWithGoogle()` ตรงๆ
 *
 * โหมดจำลองยังต้องลัดเข้าบัญชีทดสอบทันทีเหมือนเดิม (ไม่มีรหัสผ่านให้กรอกอยู่แล้ว)
 * ส่วนโหมดปกติเปิดกล่องให้เลือกเองว่าจะใช้อีเมล/รหัสผ่าน หรือ Google
 */
export function startSignIn(request: AuthDialogRequest = {}) {
  if (isMockAuthEnabled) {
    mockSignIn();
    request.onSuccess?.();
    return;
  }
  openAuthDialog(request);
}
