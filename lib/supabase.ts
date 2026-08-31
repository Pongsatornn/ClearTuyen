import { createClient, type AuthError } from '@supabase/supabase-js';
import { isMockAuthEnabled, mockSignIn, mockSignOut, getMockUserId } from './mockAuth';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      // PKCE ปลอดภัยกว่า implicit flow เพราะ access token ไม่ถูกโยนมาโต้งๆ ใน URL
      flowType: 'pkce',
      // ตอน Google เด้งกลับมาที่เว็บเราพร้อม ?code=... ให้ client แลก code เป็น session เอง
      // (เลยไม่ต้องมี route /auth/callback ฝั่ง server แยกต่างหาก)
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

interface Recipe {
  name: string;
  ingredients: string[];
  steps: string[];
}

export interface SavedRecipe {
  id: string;
  recipe_name: string;
  ingredients: string[];
  instructions: string[];
  created_at: string;
}

// ใช้แยกกรณี "ยังไม่ได้ล็อกอิน" ออกจาก error อื่นๆ ของ Supabase
// เพื่อให้ฝั่ง UI ขึ้นปุ่มชวนล็อกอินแทนที่จะขึ้นข้อความ error ทั่วไป
export class NotLoggedInError extends Error {
  constructor() {
    super('ต้องเข้าสู่ระบบก่อนถึงจะบันทึกเมนูได้');
    this.name = 'NotLoggedInError';
  }
}

/**
 * ใช้แยกกรณี "คำสั่งลบผ่านไปได้แต่ไม่มีแถวไหนถูกลบจริง" ออกจาก error ปกติ
 *
 * เกิดเมื่อยังไม่ได้รัน `supabase/migration_delete.sql` — RLS ไม่ได้ปฏิเสธคำสั่ง
 * แต่ทำให้แถวนั้นมองไม่เห็นสำหรับ delete ผลคือ PostgREST ตอบสำเร็จโดยลบ 0 แถว
 * ถ้าไม่ดักเคสนี้ UI จะเอารายการออกจากจอแล้วผู้ใช้เจอมันกลับมาตอนรีเฟรช
 * ซึ่งแย่กว่าบอกไปตรงๆ ว่าลบไม่ได้
 */
export class DeleteNotAllowedError extends Error {
  constructor() {
    super('ลบไม่สำเร็จ — ฐานข้อมูลยังไม่ได้เปิดสิทธิ์ลบ (ต้องรัน supabase/migration_delete.sql ก่อน)');
    this.name = 'DeleteNotAllowedError';
  }
}

/**
 * เปิด/ปิดปุ่ม Google ในกล่องเข้าสู่ระบบด้วย NEXT_PUBLIC_GOOGLE_AUTH=1
 *
 * ปุ่มนี้ใช้ได้ต่อเมื่อเปิด Google provider ใน Supabase Dashboard แล้วเท่านั้น
 * (ขั้นที่ 6 ใน `md/AUTH_SETUP.md`) ถ้ายังไม่ได้เปิด การกดปุ่มจะเด้งไป
 * `/auth/v1/authorize?provider=google` แล้วเจอ JSON ดิบ
 * `{"code":400,...,"msg":"Unsupported provider: provider is not enabled"}`
 * เต็มหน้าจอ — คือ "หน้าขาวมีโค้ดฝรั่ง" ที่ผู้ใช้จริงบ่นไว้ใน `md/USER_REVIEW.md`
 * และเป็นเหตุผลที่คนหนึ่งเลิกใช้แอปไปเลย ซ่อนปุ่มไว้ก่อนจึงดีกว่าปล่อยให้กดแล้วพัง
 *
 * อ้าง process.env แบบตรงๆ ห้าม destructure ด้วยเหตุผลเดียวกับ `mockAuth.ts`
 * (Next แทนค่าตอน build ด้วยการ match ข้อความตรงๆ — แก้ .env.local แล้วต้องรีสตาร์ท)
 */
export const isGoogleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH === '1';

export async function signInWithGoogle() {
  // โหมดจำลอง: ล็อกอินให้เสร็จในเครื่องเลย ไม่เด้งออกนอกแอป
  // (จุดที่พังจริงคือการเด้งไป Supabase แล้วเจอ JSON error เพราะยังไม่ได้เปิด Google provider)
  if (isMockAuthEnabled) {
    mockSignIn();
    return;
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // กลับมาหน้าเดิมที่ผู้ใช้กดล็อกอิน — วัตถุดิบ/เมนูที่ค้างอยู่ไม่หาย
      // เพราะ app/page.tsx เก็บไว้ใน localStorage อยู่แล้ว
      // ⚠️ URL นี้ต้องถูกใส่ไว้ใน Supabase Dashboard > Authentication > URL Configuration
      //    > Redirect URLs ด้วย ไม่งั้น Supabase จะปฏิเสธการเด้งกลับ
      redirectTo: window.location.origin,
    },
  });
  if (error) throw new Error(error.message);
}

/**
 * แปล error ของ Supabase Auth เป็นภาษาไทย
 *
 * ดูที่ `error.code` ไม่ใช่ `error.message` เพราะ message เป็นข้อความอังกฤษที่ Supabase
 * เปลี่ยนถ้อยคำเมื่อไหร่ก็ได้ (เคยเปลี่ยนมาแล้ว) การ match ด้วยข้อความจึงพังเงียบๆ
 * ตอนอัปเกรด library ส่วน code เป็นสัญญาที่เขาระบุไว้ในเอกสารว่าจะไม่เปลี่ยน
 *
 * เคสที่ไม่รู้จักคืน message เดิม (อังกฤษ) ดีกว่าเขียนว่า "เกิดข้อผิดพลาด" ลอยๆ
 * เพราะอย่างน้อยผู้ใช้ยัง search หรือส่งข้อความนั้นมาถามได้ว่าติดอะไร
 */
function authErrorMessage(error: AuthError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    case 'email_not_confirmed':
      return 'ยังไม่ได้ยืนยันอีเมล — เปิดลิงก์ในอีเมลที่ส่งไปให้ก่อน แล้วค่อยกลับมาเข้าสู่ระบบ';
    case 'user_already_exists':
    case 'email_exists':
      return 'อีเมลนี้สมัครไว้แล้ว สลับไปหน้า "เข้าสู่ระบบ" ได้เลย';
    case 'weak_password':
      return 'รหัสผ่านสั้นหรือเดาง่ายเกินไป ลองให้ยาวขึ้นและผสมตัวเลข';
    case 'validation_failed':
      return 'รูปแบบอีเมลไม่ถูกต้อง';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่';
    case 'signup_disabled':
      return 'โปรเจกต์นี้ปิดรับสมัครสมาชิกอยู่ (เปิดได้ที่ Supabase Dashboard > Authentication > Sign In / Providers)';
    default:
      return error.message;
  }
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(authErrorMessage(error));
}

/**
 * ผลของการสมัคร — ต่างกันตามสวิตช์ "Confirm email" ใน Supabase Dashboard
 *
 * `signed-in` = ปิดการยืนยันอีเมลไว้ สมัครเสร็จได้ session ทันที ใช้งานต่อได้เลย
 * `needs-confirmation` = เปิดไว้ ต้องไปกดลิงก์ในอีเมลก่อน ตอนนี้ยังไม่มี session
 */
export type SignUpResult = 'signed-in' | 'needs-confirmation';

export async function signUpWithEmail(email: string, password: string): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // ลิงก์ยืนยันในอีเมลจะพากลับมาที่หน้านี้ ไม่ใช่ localhost ที่ Supabase ตั้งไว้เป็นค่าเริ่มต้น
      // ⚠️ URL นี้ต้องอยู่ใน Dashboard > Authentication > URL Configuration > Redirect URLs ด้วย
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw new Error(authErrorMessage(error));

  // อีเมลที่สมัครไปแล้ว + เปิดยืนยันอีเมลไว้ = Supabase ตอบ "สำเร็จ" โดยไม่บอกว่าซ้ำ
  // (ตั้งใจออกแบบมาแบบนั้น กันคนไล่เดาว่าอีเมลไหนมีบัญชีอยู่ในระบบ) สัญญาณเดียวที่ได้
  // คือ identities เป็นลิสต์ว่าง — ถ้าไม่ดักตรงนี้ ผู้ใช้จะนั่งรออีเมลที่ไม่มีวันมาถึง
  if (data.user && data.user.identities?.length === 0) {
    throw new Error('อีเมลนี้สมัครไว้แล้ว สลับไปหน้า "เข้าสู่ระบบ" ได้เลย');
  }

  return data.session ? 'signed-in' : 'needs-confirmation';
}

export async function signOut() {
  if (isMockAuthEnabled) {
    mockSignOut();
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

// อ่าน user จาก session ที่เก็บไว้ในเครื่อง (ไม่ยิงเน็ต จึงเร็วพอจะเรียกก่อนทุก action ได้)
// ไม่ต้องกังวลว่าจะถูกปลอม เพราะด่านที่กันจริงคือ RLS ฝั่ง Postgres ที่เช็ค auth.uid()
// จาก JWT ที่เซ็นไว้แล้ว ไม่ได้เชื่อค่าที่ browser ส่งมา
async function getCurrentUserId(): Promise<string | null> {
  // โหมดจำลอง: ใช้ UUID ที่แต่งไว้แทน id จาก session จริง
  // แถวที่ insert ลง Supabase ยังเป็นแถวจริง แค่เจ้าของเป็นตัวตนสมมติ
  if (isMockAuthEnabled) return getMockUserId();

  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function saveRecipe(recipe: Recipe) {
  const userId = await getCurrentUserId();
  if (!userId) throw new NotLoggedInError();

  const { error } = await supabase.from('saved_recipes').insert({
    user_id: userId,
    recipe_name: recipe.name,
    ingredients: recipe.ingredients,
    instructions: recipe.steps,
  });
  if (error) throw new Error(error.message);
}

export async function getSavedRecipes(): Promise<SavedRecipe[]> {
  const userId = await getCurrentUserId();
  if (!userId) throw new NotLoggedInError();

  const { data, error } = await supabase
    .from('saved_recipes')
    .select('id, recipe_name, ingredients, instructions, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * ลบเมนูที่บันทึกไว้ 1 รายการ
 *
 * ใช้ `.select()` ต่อท้ายเพื่อให้ PostgREST คืน "แถวที่ถูกลบจริง" กลับมา —
 * จำเป็นเพราะการลบที่ถูก RLS กรองทิ้งจะไม่ error แต่จะลบ 0 แถวเงียบๆ
 * (ดูหัวไฟล์ `supabase/migration_delete.sql`) ถ้าเชื่อแค่ว่า `error === null`
 * แปลว่าสำเร็จ แอปจะโกหกผู้ใช้ทุกครั้งที่ policy ยังไม่ได้ตั้ง
 *
 * เงื่อนไข `user_id` ในคำสั่งเป็นการกันพลาดฝั่งแอปอีกชั้น ไม่ใช่ด่านความปลอดภัย
 * — ด่านจริงคือ RLS ฝั่ง Postgres
 */
export async function deleteSavedRecipe(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new NotLoggedInError();

  const { data, error } = await supabase
    .from('saved_recipes')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new DeleteNotAllowedError();
}
