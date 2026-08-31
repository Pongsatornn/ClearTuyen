'use client';

import type { ChatMessage, MenuSuggestion, Recipe, RecipeSource } from './types';

/**
 * จำงานที่ค้างอยู่ข้ามการรีเฟรชหน้า — แต่ไม่ข้ามการปิดแท็บ
 *
 * ประวัติของเรื่องนี้ (สำคัญ อย่าเผลอเปลี่ยนกลับ):
 *   - เดิมใช้ `localStorage` จำวัตถุดิบ/สไตล์อาหาร/เมนู
 *   - 29 ก.ค. 2026 ถอดออกหมด เพราะเปิดแอปมาเจอรายการของเมื่อวานค้างอยู่
 *     แล้วต้องนั่งกดลบทีละอันก่อนเริ่มใช้รอบใหม่ — เจ้าของโปรเจกต์อยากให้เปิดมาสะอาดเสมอ
 *   - 30 ก.ค. 2026 รีวิวติกลับว่า "กด F5 ทีเดียวกลับไปหน้าว่างเหมือนไม่เคยทำอะไร"
 *     ซึ่งก็จริงอีกทาง — พิมพ์วัตถุดิบไป 8 อย่างแล้วเผลอรีเฟรช = พิมพ์ใหม่หมด
 *
 * ทางออกคือ **`sessionStorage` ไม่ใช่ `localStorage`** — มันตายเองเมื่อปิดแท็บ
 * ได้ทั้งสองอย่างที่ขัดกันอยู่: รีเฟรชแล้วของยังอยู่ / เปิดแอปใหม่พรุ่งนี้ได้หน้าสะอาด
 * นี่คือ "วันหมดอายุ" ที่ PROJECT_GUIDE เตือนว่าต้องคิดถ้าจะเอา persistence กลับมา
 * โดยไม่ต้องเขียน logic นับเวลาเอง — เบราว์เซอร์จัดการให้แล้ว
 */

const STORAGE_KEY = 'fridge-menu-session';

// ขึ้นเลขนี้ทุกครั้งที่โครง SavedSession เปลี่ยนจนของเก่าอ่านแล้วพัง
// ของที่เวอร์ชันไม่ตรงจะถูกทิ้งเงียบๆ ดีกว่าปล่อยให้ state ครึ่งๆ กลางๆ เข้าไปในแอป
//   2 = เพิ่ม recipeSource (ของเวอร์ชัน 1 ไม่มีช่องนี้ ถ้าอ่านมาใช้ต่อจะเข้าใจผิดว่า
//       สูตรที่กู้คืนจากเมนูที่บันทึกไว้เป็นสูตรเต็มจาก AI แล้วพาไปหน้าที่แสดงข้อมูลที่ไม่มีจริง)
const VERSION = 2;

export interface SavedSession {
  version: number;
  inputValue: string;
  ingredientList: string[];
  cuisineType: string;
  dietRestrictions: string[];
  allergies: string[];
  allergyInput: string;
  priorityIngredients: string[];
  menus: MenuSuggestion[];
  menusIngredients: string[];
  menusCuisine: string;
  recipe: Recipe | null;
  // 'saved' = กู้มาจากเมนูที่บันทึกไว้ ซึ่งขาดข้อมูลหลายอย่าง (ดู lib/savedRecipe.ts)
  recipeSource: RecipeSource;
  servings: number;
  isSaved: boolean;
  chatMessages: ChatMessage[];
  hasEnteredCooking: boolean;
  // เก็บได้แค่ 3 ขั้น ไม่มี 'cooking' — ดู restore ด้านล่างว่าทำไม
  view: 'input' | 'list' | 'detail';
}

export function saveSession(session: Omit<SavedSession, 'version'>): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, version: VERSION }));
  } catch {
    // โควตาเต็มหรือโหมดส่วนตัวที่เขียนไม่ได้ — ไม่ใช่เรื่องคอขาดบาดตาย
    // แค่กลับไปเป็นพฤติกรรมเดิมคือรีเฟรชแล้วของหาย ไม่ควรทำให้ทั้งแอปพัง
  }
}

export function loadSession(): SavedSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SavedSession;
    if (parsed?.version !== VERSION) return null;

    return parsed;
  } catch {
    return null;
  }
}
