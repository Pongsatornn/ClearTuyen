export type Difficulty = 'Easy' | 'Medium' | 'Hard';

// ผลของการกดบันทึกเมนู — ส่งกลับให้ปุ่มที่ถูกกดรู้เองว่าต้องขึ้นข้อความอะไรต่อ
// จำเป็นเพราะโหมดทำอาหารอยู่คนละหน้ากับกล่องชวนล็อกอิน/แถบ error ที่อยู่ในหน้าสูตร
// ถ้าไม่บอกผลกลับไป ปุ่มบันทึกในโหมดทำอาหารจะกดแล้วเงียบสนิทเหมือนปุ่มเสีย
export type SaveResult = 'saved' | 'need-login' | 'error';

// ปริมาณวัตถุดิบ 1 บรรทัด — เก็บทั้งข้อความที่ AI เขียนมาและตัวเลข/หน่วยที่แยกออกมาแล้ว
// ต้องมีตัวเลขแยกต่างหาก เพราะผู้ใช้ปรับจำนวนคนกินได้ แล้วเราคูณเองในเครื่อง (ไม่ยิง AI ใหม่)
// ปริมาณที่ไม่ใช่ตัวเลข ("เล็กน้อย", "ตามชอบ", "1-2 ลูก") ให้ amount_value เป็น null
// แล้วจะแสดง amount ตามเดิมโดยไม่คูณ — ดีกว่าเดาแล้วได้ตัวเลขมั่ว
export interface RecipeIngredient {
  item: string;
  amount: string;
  // ตัวเลขล้วนของปริมาณสำหรับ servings คนตามที่สูตรเขียนไว้ (null = คูณไม่ได้)
  amount_value: number | null;
  // หน่วยของ amount_value เช่น "กรัม" "ช้อนโต๊ะ" "ฟอง" ("" = ไม่มีหน่วย)
  amount_unit: string;
  is_staple: boolean;
}

/**
 * สูตรที่อยู่บนจอตอนนี้มาจากไหน
 *
 * 'ai'    = เพิ่งให้ AI เขียนมาใหม่ ข้อมูลครบทุกช่อง แสดงหน้าสูตรเต็มได้
 * 'saved' = กู้มาจากเมนูที่บันทึกไว้ **ข้อมูลไม่ครบ** (ตารางเก็บแค่ชื่อ/วัตถุดิบ/ขั้นตอน)
 *           ห้ามพาไปหน้าสูตรเต็ม เพราะช่องที่ไม่มีข้อมูลจะกลายเป็นการแต่งเรื่อง
 *           รายละเอียดใน lib/savedRecipe.ts
 */
export type RecipeSource = 'ai' | 'saved';

export interface Recipe {
  recipe_name: string;
  estimated_time: string;
  difficulty: Difficulty;
  // จำนวนคนกินที่ปริมาณใน ingredients เขียนไว้ให้ (ฐานตั้งต้นของการคูณ)
  servings: number;
  ingredients: RecipeIngredient[];
  instructions: string[];
  nutritional_info: {
    // ค่าต่อ 1 คนเสมอ (ไม่ใช่ทั้งหม้อ) — ปรับจำนวนคนแล้วตัวเลขนี้จึงไม่ต้องขยับตาม
    calories: string;
    protein: string;
    remarks?: string;
  };
  chef_tips: string;
}

// เมนูย่อสำหรับหน้า "เลือกเมนู" — ตั้งใจให้เบากว่า Recipe เพราะหน้านี้ต้องขอทีเดียว 10 เมนู
// ถ้าให้ AI เขียนสูตรเต็มทั้ง 10 เมนูรวดเดียวจะรอนานมากและเสี่ยง timeout
// สูตรเต็ม (Recipe) ค่อยขอตอนผู้ใช้กดเลือกเมนูที่สนใจจริงๆ
export interface MenuSuggestion {
  recipe_name: string;
  short_description: string;
  estimated_time: string;
  difficulty: Difficulty;
  // วัตถุดิบของผู้ใช้ที่เมนูนี้ได้ใช้จริง — ใช้บอกว่าเมนูไหนล้างตู้เย็นได้คุ้มกว่ากัน
  uses_ingredients: string[];
  // ของที่ต้องซื้อเพิ่ม (ไม่นับเครื่องปรุงพื้นฐาน) — ว่างเปล่า = ทำได้เลยไม่ต้องออกจากบ้าน
  missing_ingredients: string[];
}

// ข้อความหนึ่งบรรทัดในบทสนทนากับเชฟ AI
//
// อยู่ที่นี่ไม่ใช่ใน ChefChat.tsx เพราะบทสนทนาถูกยกขึ้นไปเก็บไว้ที่ `app/page.tsx`
// แล้ว — ChefChat ในหน้าสูตรกับใน CookingMode เป็นคนละ instance ที่ mount คนละที
// ถ้าปล่อยให้แต่ละตัวถือ state ของตัวเอง พอกด "เริ่มทำเมนูนี้" บทสนทนาจะหายทั้งชุด
// (รอบรีวิว 30 ก.ค. ข้อ 11 — คำตอบที่ตั้งใจถามไว้ใช้ตอนยืนทำ หายไปตอนที่จะได้ใช้พอดี)
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
