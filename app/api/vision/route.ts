import { NextRequest, NextResponse } from 'next/server';
import {VISION_MODEL, createGroqClient, isRateLimited, RATE_LIMIT_MESSAGE } from '@/lib/groq';

const client = createGroqClient();

// จำนวนวัตถุดิบสูงสุดที่ยอมรับจากรูปเดียว — กันกรณีโมเดลไล่ชื่อของทุกชิ้นในตู้เย็นยาวเป็นพรืด
// จนลิสต์ของผู้ใช้เละ (เจอตอนทดสอบว่ารูปตู้เย็นเต็มๆ ได้กลับมา 8-10 ชื่อเป็นปกติ)
const MAX_INGREDIENTS = 20;

// ชื่อวัตถุดิบไทยยาวสุดที่พบจริงราว 15 ตัวอักษร ("ผักกาดขาวปลี") — อะไรที่ยาวกว่านี้มาก
// แปลว่าโมเดลเขียนเป็นประโยคคำอธิบายมา ไม่ใช่ชื่อของ ต้องไม่ปล่อยให้กลายเป็นชิปในลิสต์
const MAX_NAME_LENGTH = 25;

// คำขึ้นต้นของ "คำปฏิเสธที่ไม่ใช่คำเดียวเป๊ะๆ" — โมเดลถูกสั่งให้ตอบว่า "ไม่พบ" คำเดียว
// แต่บ่อยครั้งตอบเป็น "ไม่พบวัตถุดิบทำอาหารในภาพ" ซึ่งเดิมเช็คด้วย `item !== 'ไม่พบ'` จึงหลุด
// เข้าลิสต์ไปเป็นวัตถุดิบชื่อประหลาดแทนที่จะถูกนับเป็น "ไม่เจอของ"
const REFUSAL_PREFIXES = ['ไม่พบ', 'ไม่มี', 'ไม่เห็น', 'ขอโทษ', 'ไม่สามารถ'];

const BASE_PROMPT = `ดูรูปนี้แล้วบอกชื่อของกินที่มองเห็นในภาพ

เงื่อนไข:
- ตอบเป็นชื่อของคั่นด้วยจุลภาคเท่านั้น เช่น: หมูสับ, ไข่ไก่, ผักกาดขาว
- ห้ามมีคำอธิบาย ห้ามมีตัวเลขนำหน้า ห้ามใส่คำว่า "ในภาพมี" ห้ามตอบเป็นประโยค
- ตอบเป็นภาษาไทยล้วน
- นับทุกอย่างที่กินได้: ผัก ผลไม้ เนื้อสัตว์ ไข่ ของในขวด/กล่อง/ถุงที่ดูออกว่าเป็นอะไร (นม น้ำผลไม้ ชีส เต้าหู้)
- รูปส่วนใหญ่ถ่ายในตู้เย็นซึ่งแสงน้อยและของวางซ้อนกัน ให้พยายามระบุเท่าที่มองออกจริง ไม่ต้องรอให้เห็นชัดทุกชิ้น
- ถ้าไม่แน่ใจว่าเป็นของชนิดไหน ให้เรียกกว้างๆ ไปเลย เช่น "ผักใบเขียว" "ผลไม้" ดีกว่าข้ามไป
- ห้ามเดาของที่ไม่ได้อยู่ในภาพ
- ตอบว่า "ไม่พบ" คำเดียวเฉพาะกรณีที่ในภาพไม่มีของกินอยู่เลยจริงๆ เท่านั้น`;

// ครั้งที่สองบอกตรงๆ ว่าเพิ่งตอบว่าไม่พบไปแล้ว — ถ้าปล่อย prompt เดิมซ้ำ โมเดลมักตอบเหมือนเดิม
const RETRY_PROMPT = `${BASE_PROMPT}

หมายเหตุ: เมื่อกี้มีการตอบว่า "ไม่พบ" กับรูปนี้ไปแล้ว แต่ผู้ใช้ยืนยันว่าเป็นรูปของกิน
ให้ดูใหม่อีกรอบให้ละเอียด แล้วไล่ชื่อของที่พอมองออกมาให้หมด ใช้ชื่อกว้างๆ ได้ถ้าไม่แน่ใจ`;

/**
 * แปลงคำตอบดิบของโมเดลเป็นลิสต์ชื่อวัตถุดิบ
 *
 * เดิมทำแค่ `.split(',')` แล้วกรอง `item !== 'ไม่พบ'` ซึ่งพังสองทาง:
 *   1. โมเดลตอบเป็นบรรทัดๆ หรือใส่ bullet/เลขข้อ → ได้ชิปหน้าตาแบบ "1. มะเขือเทศ"
 *   2. โมเดลปฏิเสธเป็นประโยค ("ไม่พบวัตถุดิบทำอาหารในภาพ") → กลายเป็นวัตถุดิบชื่อยาวๆ ในลิสต์
 */
function parseIngredients(content: string): string[] {
  const seen = new Set<string>();

  return content
    .split(/[,，\n•]/)
    .map((item) => item.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').replace(/["'`]/g, '').trim())
    .filter((item) => {
      if (item.length === 0 || item.length > MAX_NAME_LENGTH) return false;
      if (REFUSAL_PREFIXES.some((prefix) => item.startsWith(prefix))) return false;
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, MAX_INGREDIENTS);
}

// เพดาน token ของคำตอบรอบแรก และรอบที่ยิงซ้ำเมื่อพบว่ารอบแรกถูกตัดกลางคัน
// (โมเดล reasoning ใช้ token ไปกับการคิดภายในด้วย คำตอบที่ต้องการเองสั้นแค่ไม่กี่สิบ token)
const ANSWER_TOKENS = 2000;
const ANSWER_TOKENS_RETRY = 4000;

type ScanResult = { ingredients: string[]; truncated: boolean };

async function scanImage(image: string, prompt: string, maxTokens: number): Promise<ScanResult> {
  const response = await client.chat.completions.create({
    // หมายเหตุ: 'meta-llama/llama-4-scout-17b-16e-instruct' ถูก Groq ถอดออกจากรายการโมเดลแล้ว (404 model_not_found)
    // 'qwen/qwen3.6-27b' คือโมเดลเดียวที่รองรับภาพ (input_modalities: text+image) ที่ยังใช้งานได้จริงบน API key นี้ ณ ตอนแก้ไข
    model: VISION_MODEL,
    reasoning_format: 'hidden', // โมเดลนี้เป็น reasoning model จะแทรก <think>...</think> ปนมาใน content ถ้าไม่ตั้งค่านี้
    // งานนี้คือ "อ่านว่าเห็นอะไร" ไม่ใช่งานที่ต้องการความสร้างสรรค์ ค่า default ของ Groq (1.0)
    // ทำให้รูปเดียวกันได้คำตอบคนละชุดทุกครั้ง — วัดจริงกับรูปตู้เย็นรูปเดียว 6 ครั้ง ได้ลิสต์ไม่ซ้ำกันเลย
    // และมีของที่ไม่ได้อยู่ในภาพโผล่มาด้วย (เกาลัด, แยม, ทับทิม) ส่วนอีก 1 ครั้งตอบว่า "ไม่พบ" ทั้งที่รูปเดิม
    temperature: 0,
    // ⚠️ ต้องกำหนดเสมอ ไม่ใช่เพื่อกันคำตอบยาว แต่เพราะ **Groq นับ `prompt + max_completion_tokens`
    // เป็นโควตาที่ request นั้นจองไว้ทั้งก้อน** เทียบกับเพดาน TPM ของ free tier ที่ 8,000
    // ปล่อยว่างไว้ = จองตามเพดานของโมเดล ซึ่งกินโควตาเกือบทั้งนาทีจากคำขอเดียว
    // วัดจริงบน production ที่ยังไม่ได้ตั้งค่านี้: ยิงรูปเดียวกัน 14 ครั้ง ห่างกันครั้งละ 6-25 วินาที
    // โดยไม่มีผู้ใช้คนอื่นเลย โดน 429 ไป 4 ครั้ง (29%) — ผู้ใช้จริงจะเจอเป็น "ระบบตอบไม่ทัน"
    // ทั้งที่ตัวเองเพิ่งกดครั้งเดียว หรือกดสแกนเสร็จแล้วไปกดหาเมนูต่อไม่ได้
    //
    // หมายเหตุ: ไม่ตั้ง `reasoning_effort` ที่นี่ต่างจาก /api/suggest-menus เพราะค่าที่โมเดลแต่ละ
    // ตระกูลรับได้ไม่เหมือนกัน (ตระกูล qwen บาง version รับแค่ 'none'/'default' แล้วตอบ 400 ถ้าส่ง
    // 'low' เข้าไป) ซึ่งจะทำให้ฟีเจอร์ดูรูปตายทั้งฟีเจอร์ ต้องทดสอบกับโมเดลตัวจริงก่อนค่อยใส่
    max_completion_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: image,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  });

  const choice = response.choices[0];

  return {
    ingredients: parseIngredients(choice?.message?.content || ''),
    // คำตอบถูกตัดเพราะ token หมดก่อน ไม่ใช่เพราะในรูปไม่มีของกิน — สองอย่างนี้หน้าตาเหมือนกัน
    // ตรงที่ได้ลิสต์ว่างเท่ากัน แต่วิธีแก้คนละทาง (อันนี้ต้องเพิ่มเพดาน ไม่ใช่ให้ผู้ใช้ถ่ายรูปใหม่)
    truncated: choice?.finish_reason === 'length',
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || !body.image) {
      return NextResponse.json({ error: 'ไม่พบรูปภาพ' }, { status: 400 });
    }

    const { image } = body;

    // Validate Base64 image size (Approximate: 4 characters per 3 bytes)
    const sizeInBytes = (image.length * 3) / 4;
    const maxSizeInBytes = 5 * 1024 * 1024; // 5MB

    if (sizeInBytes > maxSizeInBytes) {
      return NextResponse.json({ error: 'รูปภาพมีขนาดใหญ่เกินไป (จำกัด 5MB)' }, { status: 413 });
    }

    let result = await scanImage(image, BASE_PROMPT, ANSWER_TOKENS);

    // ยิงซ้ำอีกครั้งเดียวเมื่อรอบแรกได้ลิสต์ว่าง
    //
    // เหตุผล: คำว่า "ไม่พบ" จากโมเดลไม่ได้แปลว่าในรูปไม่มีของกินจริงๆ เสมอไป — วัดกับรูปตู้เย็น
    // ที่คนมองเห็นมะเขือเทศ/ส้ม/แครอทชัดๆ ยิงไป 11 ครั้ง ได้ของกลับมา 10 ครั้ง ตอบ "ไม่พบ" 1 ครั้ง
    // เดิมแอปเชื่อคำตอบครั้งเดียวนั้นแล้วขึ้นข้อความโทษรูปของผู้ใช้ว่า "ถ่ายใหม่ให้เห็นของชัดๆ"
    // ทั้งที่กดสแกนรูปเดิมซ้ำมักได้ผลทันที (นี่คืออาการที่รีวิวรอบที่ 4 เจอ)
    //
    // ยิงซ้ำแค่ครั้งเดียวเพราะแต่ละครั้งกินทั้งเวลารอของผู้ใช้และโควตา TPM ที่แชร์กับ route อื่น
    if (result.ingredients.length === 0) {
      result = result.truncated
        ? await scanImage(image, BASE_PROMPT, ANSWER_TOKENS_RETRY)
        : await scanImage(image, RETRY_PROMPT, ANSWER_TOKENS);
    }

    const { ingredients } = result;

    // บอก client ไปด้วยว่าลิสต์ว่างนี้คือ "ดูแล้วสองรอบก็ไม่เจอ" ไม่ใช่ error
    // เพื่อให้ฝั่งหน้าจอเลือกข้อความและปุ่มถัดไปได้ถูก
    return NextResponse.json({
      ingredients,
      ...(ingredients.length === 0 ? { reason: 'no-food' } : {}),
    });
  } catch (error) {
    console.error('Vision Error:', error);

    // ชนโควตา token ต่อนาทีของ Groq ไม่ใช่ความผิดพลาดของโค้ดหรือของผู้ใช้ — แยกข้อความ
    // ออกมาเพราะสิ่งที่เขาควรทำต่างกันสิ้นเชิง: กรณีนี้แค่รอสักครู่แล้วกดใหม่ก็ได้ผลเลย
    // ส่วนข้อความรวมๆ ว่า "เกิดข้อผิดพลาด" ทำให้คนเข้าใจว่าแอปพังแล้วเลิกใช้ไปเฉยๆ
    // (สถานะ 429 ด้วย ไม่ใช่ 500 — ฝั่ง client จะได้แยกได้ถ้าวันหลังอยากใส่ auto-retry)
    if (isRateLimited(error)) {
      return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการวิเคราะห์รูปภาพ' }, { status: 500 });
  }
}
