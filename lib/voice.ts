/**
 * ค่ากลางและตัวช่วยของโหมดคุยด้วยเสียง — ใช้ร่วมกันทั้งฝั่ง client และ API route
 *
 * แยกออกมาไฟล์เดียวด้วยเหตุผลเดียวกับ `lib/groq.ts`: ตัวเลขจูนของงานเสียง
 * (เกณฑ์ความดัง, เวลาเงียบก่อนตัดจบ) เป็นของที่ต้องมานั่งปรับซ้ำหลังลองใช้จริงในครัว
 * ถ้ากระจายอยู่ใน component จะหาไม่เจอว่าต้องขยับตัวไหน
 */

/**
 * โมเดลถอดเสียงของ Groq — ใช้ใน /api/transcribe
 *
 * เลือก `whisper-large-v3` ไม่ใช่ `-turbo` เพราะงานนี้เป็นภาษาไทยที่มีศัพท์ครัว
 * เฉพาะทางเยอะ (กะเพรา ตะไคร้ ข่า โหระพา พริกขี้หนูสวน) ซึ่ง turbo ที่ตัดขนาดลง
 * มาเพื่อความเร็วมักเพี้ยนกว่า — ที่นี่ผู้ใช้พูดทีละประโยคสั้นๆ ช้ากว่ากันไม่ถึงวินาที
 * แต่ถอดผิดคำเดียวคำถามเปลี่ยนความหมายทั้งประโยค
 *
 * ⚠️ Groq ถอดโมเดลออกโดยไม่แจ้งล่วงหน้ามาแล้ว 2 ครั้งกับโปรเจกต์นี้ (ดู lib/groq.ts)
 * ถ้าเจอ error `model_not_found` ให้ดูรายชื่อที่ยังใช้ได้แล้วเปลี่ยนตรงนี้ที่เดียว
 */
export const TRANSCRIBE_MODEL = 'whisper-large-v3';

/**
 * เพดานขนาดไฟล์เสียงที่ยอมรับเข้ามา
 *
 * ตั้งไว้ที่ 4MB ตามเพดาน request body ของ Vercel (4.5MB) ไม่ใช่ตามเพดานของ Groq เอง
 * ที่รับได้ถึง 25MB — เพราะบนโปรดักชันคำขอที่ใหญ่กว่านั้นถูกปัดตกก่อนถึง route นี้
 * ตั้งเลขตาม Groq จะได้ error คนละแบบระหว่างเครื่องตัวเองกับของจริงที่ deploy แล้ว
 *
 * ในทางปฏิบัติไม่มีทางชน: คำถามข้างเตา 25 วินาทีที่อัดเป็น opus หนักไม่ถึง 100KB
 * ตัวเลขนี้จึงเป็นแค่กันเหนียวกรณีเบราว์เซอร์แปลกๆ ที่อัดเป็น PCM ดิบ
 */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * นามสกุลไฟล์ที่ Groq ใช้เดาชนิดเสียง — ต้องตั้งให้ตรง ไม่งั้นโดนปฏิเสธทั้งคลิป
 *
 * จำเป็นเพราะ MediaRecorder แต่ละเบราว์เซอร์อัดออกมาคนละชนิด:
 * Chrome/Firefox ได้ `audio/webm;codecs=opus` ส่วน Safari บน iOS ได้ `audio/mp4`
 * ซึ่งเป็นเบราว์เซอร์ที่คนใช้ยืนทำอาหารเยอะที่สุด จะปล่อยให้พังไม่ได้
 */
export function audioExtensionFor(mimeType: string): string {
  const type = mimeType.split(';')[0].trim().toLowerCase();
  switch (type) {
    case 'audio/webm':
    case 'video/webm':
      return 'webm';
    case 'audio/mp4':
    case 'video/mp4':
    case 'audio/x-m4a':
      return 'm4a';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/wav':
    case 'audio/wave':
    case 'audio/x-wav':
      return 'wav';
    case 'audio/flac':
      return 'flac';
    default:
      // เดาเป็น webm ไว้ก่อน — เป็นชนิดที่เบราว์เซอร์ส่วนใหญ่อัดออกมา
      // และ Groq รับอยู่แล้ว ดีกว่าปฏิเสธทั้งคลิปเพราะชื่อชนิดแปลกไปนิดเดียว
      return 'webm';
  }
}

/**
 * เตรียมข้อความก่อนให้เครื่องอ่านออกเสียง
 *
 * `/api/chat` กรอง Markdown ออกให้แล้ว (ดู stripMarkdown ที่นั่น) แต่ยังเหลือของที่
 * "อ่านบนจอแล้วเข้าใจ แต่ฟังแล้วสะดุด" อีกชุด — อีโมจิที่ถูกอ่านเป็นชื่อเต็มของมัน,
 * เลขข้อขึ้นต้นบรรทัดที่กลายเป็นเสียงพึมพำ, และบรรทัดว่างที่ทำให้เสียงขาดหายเป็นช่วง
 */
export function toSpeakableText(text: string): string {
  return text
    // อีโมจิ/สัญลักษณ์ — เครื่องอ่านไทยอ่านออกมาเป็นชื่อยาวๆ กลางประโยค
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    // "1." "2)" ขึ้นต้นบรรทัด — บนจอคือหัวข้อ แต่ฟังแล้วเป็นตัวเลขลอยไม่มีที่มา
    .replace(/^\s*\d+[.)]\s*/gm, '')
    // ยุบบรรทัดว่างซ้อน แล้วต่อบรรทัดด้วยการเว้นวรรคให้เสียงลื่นเป็นประโยคเดียว
    .replace(/\n{2,}/g, '\n')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * ตัดข้อความยาวเป็นท่อนสั้นก่อนส่งเข้า speechSynthesis
 *
 * ไม่ใช่เรื่องความสวยงาม แต่เป็นการเลี่ยงบั๊กจริงของ Chrome: utterance ที่ยาวเกิน
 * ประมาณ 15 วินาทีจะถูกตัดจบกลางคันเงียบๆ โดยไม่มี error ให้จับ — คนยืนหน้าเตา
 * จะได้ยินคำแนะนำหายไปครึ่งประโยคแล้วไม่รู้ว่าตัวเองพลาดอะไรไป
 *
 * ตัดที่ท้ายประโยคก่อน ถ้าท่อนไหนยังยาวเกินค่อยตัดที่ช่องว่าง — ไม่ตัดกลางคำ
 * เพราะเสียงจะสะดุดจนฟังไม่ออกว่าเป็นคำอะไร
 */
export function chunkForSpeech(text: string, maxChars = 180): string[] {
  const clean = toSpeakableText(text);
  if (!clean) return [];

  const sentences = clean.split(/(?<=[.!?。！？])\s+|(?<=ครับ|ค่ะ|นะคะ|นะครับ)\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current && (current + ' ' + sentence).length > maxChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);

  // ประโยคเดียวที่ยาวเกินเพดานเอง (ภาษาไทยไม่มีจุดจบประโยค เจอบ่อย) — ตัดที่ช่องว่าง
  return chunks.flatMap(chunk => {
    if (chunk.length <= maxChars) return [chunk];
    const parts: string[] = [];
    let buffer = '';
    for (const word of chunk.split(' ')) {
      if (buffer && (buffer + ' ' + word).length > maxChars) {
        parts.push(buffer);
        buffer = word;
      } else {
        buffer = buffer ? `${buffer} ${word}` : word;
      }
    }
    if (buffer) parts.push(buffer);
    return parts;
  });
}
