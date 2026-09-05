import { NextRequest, NextResponse } from 'next/server';
import {VISION_MODEL, createGroqClient, isRateLimited, RATE_LIMIT_MESSAGE } from '@/lib/groq';

const client = createGroqClient();

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

    const response = await client.chat.completions.create({
      // หมายเหตุ: 'meta-llama/llama-4-scout-17b-16e-instruct' ถูก Groq ถอดออกจากรายการโมเดลแล้ว (404 model_not_found)
      // 'qwen/qwen3.6-27b' คือโมเดลเดียวที่รองรับภาพ (input_modalities: text+image) ที่ยังใช้งานได้จริงบน API key นี้ ณ ตอนแก้ไข
      model: VISION_MODEL,
      reasoning_format: 'hidden', // โมเดลนี้เป็น reasoning model จะแทรก <think>...</think> ปนมาใน content ถ้าไม่ตั้งค่านี้
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
              text: 'วิเคราะห์รูปภาพนี้และบอกชื่อวัตถุดิบทำอาหารที่เห็นในภาพ ตอบเป็นภาษาไทยเท่านั้น โดยตอบเป็นรายการคั่นด้วยเครื่องหมายจุลภาค เช่น: หมูสับ, ไข่ไก่, ผักกาดขาว ห้ามมีคำบรรยายอื่นนอกจากชื่อวัตถุดิบ ถ้าในภาพไม่มีวัตถุดิบทำอาหารให้เห็นเลย ให้ตอบคำเดียวว่า: ไม่พบ',
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content || '';
    const ingredients = content
      .split(/[,，]/)
      .map((item: string) => item.trim())
      .filter((item: string) => item.length > 0 && item !== 'ไม่พบ');

    return NextResponse.json({ ingredients });
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