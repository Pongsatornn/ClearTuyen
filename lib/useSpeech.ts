'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { chunkForSpeech } from './voice';

/**
 * อ่านคำตอบของเชฟออกเสียงด้วย `speechSynthesis` ของเบราว์เซอร์
 *
 * ทำไมไม่ยิง TTS จากคลาวด์ทั้งที่ฝั่งฟังเสียง (Whisper) เราเลือกทางคลาวด์:
 * ทดสอบกับคีย์ที่โปรเจกต์นี้มีอยู่จริงแล้วทั้งสองเจ้าไปต่อไม่ได้ —
 *   - Groq: มีแต่เสียงอังกฤษกับอาหรับ (`orpheus-*`) ไม่มีไทย
 *   - Gemini: มีเสียงไทย แต่ tier ฟรีจำกัด 3 ครั้ง/นาที (คุยจริงชนเพดานตั้งแต่คำถามที่สี่)
 *     และปฏิเสธประโยคไทยธรรมดาแบบสุ่มด้วย `finishReason: OTHER` บ่อยเกินจะพึ่งได้
 *
 * `speechSynthesis` จึงชนะขาดในบริบทนี้: ไม่มีโควตา ไม่มีค่าใช้จ่าย ไม่ต้องรอเน็ต
 * และพูดได้ทันทีที่คำตอบมาถึง แลกกับเสียงที่หุ่นยนต์กว่า
 *
 * ⚠️ เสียงไทยไม่ได้มีทุกเครื่อง — Android/iOS/macOS มีมาให้ แต่ Windows หลายเครื่อง
 * มีแค่เสียงอังกฤษ (เครื่องที่ใช้พัฒนาโปรเจกต์นี้ก็เป็นแบบนั้น) ถ้าให้เสียงอังกฤษ
 * อ่านข้อความไทยจะได้เสียงอ่านทีละตัวอักษรที่ฟังไม่รู้เรื่องเลย เลวร้ายกว่าเงียบ
 * hook นี้จึงคืน `hasThaiVoice` ออกไปให้ UI ซ่อนปุ่มลำโพงไปเลยเมื่อเครื่องนั้นอ่านไทยไม่ได้
 */
export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [thaiVoice, setThaiVoice] = useState<SpeechSynthesisVoice | null>(null);

  // ลำดับคิวปัจจุบัน — ต้องถืออยู่นอก state เพราะ callback ของ utterance
  // ยิงกลับมาแบบ async หลัง component rerender ไปแล้วหลายรอบ
  const queueRef = useRef<string[]>([]);
  const onDoneRef = useRef<(() => void) | null>(null);
  // นับรอบการพูด — ใช้ทิ้ง callback ของรอบเก่าที่ถูกสั่งหยุดกลางคัน
  // ไม่งั้น onDone ของคำตอบที่ผู้ใช้เพิ่งกดปิด จะไปสั่งเปิดไมค์รอบใหม่ให้เองแบบงงๆ
  const runIdRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    function pickThaiVoice() {
      const voices = window.speechSynthesis.getVoices();
      const thai = voices.filter(v => v.lang.toLowerCase().startsWith('th'));
      if (!thai.length) {
        setThaiVoice(null);
        return;
      }
      // เสียงที่ติดมากับเครื่อง (localService) พูดได้แม้เน็ตหลุด ซึ่งเกิดได้จริงในครัว
      // ที่สัญญาณไม่ดี — เลือกก่อนเสมอ ที่เหลือค่อยเอาตัวแรกที่เจอ
      setThaiVoice(thai.find(v => v.localService) ?? thai[0]);
    }

    // รายชื่อเสียงโหลดแบบ async — เรียกครั้งแรกมักได้ array ว่าง ต้องรอ event ด้วย
    pickThaiVoice();
    window.speechSynthesis.addEventListener('voiceschanged', pickThaiVoice);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pickThaiVoice);
  }, []);

  const stop = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    runIdRef.current++;
    queueRef.current = [];
    onDoneRef.current = null;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  /**
   * อ่านข้อความออกเสียง แล้วเรียก `onDone` เมื่อพูดจบจริงๆ
   *
   * `onDone` คือสิ่งที่ทำให้โหมดคุยต่อเนื่องเป็นไปได้ — ต้องรู้ให้แน่ว่าลำโพงเงียบแล้ว
   * ก่อนจะเปิดไมค์รอบถัดไป ไม่งั้นไมค์จะได้ยินเสียงเชฟเองแล้วถอดเป็นคำถามใหม่วนไม่จบ
   */
  const speak = useCallback(
    (text: string, onDone?: () => void) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        onDone?.();
        return;
      }
      const voice = thaiVoice;
      if (!voice) {
        // ไม่มีเสียงไทย = ไม่พูด แต่ต้องเรียก onDone ต่อ ไม่งั้นโหมดคุยต่อเนื่องจะค้าง
        // รอเสียงที่ไม่มีวันมา แล้วผู้ใช้จะเจอปุ่มไมค์ที่กดไม่ได้อีกเลย
        onDone?.();
        return;
      }

      const chunks = chunkForSpeech(text);
      if (!chunks.length) {
        onDone?.();
        return;
      }

      window.speechSynthesis.cancel();
      const runId = ++runIdRef.current;
      queueRef.current = chunks;
      onDoneRef.current = onDone ?? null;
      setIsSpeaking(true);

      // รับเสียงมาเป็นพารามิเตอร์ ไม่ใช่หยิบจาก closure — TypeScript ไม่ยอมให้ผลการเช็ค
      // null ด้านบนตกทอดเข้ามาในฟังก์ชันที่ประกาศซ้อนอยู่ข้างใน
      function speakNext(voice: SpeechSynthesisVoice) {
        // รอบนี้ถูกยกเลิกไปแล้ว (ผู้ใช้กดหยุด หรือสั่งพูดข้อความใหม่ทับ) — เลิกทั้งสาย
        if (runId !== runIdRef.current) return;

        const next = queueRef.current.shift();
        if (next === undefined) {
          setIsSpeaking(false);
          const done = onDoneRef.current;
          onDoneRef.current = null;
          done?.();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(next);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        // ช้ากว่าปกตินิดเดียว — คนฟังกำลังถือตะหลิวและมือไม่ว่างมากดฟังซ้ำ
        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.onend = () => speakNext(voice);
        // พูดท่อนนี้ไม่ได้ก็ข้ามไปท่อนต่อไป ดีกว่าค้างทั้งคำตอบเพราะสะดุดท่อนเดียว
        utterance.onerror = () => speakNext(voice);
        window.speechSynthesis.speak(utterance);
      }

      speakNext(voice);
    },
    [thaiVoice]
  );

  // Chrome หยุดอ่านเองเงียบๆ เมื่อพูดต่อเนื่องเกินประมาณ 15 วินาที (บั๊กเก่าที่ยังไม่แก้)
  // การเรียก resume() เป็นระยะคือวิธีกันมาตรฐาน และไม่มีผลข้างเคียงตอนที่ไม่ได้ค้างอยู่
  useEffect(() => {
    if (!isSpeaking) return;
    const timer = setInterval(() => window.speechSynthesis.resume(), 5000);
    return () => clearInterval(timer);
  }, [isSpeaking]);

  // ออกจากหน้าไปทั้งที่ยังอ่านค้างอยู่ — speechSynthesis เป็นของระดับ window
  // ถ้าไม่สั่งหยุด เสียงจะพูดต่อไปเรื่อยๆ แม้ผู้ใช้ปิดโหมดทำอาหารไปแล้ว
  useEffect(() => stop, [stop]);

  // ไม่มี `isSupported` แยกออกมา เพราะทุกที่ที่เรียกใช้สนใจคำถามเดียวคือ "อ่านไทยได้ไหม"
  // เบราว์เซอร์ที่มี speechSynthesis แต่ไม่มีเสียงไทย มีค่าเท่ากับไม่รองรับสำหรับแอปนี้
  return { speak, stop, isSpeaking, hasThaiVoice: thaiVoice !== null };
}
