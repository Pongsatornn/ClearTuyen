import { NextRequest, NextResponse } from 'next/server';
import {TEXT_MODEL, createGroqClient, isRateLimited, RATE_LIMIT_MESSAGE } from '@/lib/groq';
import { z } from 'zod';
import type { Recipe } from '@/lib/types';
import { clampServings, parseAmountText } from '@/lib/utils';
import { buildDietPromptRules, findDietViolations, sanitizeDietInput } from '@/lib/diet';

const client = createGroqClient();

// Recipe Schema definition aligned with AI_CHEF_SPEC.md.
// `satisfies` ตรวจตอน compile ว่าโครง schema นี้ตรงกับ Recipe type ใน lib/types.ts
// เสมอ — ถ้าใครแก้ field ฝั่งใดฝั่งหนึ่งแล้วลืมอีกฝั่ง TypeScript จะ error ทันที
const RecipeSchema = z.object({
  recipe_name: z.string(),
  estimated_time: z.string(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  servings: z.number(),
  ingredients: z.array(z.object({
    item: z.string(),
    amount: z.string(),
    amount_value: z.number().nullable(),
    amount_unit: z.string(),
    is_staple: z.boolean()
  })),
  instructions: z.array(z.string()),
  nutritional_info: z.object({
    calories: z.string(),
    protein: z.string(),
    remarks: z.string().optional()
  }),
  chef_tips: z.string()
}) satisfies z.ZodType<Recipe>;

// AI ไม่ได้ทำตามสคีมาครบทุกครั้ง (ธรรมชาติของ LLM) — field ที่เพิ่งเพิ่มเข้ามาอย่าง
// servings/amount_value/amount_unit คือของที่หายบ่อยที่สุดเพราะไม่มีในตัวอย่างที่โมเดลเคยเห็นมาเยอะ
// ถ้าปล่อยให้ Zod ตกทั้งสูตรเพราะขาด field พวกนี้ ผู้ใช้จะเจอ "ลองใหม่อีกครั้ง" ทั้งที่สูตรใช้ได้
// เลยเติมค่าที่ขาดให้ก่อนเข้า Zod: servings เดาเป็นค่าเริ่มต้น, ปริมาณแกะตัวเลขจากข้อความ amount เอง
function normalizeRecipePayload(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const recipe = { ...(raw as Record<string, unknown>) };

  recipe.servings = clampServings(
    typeof recipe.servings === 'string' ? Number(recipe.servings) : (recipe.servings as number)
  );

  // โมเดล gpt-oss แทรก element ขยะ (สตริงว่าง `""`) คั่นกลาง array ที่ตอบมาเป็นบางครั้ง
  // — เป็น JSON ที่ parse ผ่านแต่ Zod ตีตกทั้งสูตร แล้วผู้ใช้เห็น "ลองใหม่อีกครั้ง"
  // ทั้งที่สูตรที่ใช้ได้จริงมาครบแล้ว (ดูหมายเหตุใน lib/groq.ts)
  if (Array.isArray(recipe.instructions)) {
    recipe.instructions = recipe.instructions.filter(
      step => typeof step === 'string' && step.trim().length > 0
    );
  }

  if (Array.isArray(recipe.ingredients)) {
    recipe.ingredients = recipe.ingredients.filter(
      entry => entry !== null && typeof entry === 'object' && !Array.isArray(entry)
    );

    recipe.ingredients = (recipe.ingredients as unknown[]).map(entry => {
      const ingredient = { ...(entry as Record<string, unknown>) };
      const amount = typeof ingredient.amount === 'string' ? ingredient.amount : '';
      const parsed = parseAmountText(amount);

      const value =
        typeof ingredient.amount_value === 'string'
          ? Number(ingredient.amount_value)
          : ingredient.amount_value;

      ingredient.amount_value =
        typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : parsed.value;
      ingredient.amount_unit =
        typeof ingredient.amount_unit === 'string' && ingredient.amount_unit.trim()
          ? ingredient.amount_unit.trim()
          : parsed.unit;

      return ingredient;
    });
  }

  return recipe;
}

// เผื่อกรณีวัตถุดิบที่ส่งมาไม่ใช่ของกินได้จริง (เช่น "ตะปู", "ยางรถยนต์")
// ให้ AI ตอบโครงนี้แทนแทนที่จะฝืนสร้างสูตร แล้ว route เช็คเคสนี้ก่อน validate ด้วย RecipeSchema เสมอ
const RefusalSchema = z.object({
  error: z.string()
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    
    if (!body || !body.ingredients || !Array.isArray(body.ingredients) || body.ingredients.length === 0) {
      return NextResponse.json({ error: 'กรุณาระบุวัตถุดิบอย่างน้อย 1 อย่าง' }, { status: 400 });
    }

    const { ingredients, cuisineType = 'ทั่วไป' } = body;
    const { restrictions, allergies } = sanitizeDietInput(body.dietRestrictions, body.allergies);
    const dietRules = buildDietPromptRules(restrictions, allergies);

    // ของที่ผู้ใช้ติดธงว่า "ใกล้เสีย ใช้ก่อน" — มาจาก client จึง sanitize ก่อนฝังลง prompt
    // เก็บเฉพาะที่อยู่ในลิสต์วัตถุดิบจริง กันกรณี client ส่งชื่อที่ไม่มีอยู่มาให้ AI สับสน
    const priorityIngredients: string[] = Array.isArray(body.priorityIngredients)
      ? body.priorityIngredients
          .filter((name: unknown): name is string => typeof name === 'string')
          .map((name: string) => name.replace(/[<>{}[\]()"'\\]/g, '').trim().slice(0, 50))
          .filter((name: string) => name.length > 0 && ingredients.includes(name))
          .slice(0, 20)
      : [];

    // สูตรเต็มต้องใช้ของใกล้เสียให้คุ้มด้วย ไม่ใช่แค่ตอนเลือกเมนู
    // (เลือกเมนูที่ใช้กะหล่ำปลีมาแล้ว แต่สูตรใส่กะหล่ำปลี 20 กรัม = ไม่ได้ช่วยล้างตู้เย็นจริง)
    const priorityRule =
      priorityIngredients.length > 0
        ? `\n        9. ของพวกนี้ใกล้เสียแล้ว ผู้ใช้อยากใช้ให้หมดก่อน: ${priorityIngredients.join(', ')} — ถ้าเมนูนี้ใช้ของพวกนั้นได้ ให้ใช้ในปริมาณที่สมเหตุสมผลกับจานนี้แบบเต็มที่ แต่ห้ามยัดใส่จนรสชาติเสียหรือผิดจากจานจริง`
        : '';
    // ชื่อเมนูที่ผู้ใช้เลือกมาจากหน้าลิสต์ (/api/suggest-menus)
    // ค่านี้มาจาก client เลยตัดอักขระที่ใช้แทรกคำสั่งใน prompt ทิ้งก่อน แล้วจำกัดความยาว
    // ถ้าไม่ส่งมาก็ยังใช้ได้แบบเดิมคือให้ AI เลือกเมนูที่เหมาะที่สุดให้เอง
    const menuName: string =
      typeof body.menuName === 'string'
        ? body.menuName.replace(/[<>{}[\]"'\\\n\r]/g, '').trim().slice(0, 100)
        : '';

    // วัตถุดิบที่การ์ดเมนูในลิสต์บอกไปแล้วว่าจานนี้ใช้ (uses_ingredients จาก /api/suggest-menus)
    // ส่งกลับมาเพื่อกันบั๊กที่เจอบ่อยที่สุดของหน้านี้: สูตรเต็มลากของทั้งตู้เย็นมาใส่จานเดียว
    // (ซุปมะเขือเทศที่มีเบียร์ ส้ม และลูกแพร์อยู่ในรายการวัตถุดิบ) กฎเหล็กข้อ 1.1 ห้ามไว้แล้ว
    // แต่ลำพังคำสั่งห้ามยังแพ้แรงดึงของลิสต์ยาวๆ ที่แปะอยู่ในคำถามเดียวกัน — การบอก
    // "จานนี้ใช้ของชุดไหน" ตรงๆ ได้ผลกว่า และยังทำให้สิ่งที่ผู้ใช้เห็นบนการ์ดตรงกับสูตรที่ได้ด้วย
    //
    // เทียบชื่อแบบ substring สองทาง ไม่ใช่ตรงตัวเป๊ะ เพราะ AI เรียกของเดียวกันคนละชื่อได้
    // ("มะเขือเทศสด" กับ "มะเขือเทศ") แล้วส่งออกเป็นชื่อที่ผู้ใช้พิมพ์มาเองเสมอ ไม่ใช่ชื่อของ AI
    const menuIngredientHints: string[] = Array.isArray(body.menuIngredients)
      ? body.menuIngredients
          .filter((name: unknown): name is string => typeof name === 'string')
          .map((name: string) => name.replace(/[<>{}[\]()"'\\]/g, '').trim().slice(0, 50))
          .filter((name: string) => name.length > 0)
          .slice(0, 30)
      : [];
    const menuIngredients: string[] = ingredients.filter(
      (ing: unknown): ing is string =>
        typeof ing === 'string' &&
        menuIngredientHints.some(hint => hint.includes(ing) || ing.includes(hint))
    );

    // เตือนเฉพาะตอนที่มันบอกอะไรเพิ่มจริงๆ — ถ้าการ์ดบอกว่าใช้ของครบทุกอย่างอยู่แล้ว
    // การย้ำชุดเดิมซ้ำไม่ได้ช่วยอะไร มีแต่จะกิน token ของ prompt ฟรีๆ
    const menuIngredientRule =
      menuIngredients.length > 0 && menuIngredients.length < ingredients.length
        ? `
        ตอนอยู่ในลิสต์ การ์ดของเมนูนี้บอกผู้ใช้ไปแล้วว่าใช้: ${menuIngredients.join(', ')} — สูตรเต็มให้ยึดชุดนี้เป็นหลัก ของที่เหลือในตู้เย็นจะหยิบมาใช้ได้ก็ต่อเมื่อจานนี้ใส่จริงตามสูตรที่คนทำกัน ห้ามใส่เพิ่มเพียงเพราะผู้ใช้มีของนั้นอยู่`
        : '';

    // เวลา/ความยากที่การ์ดในลิสต์แสดงไปแล้ว ส่งกลับมาเพื่อล็อกให้สูตรเต็มใช้ค่าเดียวกัน
    // ไม่งั้นผู้ใช้จะเห็น "25 นาที" ในลิสต์ แล้วกดเข้าไปเจอ "20 นาที" เพราะเป็นคนละคำตอบของ AI
    const menuTime: string =
      typeof body.estimatedTime === 'string' ? body.estimatedTime.replace(/\D/g, '').slice(0, 3) : '';
    const menuDifficulty: string =
      body.difficulty === 'Easy' || body.difficulty === 'Medium' || body.difficulty === 'Hard'
        ? body.difficulty
        : '';

    const response = await client.chat.completions.create({
      model: TEXT_MODEL,
      temperature: 0.4, // ลดจาก default เพื่อลดโอกาสที่โมเดลจะแทรกคำ/ตัวอักษรภาษาอื่นปนกลางประโยคไทย
      // gpt-oss เป็น reasoning model — ถ้าเพดาน token ต่ำไป JSON จะถูกตัดกลางคันแล้ว Groq
      // ตอบ 400 json_validate_failed ซึ่งอ่านแล้วเข้าใจผิดว่าโมเดลเขียน JSON ผิด (ดู lib/groq.ts)
      // ⚠️ เพดานนี้ถูกบีบด้วย **TPM (tokens per minute) ของ Groq free tier ซึ่งอยู่ที่ 8000**
      // Groq นับ `prompt + max_completion_tokens` เป็น "จำนวนที่ขอ" ของ request นั้นเลย
      // ตั้ง 8192 แล้วโดน HTTP 413 rate_limit_exceeded ตั้งแต่คำขอเดียว (เจอจริงตอนทดสอบ)
      // ตัวเลขนี้จึงต้องเหลือที่ให้ prompt ด้วยเสมอ — ถ้าอัปเกรด tier แล้วค่อยขยับขึ้นได้
      max_completion_tokens: 5000,
      // ระดับกลาง ไม่ใช่ low เหมือนอีก 2 route เพราะหน้านี้ต้องคิดเรื่องที่ผิดแล้วผู้ใช้เดือดร้อนจริง:
      // ปริมาณต่อคน ลำดับขั้นตอนที่ทำตามแล้วไม่พัง และการไม่ใส่ของที่ผู้ใช้แพ้
      reasoning_effort: 'medium',
      messages: [{
        role: 'system',
        content: `คุณคือ Executive Chef de Cuisine ผู้เชี่ยวชาญเรื่องวัตถุดิบ
        เป้าหมาย: สร้างสูตรอาหารที่สร้างสรรค์โดยอ้างอิงจากวัตถุดิบที่ผู้ใช้มี
        กฎเหล็ก:
        1. ห้ามเพิ่มวัตถุดิบหลักที่ไม่มี (ยกเว้น Staple เช่น เกลือ น้ำตาล น้ำมัน)
        1.1 **ไม่ต้องใช้ของที่ผู้ใช้มีให้ครบทุกอย่าง** — ลิสต์ที่ให้มาคือ "ของที่มีอยู่ในตู้เย็น" ไม่ใช่ "ของที่ต้องใส่ลงหม้อ" ใส่เฉพาะของที่อยู่ในจานนี้จริงตามสูตรที่คนทำกันจริงๆ ของที่เหลือให้ปล่อยไว้ในตู้เย็น ห้ามลากมาใส่เพื่อให้ใช้ของหมดตู้เด็ดขาด เพราะจานที่ออกมาจะกินไม่ได้จริง (เช่น ซุปมะเขือเทศ ห้ามใส่เบียร์ ส้ม หรือลูกแพร์ ลงไปเพียงเพราะมันอยู่ในลิสต์)
        2. Food Safety First: ห้ามแนะนำเมนูที่เป็นอันตราย
        3. ตอบเป็น JSON โครงสร้างตามที่กำหนดเท่านั้น ห้ามมี Markdown
        4. ห้ามปนคำหรือตัวอักษรภาษาอื่น (อังกฤษ จีน เวียดนาม ฯลฯ) กลางประโยคไทยเด็ดขาด ทุก field ต้องเป็นภาษาไทยล้วน ยกเว้นชื่อเฉพาะที่ไม่มีคำแปลไทยจริงๆ เท่านั้น
        5. ต้องบอกจำนวนคนกินใน servings เสมอ และปริมาณทุกอย่างใน ingredients ต้องเป็นปริมาณสำหรับจำนวนคนนั้นพอดี
        6. แยกปริมาณเป็นตัวเลขกับหน่วยให้ด้วย (amount_value + amount_unit) เพราะผู้ใช้กดปรับจำนวนคนกินได้ แล้วระบบจะคูณปริมาณให้เอง — ปริมาณที่ไม่ใช่ตัวเลข เช่น "เล็กน้อย" "ตามชอบ" ให้ amount_value เป็น null
        7. ในขั้นตอน (instructions) ห้ามเขียนปริมาณเป็นตัวเลขซ้ำอีก ให้อ้างถึงของที่เตรียมไว้แทน (เช่น "ใส่หมูสับที่เตรียมไว้" ไม่ใช่ "ใส่หมูสับ 100 กรัม") เพราะถ้าผู้ใช้ปรับจำนวนคน ตัวเลขในขั้นตอนจะขัดกับรายการวัตถุดิบทันที
        8. ถ้ารายการวัตถุดิบที่ผู้ใช้ให้มามีสิ่งที่ไม่ใช่ของกินได้จริง (เช่น ของใช้ในบ้าน ชิ้นส่วนยานพาหนะ สิ่งของทั่วไปที่ไม่ใช่อาหาร) ห้ามฝืนแต่งสูตรออกมา ให้ตอบ JSON แบบนี้แทนทันที: { "error": "คำอธิบายสั้นๆ เป็นภาษาไทยว่าทำไมทำเมนูจากวัตถุดิบที่ให้มาไม่ได้" }${priorityRule}
        ${dietRules}`
      }, {
        role: 'user',
        content: `ประเภทอาหาร: ${cuisineType}
        วัตถุดิบที่มี: ${ingredients.join(', ')}
        ${menuName
          ? `ผู้ใช้เลือกเมนู "${menuName}" แล้ว เขียนสูตรเต็มของเมนูนี้เท่านั้น ห้ามเปลี่ยนเป็นเมนูอื่น และ recipe_name ต้องเป็น "${menuName}"${menuIngredientRule}
        เขียนขั้นตอนให้ละเอียดพอที่มือใหม่ทำตามได้ทีละขั้นจนจบ แต่ละข้อเป็นการกระทำเดียวจบในตัว${
          menuTime && menuDifficulty
            ? `
        ค่าสองอันนี้แสดงให้ผู้ใช้เห็นไปแล้วตอนเลือกเมนู ต้องตอบกลับมาให้ตรงกันเป๊ะ ห้ามคิดใหม่: estimated_time = "${menuTime}" และ difficulty = "${menuDifficulty}"`
            : ''
        }`
          : 'แนะนำเมนู 1 เมนูที่เหมาะสมที่สุด'}

        ตอบกลับเป็น JSON Structure:
        {
          "recipe_name": "ชื่อเมนู",
          "estimated_time": "ตัวเลขนาทีล้วนๆ ไม่ต้องมีหน่วยหรือข้อความอื่นปน เช่น \\"25\\"",
          "difficulty": "Easy/Medium/Hard",
          "servings": ตัวเลขจำนวนคนที่กินอิ่มจากปริมาณในสูตรนี้ (2-4 คนคือช่วงปกติ ห้ามเป็นข้อความ),
          "ingredients": [
            {
              "item": "วัตถุดิบ",
              "amount": "ปริมาณแบบข้อความเต็ม เช่น \\"100 กรัม\\" หรือ \\"2 ช้อนโต๊ะ\\"",
              "amount_value": ตัวเลขล้วนของปริมาณ เช่น 100 หรือ 2 (ถ้าปริมาณไม่ใช่ตัวเลข เช่น "เล็กน้อย" ให้เป็น null),
              "amount_unit": "หน่วยของ amount_value เช่น \\"กรัม\\" \\"ช้อนโต๊ะ\\" \\"ฟอง\\" (ถ้าไม่มีหน่วยให้เป็นข้อความว่าง)",
              "is_staple": true/false
            }
          ],
          "instructions": ["ขั้นตอนที่ 1...", "ขั้นตอนที่ 2..."],
          "nutritional_info": {
            "calories": "พลังงานต่อ 1 คน เป็นตัวเลขล้วนหน่วย kcal ไม่ต้องมีข้อความปน เช่น \\"250\\"",
            "protein": "โปรตีนต่อ 1 คน เป็นตัวเลขล้วนหน่วยกรัม ไม่ต้องมีข้อความปน เช่น \\"20\\"",
            "remarks": "ข้อมูลเพิ่มเติม"
          },
          "chef_tips": "เคล็ดลับจากเชฟ"
        }

        ถ้าวัตถุดิบที่ให้มาไม่ใช่ของกินได้จริง ให้ตอบ { "error": "..." } แทนโครงสร้างด้านบนตามกฎเหล็กข้อ 8`
      }],
      response_format: { type: 'json_object' },
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error('AI returned an empty response');
    }

    const rawRecipe = JSON.parse(text);

    // เช็คก่อนว่า AI ปฏิเสธเพราะวัตถุดิบไม่ใช่ของกินหรือเปล่า ก่อนจะ validate ด้วย RecipeSchema
    // (ไม่งั้นคำตอบที่ปฏิเสธถูกต้องแล้วจะพัง Zod เพราะไม่ตรงโครง Recipe แล้วโชว์ error ที่เข้าใจผิดได้ว่า "ลองใหม่" ทั้งที่ลองใหม่ก็จะพังซ้ำเหมือนเดิม)
    const refusal = RefusalSchema.safeParse(rawRecipe);
    if (refusal.success) {
      return NextResponse.json({ error: refusal.data.error }, { status: 400 });
    }

    // Validate with Zod (เติม field ที่ AI มักลืมให้ครบก่อน ดู normalizeRecipePayload)
    const validatedRecipe = RecipeSchema.parse(normalizeRecipePayload(rawRecipe));

    // ด่านสุดท้ายก่อนถึงจอ: สูตรที่เขียนมาผิดข้อจำกัดด้านอาหารหรือเปล่า
    // ตรวจที่ "รายการวัตถุดิบ" เป็นหลักเพราะนั่นคือของที่ผู้ใช้จะหยิบใส่ปากจริงๆ
    // ยอมให้กดใหม่ ดีกว่าปล่อยสูตรที่มีของที่เขาแพ้ผ่านไปพร้อมคำว่า "ปลอดภัย"
    const recipeViolations = findDietViolations(
      [validatedRecipe.recipe_name, ...validatedRecipe.ingredients.map(i => i.item)].join(' '),
      restrictions,
      allergies
    );
    if (recipeViolations.length > 0) {
      const detail = recipeViolations.map(v => `${v.matched} (${v.restriction})`).join(', ');
      console.warn('Diet violation in generated recipe:', detail);
      return NextResponse.json(
        {
          error: `สูตรที่ได้มามีของที่ขัดกับข้อจำกัดของคุณ (${detail}) เลยไม่แสดงให้ ลองกดเลือกเมนูนี้ใหม่อีกครั้ง หรือเลือกเมนูอื่นแทนนะ`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(validatedRecipe);
  } catch (error) {
    console.error('Generate Recipe Error:', error);

    // ชนโควตา token ต่อนาทีของ Groq ไม่ใช่ความผิดพลาดของโค้ดหรือของผู้ใช้ — แยกข้อความ
    // ออกมาเพราะสิ่งที่เขาควรทำต่างกันสิ้นเชิง: กรณีนี้แค่รอสักครู่แล้วกดใหม่ก็ได้ผลเลย
    // ส่วนข้อความรวมๆ ว่า "เกิดข้อผิดพลาด" ทำให้คนเข้าใจว่าแอปพังแล้วเลิกใช้ไปเฉยๆ
    // (สถานะ 429 ด้วย ไม่ใช่ 500 — ฝั่ง client จะได้แยกได้ถ้าวันหลังอยากใส่ auto-retry)
    if (isRateLimited(error)) {
      return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'ข้อมูลจาก AI ไม่ถูกต้องตามรูปแบบที่กำหนด กรุณาลองใหม่อีกครั้ง' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการสร้างเมนู กรุณาลองใหม่อีกครั้ง' },
      { status: 500 }
    );
  }
}
