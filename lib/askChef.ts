import type { ChatMessage, ChefContext } from './types';

/**
 * ถามเชฟหนึ่งครั้ง แล้วคืนคำตอบเป็นข้อความ
 *
 * แยกออกมาจาก component เพราะมีสองหน้าจอที่ยิง `/api/chat` ด้วย payload ชุดเดียวกัน
 * เป๊ะๆ — กล่องแชท (`ChefChat`) กับโหมดโทรคุย (`ChefCall`) ถ้าต่างคนต่างประกอบ body เอง
 * วันที่เพิ่มบริบทใหม่จะได้เชฟที่ "รู้เรื่อง" ไม่เท่ากันสองตัวในแอปเดียว
 *
 * ฟังก์ชันนี้**ไม่โยน error ออกไป** — คืนข้อความขอโทษเป็นภาษาไทยแทน เพราะทุกที่ที่เรียกใช้
 * ต้องเอาผลลัพธ์ไปแสดงเป็นฟองข้อความของเชฟอยู่ดี และในโหมดโทรคุยการโยน error ขึ้นไป
 * จะทำให้สายหลุดกลางคันทั้งที่ผู้ใช้แค่เน็ตสะดุดหนึ่งจังหวะ
 */
export async function askChef(
  context: ChefContext,
  messages: ChatMessage[],
  /** คำตอบนี้จะถูกอ่านออกเสียงไหม — เปลี่ยนกฎการตอบฝั่ง server ให้เหมาะกับการฟัง */
  spoken: boolean
): Promise<string> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...context, messages, voice: spoken }),
    });
    const data = await res.json();
    return data.content ?? 'ขอโทษครับ เกิดข้อผิดพลาด';
  } catch {
    return 'ขอโทษครับ ตอนนี้เชื่อมต่อไม่ได้ ลองถามใหม่อีกครั้งนะครับ';
  }
}
