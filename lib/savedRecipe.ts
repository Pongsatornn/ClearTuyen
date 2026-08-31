import type { Recipe, RecipeIngredient } from './types';
import type { SavedRecipe } from './supabase';
import { DEFAULT_SERVINGS, clampServings } from './utils';

/**
 * แปลงเมนูที่บันทึกไว้ให้กลับไปเข้าโหมดทำอาหารได้อีกครั้ง
 *
 * ⚠️ ตาราง `saved_recipes` เก็บแค่ 3 อย่าง: ชื่อเมนู, วัตถุดิบเป็นข้อความล้วน, ขั้นตอน
 * ของที่ **ไม่เคยถูกบันทึก** จึงเรียกคืนไม่ได้เลย ได้แก่ ความยาก, เวลาที่ใช้,
 * ข้อมูลโภชนาการ, เคล็ดลับเชฟ และตัวเลขปริมาณที่แยกหน่วยไว้สำหรับคูณตามจำนวนคน
 *
 * ตรงนี้จึงใส่ค่าว่างไว้แทน **ห้ามเอาไปแสดงบนจอเด็ดขาด** — ถ้าแสดงจะกลายเป็นการ
 * แต่งข้อมูลขึ้นมาเอง (เช่นบอกว่าเมนูนี้ "ง่าย" ทั้งที่ไม่เคยรู้) `app/page.tsx` จึงกัน
 * ไม่ให้สูตรที่มาจากทางนี้ไปโผล่หน้า `detail` (RecipeCard) โดยดูจาก `recipeSource`
 * โหมดทำอาหารอ่านแค่ชื่อ/ขั้นตอน/วัตถุดิบ/จำนวนคน ซึ่งมีครบจากที่บันทึกไว้จริง
 */

// ตอนบันทึก `app/page.tsx` พ่วงจำนวนคนไว้เป็นวัตถุดิบบรรทัดแรก เพราะตารางไม่มีช่องเก็บแยก
const SERVINGS_NOTE = /^\(\s*สูตรสำหรับ\s*(\d+)\s*คน\s*\)$/;

// "ไข่ (2 ฟอง)" -> item "ไข่", amount "2 ฟอง"  |  "เกลือ (ตามชอบ)" -> "เกลือ", "ตามชอบ"
const ITEM_WITH_AMOUNT = /^(.*?)\s*\(([^()]*)\)\s*$/;

export interface RestoredRecipe {
  recipe: Recipe;
  // จำนวนคนที่อ่านได้จากบรรทัดที่พ่วงไว้ตอนบันทึก (ไม่เจอ = ใช้ค่าตั้งต้น)
  servings: number;
}

export function savedRecipeToRecipe(saved: SavedRecipe): RestoredRecipe {
  const lines = saved.ingredients ?? [];

  const servingsMatch = lines[0]?.trim().match(SERVINGS_NOTE);
  const servings = servingsMatch
    ? clampServings(Number(servingsMatch[1]))
    : DEFAULT_SERVINGS;

  const ingredients: RecipeIngredient[] = lines
    .slice(servingsMatch ? 1 : 0)
    .map(line => {
      const parts = line.trim().match(ITEM_WITH_AMOUNT);
      return {
        item: parts ? parts[1].trim() : line.trim(),
        amount: parts ? parts[2].trim() : '',
        // ปริมาณถูกบันทึกเป็นข้อความไปแล้ว แยกตัวเลขกลับมาไม่ได้ตรงๆ —
        // null ทำให้ `scaleAmountText()` คืนข้อความเดิมโดยไม่คูณ ซึ่งถูกต้องกว่าเดา
        amount_value: null,
        amount_unit: '',
        is_staple: false,
      };
    });

  return {
    servings,
    recipe: {
      recipe_name: saved.recipe_name,
      instructions: saved.instructions ?? [],
      ingredients,
      // ฐานของการคูณ = จำนวนคนเดียวกับที่บันทึกไว้ ทำให้ factor เป็น 1 เสมอ
      servings,

      // --- ต่อจากนี้คือของที่ไม่เคยถูกบันทึก ห้ามแสดงผล (ดูคำอธิบายหัวไฟล์) ---
      estimated_time: '',
      difficulty: 'Easy',
      nutritional_info: { calories: '', protein: '' },
      chef_tips: '',
    },
  };
}
