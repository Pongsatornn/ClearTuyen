import { NextRequest, NextResponse } from 'next/server';
import {TEXT_MODEL, createGroqClient, isRateLimited, RATE_LIMIT_MESSAGE } from '@/lib/groq';
import { z } from 'zod';
import type { Difficulty, MenuSuggestion } from '@/lib/types';
import { buildDietPromptRules, findDietViolations, sanitizeDietInput } from '@/lib/diet';

const client = createGroqClient();

// ลำดับความยากสำหรับเรียงลิสต์ — ไม่ได้เอาไปแสดงบนจอ (คำไทย/สี badge อยู่ใน lib/utils.ts)
const DIFFICULTY_ORDER: Record<Difficulty, number> = { Easy: 0, Medium: 1, Hard: 2 };

// จำนวนเมนูที่จะแสดงจริงในหน้าเลือกเมนู
const MENU_COUNT = 10;

// เพดานที่ขอจาก AI — มากกว่าที่จะแสดง เพราะขั้นตอนกรองเมนูซ้ำด้านล่างมักตัดทิ้ง 2-4 เมนูเสมอ
//
// ⚠️ นี่คือ "เพดาน" ไม่ใช่ "โควตา" — prompt สั่งชัดว่าห้ามแต่งเมนูเพิ่มให้ครบจำนวนนี้
// รอบรีวิว 30 ก.ค. เจอว่า 7 ใน 10 เมนูเป็นของแต่ง (ต้มกะเพรา, ต้มกระเทียม, ยำกะเพรา, แกงกะเพรา)
// ต้นเหตุคือเดิมสั่งตรงๆ ว่า "เสนอเมนูที่ทำได้ 14 เมนู" จากวัตถุดิบ 3 อย่าง โมเดลก็เลยเอา
// วิธีปรุงมาต่อกับชื่อวัตถุดิบที่ผู้ใช้พิมพ์เข้ามาเพื่อเติมให้ครบ ซึ่งไม่ช่วยคนที่คิดเมนูไม่ออกเลย
const MENU_REQUEST_LIMIT = 10;

// โครงเมนูย่อ — `satisfies` ตรวจตอน compile ว่าตรงกับ MenuSuggestion ใน lib/types.ts เสมอ
// (แก้ field ฝั่งใดฝั่งหนึ่งแล้วลืมอีกฝั่ง TypeScript จะ error ทันที เหมือนที่ทำไว้ใน generate-recipe)
const MenuSuggestionSchema = z.object({
  recipe_name: z.string(),
  short_description: z.string(),
  estimated_time: z.string(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  uses_ingredients: z.array(z.string()),
  missing_ingredients: z.array(z.string()),
}) satisfies z.ZodType<MenuSuggestion>;

// ไม่บังคับว่าต้องครบ 10 — ถ้าวัตถุดิบมีน้อยจริงๆ AI คิดได้ 4-5 เมนูก็ยังใช้งานได้
// ดีกว่าโยน error ทิ้งทั้งชุดแล้วให้ผู้ใช้กดใหม่ไปเรื่อยๆ
const MenuListSchema = z.object({
  menus: z.array(MenuSuggestionSchema).min(1),
});

// เครื่องปรุงที่ถือว่าทุกครัวมีอยู่แล้ว ไม่นับเป็นของที่ต้องออกไปซื้อ
// สั่งห้ามไว้ในกฎเหล็กข้อ 2 แล้วโมเดลก็ยังใส่ "น้ำตาล"/"ซอสถั่วเหลือง" มาอยู่ดี เลยกรองซ้ำฝั่ง server ให้แน่นอน
// (ถ้าปล่อยให้หลุดไป ป้าย "ต้องซื้อเพิ่ม" จะขึ้นเกือบทุกเมนูจนผู้ใช้เลิกอ่าน แล้วเมนูที่ต้องซื้อของจริงๆ ก็จะถูกกลบไปด้วย)
const STAPLE_SEASONINGS = [
  'น้ำมัน',
  'เกลือ',
  'น้ำตาล',
  'น้ำปลา',
  'ซีอิ๊ว',
  'ซอสถั่วเหลือง',
  'ซอสหอยนางรม',
  'ซอสปรุงรส',
  'พริกไทย',
  'น้ำส้มสายชู',
];

// เผื่อกรณีวัตถุดิบที่ส่งมาไม่ใช่ของกินได้จริง (เช่น "ตะปู", "ยางรถยนต์")
// ใช้แนวเดียวกับ /api/generate-recipe: เช็คเคสนี้ก่อน validate ด้วย schema หลักเสมอ
const RefusalSchema = z.object({
  error: z.string(),
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

    // ชื่อเมนูที่เสนอไปแล้วในรอบก่อนๆ — มาจากปุ่ม "ขอเมนูอื่นอีก" ฝั่ง client
    // ต้องบอก AI ไม่ให้เสนอซ้ำ ไม่งั้นกดขอเพิ่มแล้วได้ลิสต์เดิมกลับมาเกือบทั้งชุด
    // ค่านี้มาจาก client จึง sanitize ก่อนฝังลง prompt เหมือน menuName ใน generate-recipe
    // จำกัดจำนวนด้วยเพราะกดขอเพิ่มไปเรื่อยๆ ลิสต์จะยาวจนกิน context ของโมเดล
    const excludeMenus: string[] = Array.isArray(body.excludeMenus)
      ? body.excludeMenus
          .filter((name: unknown): name is string => typeof name === 'string')
          .map((name: string) => name.replace(/[<>{}[\]()"'\\]/g, '').trim().slice(0, 60))
          .filter((name: string) => name.length > 0)
          .slice(0, 40)
      : [];

    // แอปนี้ชื่อ "ล้างตู้เย็น" — การจัดลำดับว่าควรรีบใช้อะไรก่อนคือหัวใจของมัน
    // แต่เดิมไม่มีอะไรทำหน้าที่นี้เลย (รอบรีวิว 30 ก.ค. หัวข้อ 3)
    const priorityRule =
      priorityIngredients.length > 0
        ? `ของพวกนี้ใกล้เสียแล้ว ผู้ใช้อยากใช้ให้หมดก่อน: ${priorityIngredients.join(', ')} — เมนูที่เสนอต้องมีเมนูที่ได้ใช้ของพวกนี้อยู่ด้วยให้มากที่สุดเท่าที่ยังเป็นอาหารจริงตามกฎเหล็กข้อ 1 (ห้ามแต่งจานขึ้นมาเพื่อให้ได้ใช้ของพวกนี้)\n        `
        : '';

    const excludeRule =
      excludeMenus.length > 0
        ? `ผู้ใช้เห็นเมนูพวกนี้ไปแล้วและอยากได้จานอื่น ห้ามเสนอซ้ำเด็ดขาด รวมถึงห้ามเสนอจานเดียวกันในชื่อที่ต่างออกไปเล็กน้อยด้วย: ${excludeMenus.join(', ')}\n        `
        : '';

    const response = await client.chat.completions.create({
      model: TEXT_MODEL,
      // สูงกว่า generate-recipe (0.4) เพราะหน้านี้ต้องการ "ความหลากหลาย" ของตัวเลือก
      // ถ้าตั้งต่ำเท่ากันจะได้เมนูหน้าตาคล้ายกันหมด 10 อัน แล้วการมีลิสต์ให้เลือกก็ไม่มีความหมาย
      // แต่ลดจาก 0.8 ลงมาเพราะค่าที่สูงเกินไปคือตัวกระตุ้นให้โมเดล "แต่งชื่อจานขึ้นมาใหม่"
      // ซึ่งเป็นบั๊กที่แย่กว่าลิสต์ที่หน้าตาคล้ายกัน — ความหลากหลายต้องมาจากกฎเหล็กข้อ 9 แทน
      temperature: 0.6,
      // gpt-oss เป็น reasoning model — ใช้ token ไปกับการ "คิดก่อนตอบ" ด้วย ไม่ใช่แค่คำตอบ
      // ค่า default เตี้ยเกินไป: Groq ตอบ 400 `json_validate_failed` พร้อมข้อความ
      // "max completion tokens reached before generating a valid document"
      // = JSON ถูกตัดกลางคัน ไม่ใช่โมเดลเขียน JSON ผิด
      // ⚠️ เพดานนี้ถูกบีบด้วย **TPM (tokens per minute) ของ Groq free tier ซึ่งอยู่ที่ 8000**
      // Groq นับ `prompt + max_completion_tokens` เป็น "จำนวนที่ขอ" ของ request นั้นเลย
      // ตั้ง 8192 แล้วโดน HTTP 413 rate_limit_exceeded ตั้งแต่คำขอเดียว (เจอจริงตอนทดสอบ)
      // ตัวเลขนี้จึงต้องเหลือที่ให้ prompt ด้วยเสมอ — ถ้าอัปเกรด tier แล้วค่อยขยับขึ้นได้
      max_completion_tokens: 5000,
      // ลดโควตาที่เสียไปกับการคิดภายใน งานนี้เป็นการ "นึกชื่อจานที่รู้อยู่แล้ว" ไม่ใช่โจทย์ให้ขบคิด
      // คิดน้อยลง = เหลือ token ให้คำตอบมากขึ้น และผู้ใช้รอสั้นลง
      reasoning_effort: 'low',
      messages: [{
        role: 'system',
        content: `คุณคือ Executive Chef de Cuisine ผู้เชี่ยวชาญเรื่องวัตถุดิบ
        เป้าหมาย: เสนอ "ตัวเลือกเมนู" หลายแบบจากวัตถุดิบที่ผู้ใช้มี ให้ผู้ใช้เลือกเองว่าอยากทำอันไหน
        กฎเหล็ก:
        1. **ทุกเมนูต้องเป็นอาหารที่มีอยู่จริงเท่านั้น** — ต้องเป็นจานที่มีชื่อเรียกซึ่งคนไทยรู้จัก สั่งตามร้านได้ หรือค้นหาสูตรแล้วเจอ ห้ามแต่งชื่อเมนูขึ้นมาเองด้วยการเอา "วิธีปรุง" ไปต่อกับ "ชื่อวัตถุดิบที่ผู้ใช้พิมพ์มา" เด็ดขาด ตัวอย่างชื่อที่ห้ามเสนอเพราะไม่ใช่อาหารที่มีอยู่จริง: "ต้มกะเพรา" "ต้มกระเทียม" "ยำกะเพรา" "แกงกะเพรา" "หมูสับยำกระเทียม" "กะหล่ำปลาตุ๋น" "ผัดผักกาดหอม" — ถ้าไม่มั่นใจว่าจานนั้นมีอยู่จริงไหม ให้ตัดทิ้ง อย่าเสนอ
        2. **คุณภาพสำคัญกว่าจำนวน** — ผู้ใช้มาที่นี่เพราะคิดเมนูไม่ออก ถ้าลิสต์มีของแต่งปนอยู่แม้แต่อันเดียว เขาจะไม่กล้าเชื่อทั้งลิสต์รวมถึงสูตรข้างในด้วย เสนอ 4 เมนูที่เป็นอาหารจริง **ดีกว่า** 14 เมนูที่มี 7 อันเป็นของแต่ง ห้ามแต่งเมนูเพิ่มเพื่อให้ครบจำนวนที่ขอมาเด็ดขาด — ขอมาเป็นเพดาน ไม่ใช่โควตาที่ต้องทำให้ครบ
        3. ห้ามเพิ่มวัตถุดิบหลักที่ไม่มี (ยกเว้น Staple เช่น เกลือ น้ำตาล น้ำมัน) — ถ้าเมนูไหนจำเป็นต้องซื้อเพิ่มจริงๆ ให้ใส่ไว้ใน missing_ingredients และต้องไม่เกิน 2 อย่างต่อเมนู
        3.1 ในทางกลับกัน แต่ละเมนู **ไม่ต้องใช้ของในตู้เย็นให้ครบทุกอย่าง** — uses_ingredients ต้องมีเฉพาะของที่จานนั้นใส่จริงตามสูตรที่คนทำกัน ห้ามใส่ชื่อของที่ไม่เข้ากับจานลงไปเพื่อให้ดูใช้ของได้คุ้ม (เช่น ซุปมะเขือเทศไม่ได้ใช้เบียร์ ส้ม หรือลูกแพร์) เพราะผู้ใช้จะกดเข้าไปเจอสูตรที่ใส่ของพวกนั้นจริงแล้วกินไม่ได้
        4. missing_ingredients มีไว้ตอบคำถามเดียวคือ "ต้องออกจากบ้านไปซื้อของไหม" ห้ามใส่เครื่องปรุงพื้นฐานที่ถือว่าทุกครัวมีอยู่แล้ว (น้ำมัน เกลือ น้ำตาล น้ำปลา ซีอิ๊ว ซอสหอยนางรม ซอสปรุงรส พริกไทย น้ำส้มสายชู) ลงในช่องนี้เด็ดขาด ถ้าขาดแค่เครื่องปรุงพวกนี้ให้ถือว่าไม่ต้องซื้ออะไรเลยแล้วตอบเป็น []
        5. Food Safety First: ห้ามแนะนำเมนูที่เป็นอันตราย
        6. ตอบเป็น JSON โครงสร้างตามที่กำหนดเท่านั้น ห้ามมี Markdown
        7. ห้ามปนคำหรือตัวอักษรภาษาอื่น (อังกฤษ จีน เวียดนาม ฯลฯ) กลางประโยคไทยเด็ดขาด ทุก field ต้องเป็นภาษาไทยล้วน ยกเว้นชื่อเฉพาะที่ไม่มีคำแปลไทยจริงๆ เท่านั้น
        8. ทุกเมนูต้องเป็นคนละจานกันจริงๆ ห้ามเสนอจานเดียวกันที่ต่างกันแค่ใส่/ไม่ใส่ข้าว หรือแค่สลับลำดับชื่อวัตถุดิบ (เช่น "ผัดกะเพรา" กับ "ข้าวผัดกะเพรา" กับ "ข้าวหมูสับผัดกะเพรา" นับเป็นเมนูซ้ำกันทั้งหมด เลือกมาได้อันเดียว)
        9. กระจายวิธีปรุงให้หลากหลาย (ผัด/ต้ม/ทอด/นึ่ง/ยำ/แกง/อบ/ตุ๋น) วิธีปรุงแบบเดียวกันห้ามเกิน 3 เมนู และให้มีทั้งเมนูง่ายและเมนูที่ท้าทายขึ้นปนกันไป — แต่ข้อนี้ต้องไม่ขัดกับข้อ 1 ถ้าวิธีปรุงไหนไม่มีจานจริงรองรับก็ข้ามไป อย่าแต่งจานขึ้นมาเพื่อให้วิธีปรุงครบ
        10. ขั้นตอนนี้เป็นแค่ "ลิสต์ให้เลือก" ห้ามใส่วิธีทำละเอียด ส่วน short_description ต้องบอกสิ่งที่ผู้ใช้ยังไม่รู้เกี่ยวกับจานนี้ (รสชาติ เนื้อสัมผัส หน้าตา หรือโอกาสที่คนนิยมกิน) ห้ามพูดซ้ำว่าทำจากอะไรเพราะผู้ใช้เป็นคนพิมพ์วัตถุดิบมาเอง ห้ามเขียนแนว "อาหารที่ทำจากหมูสับ" "รสชาติเข้มข้นจากกะเพรา" หรือ "อาหารเช้าที่ทำง่าย" และห้ามขึ้นต้นเหมือนกันทุกอัน ยาวไม่เกิน 1 ประโยค
        11. ถ้ารายการวัตถุดิบที่ผู้ใช้ให้มามีสิ่งที่ไม่ใช่ของกินได้จริง (เช่น ของใช้ในบ้าน ชิ้นส่วนยานพาหนะ สิ่งของทั่วไปที่ไม่ใช่อาหาร) ห้ามฝืนแต่งเมนูออกมา ให้ตอบ JSON แบบนี้แทนทันที: { "error": "คำอธิบายสั้นๆ เป็นภาษาไทยว่าทำไมทำเมนูจากวัตถุดิบที่ให้มาไม่ได้" }
        ${dietRules}`
      }, {
        role: 'user',
        content: `ประเภทอาหาร: ${cuisineType}
        วัตถุดิบที่มี: ${ingredients.join(', ')}
        ${priorityRule}${excludeRule}เสนอเมนูได้มากที่สุด ${MENU_REQUEST_LIMIT} เมนู แต่ให้เสนอเฉพาะจานที่เป็นอาหารมีอยู่จริงตามกฎเหล็กข้อ 1-2 เท่านั้น ถ้าจากวัตถุดิบชุดนี้นึกออกจริงๆ แค่ 4 จาน ก็ตอบมา 4 จาน อย่าแต่งเพิ่ม
        เรียงจากเมนูที่ใช้ของในตู้เย็นได้คุ้มที่สุดก่อน (คุ้ม = จานนั้นใช้ของที่มีอยู่ได้จริงหลายอย่างโดยยังเป็นจานเดิม ไม่ใช่จานที่ยัดของทุกอย่างลงไป)
        short_description ต้องสั้นจริงๆ ไม่เกิน 1 ประโยค

        ตอบกลับเป็น JSON Structure:
        {
          "menus": [
            {
              "recipe_name": "ชื่อจานที่มีอยู่จริง",
              "short_description": "1 ประโยคบอกสิ่งที่ผู้ใช้ยังไม่รู้เกี่ยวกับจานนี้ ห้ามพูดซ้ำว่าทำจากอะไร",
              "estimated_time": "ตัวเลขนาทีล้วนๆ ไม่ต้องมีหน่วยหรือข้อความอื่นปน เช่น \\"25\\"",
              "difficulty": "Easy/Medium/Hard",
              "uses_ingredients": ["วัตถุดิบของผู้ใช้ที่จานนี้ใส่จริงเท่านั้น ตามกฎเหล็กข้อ 3.1 ไม่ต้องครบทุกอย่างที่มี"],
              "missing_ingredients": ["ของที่ต้องออกไปซื้อจริงๆ ห้ามใส่เครื่องปรุงพื้นฐานตามกฎเหล็กข้อ 4 ปกติควรเป็น []"]
            }
          ]
        }

        ถ้าวัตถุดิบที่ให้มาไม่ใช่ของกินได้จริง ให้ตอบ { "error": "..." } แทนโครงสร้างด้านบนตามกฎเหล็กข้อ 11`
      }],
      response_format: { type: 'json_object' },
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error('AI returned an empty response');
    }

    const raw = JSON.parse(text);

    // เช็คก่อนว่า AI ปฏิเสธเพราะวัตถุดิบไม่ใช่ของกินหรือเปล่า ก่อนจะ validate ด้วย MenuListSchema
    // (ไม่งั้นคำตอบที่ปฏิเสธถูกต้องแล้วจะพัง Zod แล้วโชว์ error ที่เข้าใจผิดได้ว่า "ลองใหม่" ทั้งที่ลองใหม่ก็พังซ้ำ)
    const refusal = RefusalSchema.safeParse(raw);
    if (refusal.success) {
      return NextResponse.json({ error: refusal.data.error }, { status: 400 });
    }

    // โมเดล gpt-oss แทรก element ขยะ (สตริงว่าง `""`) คั่นกลาง array ที่ตอบมาเป็นบางครั้ง
    // — เป็น JSON ที่ parse ผ่านแต่ Zod ตีตกทั้งชุด แล้วผู้ใช้จะเห็น "ลองใหม่อีกครั้ง"
    // ทั้งที่เมนูที่ใช้ได้จริงมาครบแล้ว ทิ้งเฉพาะตัวที่ไม่ใช่ object ก่อน validate
    // (ดูหมายเหตุใน lib/groq.ts — ทุกที่ที่รับ array จากโมเดลนี้ต้องกรองแบบเดียวกัน)
    if (raw && Array.isArray(raw.menus)) {
      raw.menus = raw.menus.filter(
        (item: unknown) => item !== null && typeof item === 'object' && !Array.isArray(item)
      );
    }

    const { menus } = MenuListSchema.parse(raw);

    // กันเมนูซ้ำหลุดไปถึงหน้าจอ สั่งห้ามไว้ในกฎเหล็กข้อ 6 แล้วโมเดลก็ยังเสนอจานเดียวกัน
    // ในชื่อที่ยาวขึ้นอยู่ดี (ผัดกะเพรา / ผัดกะเพราใส่ไข่ / ข้าวผัดกะเพรา) เลยกรองซ้ำอีกชั้นด้วยกฎง่ายๆ:
    // ถ้าชื่อเมนูหนึ่งเป็นส่วนหนึ่งของอีกชื่อ ให้ถือว่าเป็นจานเดียวกัน แล้วเก็บอันที่มาก่อนไว้
    // (AI เรียงเมนูที่ใช้ของในตู้เย็นได้คุ้มที่สุดไว้ต้นลิสต์ ตัวที่มาก่อนจึงมีค่ากับผู้ใช้มากกว่า)
    const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '');
    const uniqueMenus: MenuSuggestion[] = [];

    // เมนูที่ผู้ใช้เห็นไปแล้ว — สั่งห้ามซ้ำไว้ใน prompt แล้ว แต่กรองซ้ำฝั่ง server ด้วย
    // เพราะกด "ขอเมนูอื่นอีก" แล้วได้ของเดิมกลับมาคือการทำให้ปุ่มนั้นดูเหมือนเสีย
    // ใช้เกณฑ์ substring เดียวกับการกันเมนูซ้ำด้านล่าง จะได้จับ "ผัดกะเพรา" กับ "ข้าวผัดกะเพรา" ได้ด้วย
    const excludedNames = excludeMenus.map(normalize).filter(Boolean);

    for (const menu of menus) {
      const name = normalize(menu.recipe_name);
      if (!name) continue;

      const isAlreadySeen = excludedNames.some(
        seen => seen.includes(name) || name.includes(seen)
      );
      if (isAlreadySeen) continue;

      // ด่านตรวจข้อจำกัดด้านอาหารฝั่ง server — สั่งใน prompt แล้วโมเดลยังเสนอเมนูผิดกฎมาอยู่ดี
      // ต้องกรองก่อนถึงจอ เพราะคนที่เลือก "แพ้กุ้ง" ไว้แล้วเห็นเมนูกุ้งในลิสต์ = แอปนี้เชื่อไม่ได้อีกเลย
      const violations = findDietViolations(
        [menu.recipe_name, menu.short_description, ...menu.uses_ingredients, ...menu.missing_ingredients].join(' '),
        restrictions,
        allergies
      );
      if (violations.length > 0) continue;

      const isDuplicate = uniqueMenus.some(kept => {
        const keptName = normalize(kept.recipe_name);
        return keptName.includes(name) || name.includes(keptName);
      });
      if (isDuplicate) continue;

      uniqueMenus.push({
        ...menu,
        missing_ingredients: menu.missing_ingredients.filter(
          item => !STAPLE_SEASONINGS.some(staple => item.includes(staple))
        ),
      });
      if (uniqueMenus.length === MENU_COUNT) break;
    }

    // เรียงง่าย → ยาก เป็นขั้นสุดท้าย (หลังคัดเหลือ 10 เมนูแล้ว) ให้ผู้ใช้ไล่สายตาจากเมนูที่ลงมือได้เลย
    // ไปหาเมนูที่ต้องใช้ฝีมือ — เดิมใช้ลำดับที่ AI ส่งมาตรงๆ ซึ่งง่าย/ปานกลาง/ยากปนกันจนดูเหมือนสุ่ม
    // sort ของ JS เป็น stable (ES2019 เป็นต้นมา) เมนูที่ความยากเท่ากันจึงยังเรียงตามลำดับ
    // "ใช้ของในตู้เย็นได้คุ้มที่สุดก่อน" ที่ AI จัดมาให้เหมือนเดิม ไม่ได้เสียเกณฑ์นั้นไป
    // เมนูที่ได้ใช้ของใกล้เสียขึ้นก่อนเสมอ แล้วค่อยเรียงง่าย→ยากภายในแต่ละกลุ่ม
    // ทำฝั่ง server เพราะสั่งให้ AI เรียงแล้วมันเรียงไม่ตามสั่งอยู่ดี (บทเรียนเดียวกับ DIFFICULTY_ORDER)
    const usesPriority = (menu: MenuSuggestion) =>
      priorityIngredients.some(item =>
        [menu.recipe_name, ...menu.uses_ingredients].some(text => text.includes(item))
      );

    uniqueMenus.sort((a, b) => {
      const priorityGap = Number(usesPriority(b)) - Number(usesPriority(a));
      if (priorityGap !== 0) return priorityGap;
      return DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty];
    });

    // กรองจนไม่เหลือเมนูเลย = ทุกเมนูที่ AI คิดมาผิดข้อจำกัด บอกตรงๆ ดีกว่าส่งลิสต์ว่างไปให้งง
    // เรียงเงื่อนไขจากเฉพาะเจาะจงไปกว้าง: คนที่เพิ่งกด "ขอเมนูอื่นอีก" ต้องได้คำตอบเรื่องนั้น
    // ไม่ใช่ถูกบอกให้ "เพิ่มวัตถุดิบ" ทั้งที่ปัญหาคือของชุดนี้มันหมดมุกแล้วจริงๆ
    if (uniqueMenus.length === 0) {
      const reason =
        excludedNames.length > 0
          ? 'คิดเมนูอื่นที่ไม่ซ้ำกับที่เสนอไปแล้วไม่ออกอีกแล้ว จากวัตถุดิบชุดนี้น่าจะหมดมุกแล้วจริงๆ ลองเพิ่มวัตถุดิบอีกสักอย่างดูนะ'
          : restrictions.length > 0 || allergies.length > 0
            ? 'หาเมนูที่ตรงกับข้อจำกัดด้านอาหารของคุณจากวัตถุดิบชุดนี้ไม่ได้ ลองเพิ่มวัตถุดิบหรือลดเงื่อนไขลงดูนะ'
            : 'ยังหาเมนูที่เหมาะกับวัตถุดิบชุดนี้ไม่ได้ ลองเพิ่มวัตถุดิบอีกสักอย่างดูนะ';

      return NextResponse.json({ error: reason }, { status: 400 });
    }

    return NextResponse.json({ menus: uniqueMenus });
  } catch (error) {
    console.error('Suggest Menus Error:', error);

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
      { error: 'เกิดข้อผิดพลาดในการหาเมนู กรุณาลองใหม่อีกครั้ง' },
      { status: 500 }
    );
  }
}
