import Groq from 'groq-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { MAX_AUDIO_BYTES, TRANSCRIBE_MODEL, audioExtensionFor } from '@/lib/voice';

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * สร้าง "คำใบ้" ให้ Whisper รู้ล่วงหน้าว่ากำลังจะได้ยินศัพท์อะไรบ้าง
 *
 * นี่คือส่วนที่ทำให้การถอดเสียงไทยในแอปนี้แม่นขึ้นแบบเห็นได้ชัด และเป็นเหตุผลหลัก
 * ที่เลือกยิง Whisper แทนการใช้ SpeechRecognition ของเบราว์เซอร์ (ซึ่งใส่คำใบ้ไม่ได้เลย)
 *
 * Whisper รับ `prompt` เป็นบริบทของเสียงที่กำลังจะมา แล้วเอนไปทางคำในนั้นเวลาเจอเสียง
 * ที่ตีความได้หลายทาง — ปัญหาที่เกิดจริงกับศัพท์ครัวไทยที่เสียงใกล้กันมาก เช่น
 * "กะเพรา" กับ "กะเพา"/"กระเพรา", "ตะไคร้" กับ "ตะไกร", "ข่า" กับ "ขา"
 * พอบอกไปก่อนว่าในครัวนี้มีกะเพราและตะไคร้อยู่จริง มันจะเลือกคำที่ถูกให้เอง
 *
 * ⚠️ ช่องนี้รับได้ประมาณ 224 token เท่านั้น ส่วนที่เกินถูกตัดทิ้งเงียบๆ จึงต้องตัดเอง
 * ให้สั้นก่อน และเรียงของที่สำคัญที่สุด (ชื่อเมนู แล้วค่อยวัตถุดิบ) ไว้ต้นสุด
 */
function buildBiasPrompt(recipeName?: string, terms?: string[]): string | undefined {
  const parts: string[] = [];
  if (recipeName) parts.push(recipeName);

  const seen = new Set<string>();
  for (const term of terms ?? []) {
    if (typeof term !== 'string') continue;
    // ตัดปริมาณ/หน่วยออก เหลือแต่ชื่อของ — "หมูสับ 200 กรัม" ไม่ได้ช่วยให้ถอดคำว่า
    // "หมูสับ" แม่นขึ้น แต่กินโควตา token ที่มีน้อยอยู่แล้วไปฟรีๆ
    const name = term.replace(/[\d/.-]+\s*\S*$/u, '').trim() || term.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    parts.push(name);
  }

  if (!parts.length) return undefined;

  // ประกอบเป็นประโยคไทยธรรมดา ไม่ใช่ลิสต์คั่นด้วยจุลภาคล้วน เพราะ prompt ของ Whisper
  // ทำงานเหมือน "ข้อความก่อนหน้าในบทสนทนาเดียวกัน" — เขียนให้เป็นภาษาที่มันคุ้น
  // ยังช่วยล็อกภาษาที่จะถอดออกมาให้เป็นไทยไปในตัวด้วย
  const list = parts.slice(0, 40).join(' ');
  return `นี่คือคำถามระหว่างทำอาหารในครัว เกี่ยวกับ ${list}`.slice(0, 800);
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData().catch(() => null);
    const audio = form?.get('audio');

    if (!form || !(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: 'ไม่พบไฟล์เสียง' }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'ไฟล์เสียงยาวเกินไป' }, { status: 413 });
    }

    const rawName = form.get('recipeName');
    const recipeName = typeof rawName === 'string' && rawName ? rawName : undefined;

    // ฝั่ง client ส่งมาเป็น JSON array ก้อนเดียว เพื่อไม่ต้องยัด field ซ้ำๆ ใน FormData
    let terms: string[] = [];
    const rawTerms = form.get('terms');
    if (typeof rawTerms === 'string') {
      try {
        const parsed = JSON.parse(rawTerms);
        if (Array.isArray(parsed)) terms = parsed.filter((t): t is string => typeof t === 'string');
      } catch {
        // คำใบ้เป็นของแถมที่ช่วยให้แม่นขึ้น ไม่ใช่ของที่ขาดไม่ได้ —
        // ส่งมาเสียก็ถอดเสียงต่อไปโดยไม่มีคำใบ้ ดีกว่าปฏิเสธทั้งคำถามของผู้ใช้
      }
    }

    // ตั้งชื่อไฟล์ตามชนิดที่เบราว์เซอร์อัดมาจริง — Groq เดาชนิดเสียงจากนามสกุล
    // ถ้าส่งคลิป mp4 จาก iPhone โดยตั้งชื่อ .webm จะโดนปฏิเสธทั้งคลิป
    const mimeType = audio.type || 'audio/webm';
    const file = new File([audio], `speech.${audioExtensionFor(mimeType)}`, { type: mimeType });

    const result = await client.audio.transcriptions.create({
      file,
      model: TRANSCRIBE_MODEL,
      // ล็อกเป็นไทยไปเลย ไม่ปล่อยให้เดาภาษาเอง — คำถามสั้นๆ อย่าง "อันนี้ใช่ไหม"
      // มีเสียงน้อยเกินกว่าจะเดาภาษาถูก แล้วมันจะถอดออกมาเป็นอังกฤษมั่วๆ
      language: 'th',
      prompt: buildBiasPrompt(recipeName, terms),
      // 0 = ไม่ต้องสร้างสรรค์ งานนี้ต้องการคำที่ได้ยินจริง ไม่ใช่คำที่ฟังดูเข้าท่า
      temperature: 0,
      response_format: 'json',
    });

    const text = (result.text ?? '').trim();
    if (!text) {
      // อัดติดแต่ไม่มีเสียงพูด (เสียงกระทะ เสียงพัดลมดูดควัน) — ไม่ใช่ error
      // ฝั่ง UI จะบอกให้พูดใหม่ ไม่ใช่ขึ้นว่าระบบพัง
      return NextResponse.json({ text: '', empty: true });
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error('Transcribe error:', error);
    return NextResponse.json({ error: 'ถอดเสียงไม่สำเร็จ' }, { status: 500 });
  }
}
