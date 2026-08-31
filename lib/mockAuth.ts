import type { User } from '@supabase/supabase-js';

/**
 * โหมดจำลองการล็อกอิน — ใช้ทดสอบ flow "บันทึกเมนู / เมนูที่บันทึกไว้" ให้ครบวง
 * โดยไม่ต้องตั้งค่า Google OAuth (Google Cloud Console + Supabase Providers) ก่อน
 *
 * จำลองแค่ "ตัวตนของผู้ใช้" เท่านั้น — `saveRecipe()` / `getSavedRecipes()`
 * ยังยิงเข้า Supabase จริงผ่าน anon key เหมือนเดิมทุกประการ จึงเห็นแถวเกิดขึ้นจริง
 * ใน Table Editor ตรวจสอบได้ ไม่ใช่ข้อมูลปลอมที่ค้างอยู่แค่ในเบราว์เซอร์
 *
 * มีหลายบัญชีให้สลับ เพราะเรื่องที่ทดสอบด้วยบัญชีเดียวไม่ได้เลยคือ
 * "เมนูของคนหนึ่งต้องไม่โผล่ให้อีกคนเห็น" — ซึ่งเป็นพฤติกรรมเดียวกับที่ RLS
 * จะบังคับตอนขึ้น auth จริง ถ้าตรงนี้ยังแยกไม่ถูก ขึ้น auth จริงก็ยังพังอยู่ดี
 *
 * ⚠️ โหมดนี้ใช้ได้เพราะ policy ใน `supabase/migration.sql` ยังเป็น `to anon ... (true)` อยู่
 *    วันไหนรัน `supabase/migration_auth.sql` (policy เปลี่ยนเป็น `to authenticated`
 *    + เช็ค `auth.uid()`) โหมดนี้จะเซฟไม่ผ่าน RLS ทันที เพราะ user_id ที่นี่เป็น UUID
 *    ที่แต่งขึ้นเอง ไม่มีตัวตนใน `auth.users` — ถึงตอนนั้นต้องเลิกใช้แล้วไปใช้ auth จริง
 *
 * ⚠️ ห้ามเปิดบน production — ใครก็กดเป็นบัญชีไหนก็ได้โดยไม่ต้องพิสูจน์ตัวตน
 */

// เปิด/ปิดด้วย NEXT_PUBLIC_MOCK_AUTH=1 ใน .env.local
// ต้องอ้าง process.env.NEXT_PUBLIC_MOCK_AUTH แบบตรงๆ ห้าม destructure หรือใช้ตัวแปรมาคั่น
// เพราะ Next แทนค่านี้ตอน build ด้วยการ match ข้อความตรงๆ (ดู docs/01-app/02-guides/environment-variables.md)
// และด้วยเหตุผลเดียวกัน แก้ .env.local แล้ว "ต้องรีสตาร์ท dev server" ค่าถึงจะเปลี่ยน
export const isMockAuthEnabled = process.env.NEXT_PUBLIC_MOCK_AUTH === '1';

export interface MockAccount {
  /** UUID ที่จะถูกเขียนลงคอลัมน์ user_id ของ saved_recipes จริง */
  id: string;
  email: string;
  /** ข้อความบนปุ่มในลิสต์เลือกบัญชี — บอกให้รู้ว่าบัญชีนี้ต่างจากอันอื่นยังไง */
  label: string;
}

// UUID คงที่ (ไม่สุ่ม) เพื่อให้เมนูที่เซฟไว้เมื่อวานยังหาเจอในวันนี้
// รูปแบบถูกต้องตาม UUID v4 เผื่อวันหลังเปลี่ยนคอลัมน์ user_id เป็น uuid แล้วยัง cast ผ่าน
//
// บัญชีแรกต้องคง id `...001` กับอีเมลเดิมไว้ ห้ามเปลี่ยน — แถวที่บันทึกไว้ในตารางจริง
// ตั้งแต่ก่อนมีหลายบัญชีผูกกับ id นี้อยู่ ถ้าเปลี่ยนแล้วของเก่าจะกลายเป็นแถวกำพร้าที่ไม่มีใครเห็น
export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'mock@fridge-menu.test',
    label: 'บัญชี A — มีเมนูเก่าอยู่แล้ว',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'user-b@fridge-menu.test',
    label: 'บัญชี B — เริ่มจากศูนย์',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'user-c@fridge-menu.test',
    label: 'บัญชี C — เริ่มจากศูนย์',
  },
];

// แยก key ออกจาก key ของ supabase-js ชัดเจน กันสับสนตอนไล่ดูใน DevTools
const STORAGE_KEY = 'fridge-menu-mock-session';

/**
 * ข้อความบนปุ่มล็อกอิน — โหมดจำลองต้องบอกให้ชัดว่าไม่ใช่การล็อกอินจริง
 *
 * โหมดปกติเขียนแค่ "เข้าสู่ระบบ" ไม่ระบุว่าด้วยอะไร เพราะปุ่มนี้เปิด `AuthDialog`
 * ซึ่งมีให้เลือกทั้งอีเมล/รหัสผ่านและ Google — ถ้าเขียนว่า "ด้วย Google" ไว้บนปุ่ม
 * ก็จะสัญญาสิ่งที่ไม่ตรงกับสิ่งที่เกิดขึ้นจริงตอนกด
 */
export const signInButtonLabel = isMockAuthEnabled
  ? 'เข้าสู่ระบบ (จำลอง)'
  : 'เข้าสู่ระบบ';

type Listener = (user: User | null) => void;

const listeners = new Set<Listener>();

function toUser(account: MockAccount): User {
  return {
    id: account.id,
    email: account.email,
    app_metadata: { provider: 'mock' },
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

/**
 * บัญชีที่ล็อกอินค้างอยู่ตอนนี้ (null = ยังไม่ได้กดล็อกอิน)
 *
 * เก็บสถานะไว้ใน localStorage ไม่ใช่ตัวแปรใน memory เพราะต้องรอดจากการรีเฟรชหน้า
 * (รอบรีวิวก่อนหน้าติว่าแอป "ลืมทุกอย่างทุกครั้งที่กระพริบตา" — โหมดนี้ต้องไม่ซ้ำรอยนั้น)
 */
function readStoredAccount(): MockAccount | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === null) return null;

  // ตั้งแต่รอบหลายบัญชีเก็บเป็น `id` แต่เวอร์ชันก่อนหน้าเก็บเป็น "อีเมล" ของบัญชีเดียวที่มี
  // เทียบทั้งสองแบบ เพื่อไม่ให้คนที่ล็อกอินค้างไว้อยู่ถูกเตะออกเฉยๆ ตอนอัปเดตโค้ด
  // (ค่าที่ไม่ตรงกับบัญชีไหนเลย = ข้อมูลเก่าที่ใช้ไม่ได้แล้ว ถือว่ายังไม่ได้ล็อกอิน)
  return MOCK_ACCOUNTS.find(a => a.id === stored || a.email === stored) ?? null;
}

function notify() {
  const account = readStoredAccount();
  const user = account ? toUser(account) : null;
  for (const listener of listeners) listener(user);
}

/**
 * รับรู้การเปลี่ยนสถานะล็อกอิน — เลียนแบบ `supabase.auth.onAuthStateChange()`
 * คือยิงสถานะปัจจุบันให้ทันทีตอน subscribe แล้วค่อยยิงซ้ำทุกครั้งที่เปลี่ยน
 * เพื่อให้ `useUser()` สลับไปใช้อันนี้แทนได้โดยไม่ต้องแก้ logic ฝั่ง component
 *
 * การ "สลับบัญชี" ก็เดินผ่านทางนี้เหมือนกัน (ยิง user คนใหม่ออกไป) — `SavedRecipes`
 * เทียบ `loaded.userId` กับ `user.id` ตอน render อยู่แล้ว รายการของคนเก่าจึงหายเองทันที
 */
export function subscribeMockAuth(listener: Listener): () => void {
  listeners.add(listener);
  // อ่าน localStorage ตอนนี้ (ไม่ใช่ตอน import module) เพราะไฟล์นี้ถูกประเมินฝั่ง server
  // ตอน SSR ด้วย ซึ่งไม่มี window — ตัว subscribe ถูกเรียกจาก useEffect จึงปลอดภัยแล้ว
  const account = readStoredAccount();
  listener(account ? toUser(account) : null);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * ล็อกอิน(จำลอง) เป็นบัญชีที่ระบุ — ไม่ระบุ = บัญชีแรก
 *
 * ที่ต้องรับ id ไม่ได้เป็นบัญชีเดียวตายตัวเหมือนเดิม เพราะเรียกจาก 2 ที่ที่เจตนาต่างกัน:
 * ลิสต์เลือกบัญชีใน `AuthButton` (ระบุมา) กับปุ่มชวนล็อกอินตอนกดหัวใจใน `page.tsx`
 * (ไม่ระบุ — ตรงนั้นผู้ใช้แค่อยากบันทึกเมนู ไม่ได้ตั้งใจจะเลือกว่าเป็นใคร)
 */
export function mockSignIn(accountId?: string) {
  const account = MOCK_ACCOUNTS.find(a => a.id === accountId) ?? MOCK_ACCOUNTS[0];
  window.localStorage.setItem(STORAGE_KEY, account.id);
  notify();
}

export function mockSignOut() {
  window.localStorage.removeItem(STORAGE_KEY);
  notify();
}

/** user_id ที่จะเขียนลง Supabase จริง — null ถ้ายังไม่ได้กดล็อกอิน(จำลอง) */
export function getMockUserId(): string | null {
  return readStoredAccount()?.id ?? null;
}
