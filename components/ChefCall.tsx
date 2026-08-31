'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChefHat, Mic, PhoneOff, Zap } from 'lucide-react';
import type { ChatMessage, ChefContext } from '@/lib/types';
import { askChef } from '@/lib/askChef';
import { useVoiceCall } from '@/lib/useVoiceCall';
import { useSpeech } from '@/lib/useSpeech';
import { useWakeLock } from '@/lib/useWakeLock';

interface ChefCallProps {
  context: ChefContext;
  // บทสนทนาชุดเดียวกับกล่องแชท — วางสายแล้วทุกอย่างที่คุยกันต้องยังอยู่ให้อ่านย้อนได้
  // ไม่ใช่หายไปพร้อมสาย (บทเรียนเดียวกับที่ทำให้ chatMessages ถูกยกไปเก็บที่ page.tsx)
  messages: ChatMessage[];
  onMessagesChange: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  onClose: () => void;
}

/** จับเวลาสายแบบ mm:ss เหมือนหน้าโทรศัพท์ — บอกว่าสายยังต่ออยู่จริงแม้ตอนที่เงียบทั้งสองฝั่ง */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * โหมด "พูดคุยกับเชฟ AI" — เต็มจอ เปิดค้างไว้ได้ยาวๆ เหมือนโทรคุยกันจริง
 *
 * ต่างจากปุ่มไมค์ในกล่องแชทตรงที่ **ไม่มีจังหวะไหนเลยที่ผู้ใช้ต้องแตะจอซ้ำ** ระหว่างสาย
 * ฟัง → ถอด → ตอบ → กลับไปฟัง วนเองจนกว่าจะกดวางสาย รวมถึงตอนที่ถอดเสียงไม่สำเร็จ
 * หรือผู้ใช้เงียบไปหลายนาที (ดูกฎทั้งหมดใน `lib/useVoiceCall.ts`)
 *
 * ใช้พื้นหลังเข้มต่างจากทั้งแอปโดยตั้งใจ — เป็นสัญญาณว่าตอนนี้อยู่คนละโหมด ไมค์เปิดอยู่
 * และมองเห็นสถานะได้จากอีกฝั่งครัวโดยไม่ต้องเดินมาอ่านตัวหนังสือเล็กๆ
 */
export default function ChefCall({ context, messages, onMessagesChange, onClose }: ChefCallProps) {
  const speech = useSpeech();
  const [replyText, setReplyText] = useState('');
  // แยกจาก phase ของ useVoiceCall เพราะช่วง 'working' ของ hook ครอบสองอย่างที่ผู้ใช้
  // ต้องแยกออกจากกันให้ได้: เชฟกำลังคิด (รอได้) กับเชฟกำลังพูด (แตะเพื่อพูดแทรกได้)
  const [isSpeakingReply, setIsSpeakingReply] = useState(false);
  const [seconds, setSeconds] = useState(0);

  // จอต้องไม่ดับตลอดสาย — เหตุผลเดียวกับโหมดทำอาหาร แต่จำเป็นกว่าเพราะที่นี่ผู้ใช้
  // อาจไม่แตะจอเลยตลอดสิบนาที ระบบจะถือว่าไม่มีคนใช้งานแล้วดับจอทิ้ง
  useWakeLock(true);

  // อ่านค่าล่าสุดจาก ref เพราะ onUtterance ถูกเรียกจากใน loop ที่ค้างอยู่ข้ามหลาย render
  const messagesRef = useRef(messages);
  const contextRef = useRef(context);
  useEffect(() => {
    messagesRef.current = messages;
    contextRef.current = context;
  });

  /**
   * ตัวปิดจ๊อบของการพูดรอบปัจจุบัน
   *
   * ต้องเก็บไว้เพราะมีสองทางที่ทำให้ "พูดจบ" นอกจากพูดจนจบเอง: ผู้ใช้กดพูดแทรก
   * กับผู้ใช้กดวางสาย ทั้งสองทางสั่ง `speech.stop()` ซึ่งทิ้ง callback ของรอบนั้นไปเลย
   * ถ้าไม่มีตัวนี้คอยปลดล็อกให้ วงจรของสายจะค้างรอเสียงที่ไม่มีวันจบตลอดไป
   */
  const finishSpeakingRef = useRef<(() => void) | null>(null);

  const releaseSpeaking = useCallback(() => {
    const finish = finishSpeakingRef.current;
    finishSpeakingRef.current = null;
    setIsSpeakingReply(false);
    finish?.();
  }, []);

  const handleUtterance = useCallback(
    async (text: string) => {
      const withUser: ChatMessage[] = [...messagesRef.current, { role: 'user', content: text }];
      onMessagesChange(() => withUser);
      setReplyText('');

      const reply = await askChef(contextRef.current, withUser, true);
      onMessagesChange(prev => [...prev, { role: 'assistant', content: reply }]);
      setReplyText(reply);

      // ไม่มีเสียงไทยในเครื่องนี้ = ไม่ต้องรออะไร ให้กลับไปฟังประโยคถัดไปเลย
      // ผู้ใช้อ่านคำตอบจากซับไตเติลกลางจอแทน (มีแบนเนอร์บอกไว้แล้วว่าเชฟจะไม่พูด)
      if (!speech.hasThaiVoice) return;

      setIsSpeakingReply(true);
      await new Promise<void>(resolve => {
        finishSpeakingRef.current = resolve;
        speech.speak(reply, () => releaseSpeaking());
      });
    },
    [onMessagesChange, releaseSpeaking, speech]
  );

  const call = useVoiceCall({
    onUtterance: handleUtterance,
    getBiasContext: () => ({
      recipeName: contextRef.current.recipeName,
      terms: [...contextRef.current.ingredients, ...(contextRef.current.recipeIngredients ?? [])],
    }),
  });

  const { startCall, endCall, phase } = call;

  // รับสายทันทีที่เปิดหน้านี้ — ผู้ใช้กดปุ่ม "พูดคุยกับเชฟ" มาแล้วหนึ่งครั้ง
  // การให้กด "รับสาย" ซ้ำอีกทีคือการกดสองครั้งเพื่อทำสิ่งเดียว
  useEffect(() => {
    void startCall();
  }, [startCall]);

  useEffect(() => {
    if (phase === 'idle' || phase === 'ended') return;
    const timer = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  /** วางสาย — ต้องปลดล็อกการพูดที่ค้างอยู่ด้วย ไม่งั้น loop จะไม่มีวันออกจาก await */
  const hangUp = useCallback(() => {
    speech.stop();
    releaseSpeaking();
    endCall();
    onClose();
  }, [endCall, onClose, releaseSpeaking, speech]);

  /** พูดแทรก — หยุดเชฟกลางประโยคแล้วกลับไปฟังทันที เป็นการแตะจอครั้งเดียวที่ยังจำเป็นอยู่ */
  const bargeIn = useCallback(() => {
    speech.stop();
    releaseSpeaking();
  }, [releaseSpeaking, speech]);

  // ปิดหน้านี้ด้วยปุ่ม back ของเครื่อง/ปุ่ม Esc ต้องวางสายให้เรียบร้อย ไม่ใช่แค่ซ่อนจอ
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') hangUp();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hangUp]);

  const statusText = call.error
    ? call.error
    : isSpeakingReply
      ? 'เชฟกำลังพูด...'
      : phase === 'connecting'
        ? 'กำลังเปิดไมโครโฟน...'
        : phase === 'listening'
          ? 'กำลังฟัง... พูดได้เลยครับ'
          : phase === 'transcribing'
            ? 'กำลังฟังให้ชัด...'
            : phase === 'working'
              ? 'เชฟกำลังคิด...'
              : phase === 'ended'
                ? 'วางสายแล้ว'
                : 'กำลังต่อสาย...';

  const isListening = phase === 'listening' && !isSpeakingReply;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-deep text-white">
      {/* หัวสาย — บอกว่ากำลังคุยเรื่องเมนูอะไรและต่อสายมานานแค่ไหน */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <ChefHat className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">พูดคุยกับเชฟ AI</p>
          <p className="truncate text-xs text-white/60">{context.recipeName}</p>
        </div>
        <span className="num shrink-0 text-xs text-white/60">{formatDuration(seconds)}</span>
      </div>

      {/* วงกลมกลางจอ — ขยายตามเสียงที่ไมค์ได้ยินจริง ไม่ใช่แค่ภาพเคลื่อนไหวหลอกตา
          เป็นวิธีเดียวที่ผู้ใช้จะรู้จากอีกฝั่งครัวว่าไมค์ได้ยินเขาอยู่ */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        <div className="relative flex h-36 w-36 items-center justify-center">
          {isListening && (
            <span
              className="absolute inset-0 rounded-full bg-basil/40"
              style={{
                transform: `scale(${1 + call.level * 0.9})`,
                transition: 'transform 80ms linear',
              }}
            />
          )}
          <span
            className={`absolute inset-0 rounded-full ${
              isSpeakingReply ? 'animate-pulse bg-yolk/30' : 'bg-white/5'
            }`}
          />
          <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-basil">
            {isSpeakingReply ? <Zap className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
          </span>
        </div>

        <p className={`text-center text-sm ${call.error ? 'text-yolk' : 'text-white/70'}`}>
          {statusText}
        </p>

        {/* ซับไตเติล — ประโยคล่าสุดของทั้งสองฝั่ง ให้เหลือบดูได้ว่ามันฟังเราถูกไหม
            ถ้าถอดผิดจะได้รู้ทันทีแล้วพูดแก้ ไม่ใช่มารู้ตอนคำตอบออกมาผิดเรื่อง */}
        <div className="w-full max-w-md space-y-3">
          {call.heardText && (
            <div className="rounded-2xl rounded-br-sm bg-white/10 px-4 py-3 text-sm leading-relaxed">
              <p className="mb-1 text-[11px] text-white/50">คุณพูดว่า</p>
              {call.heardText}
            </div>
          )}
          {replyText && (
            <div className="rounded-2xl rounded-bl-sm bg-basil/25 px-4 py-3 text-sm leading-relaxed">
              <p className="mb-1 text-[11px] text-white/50">เชฟตอบ</p>
              {replyText}
            </div>
          )}
        </div>
      </div>

      {/* เครื่องที่ไม่มีเสียงไทย ต้องบอกตั้งแต่ต้นสาย ไม่ใช่ปล่อยให้นั่งรอเสียงที่ไม่มีวันมา */}
      {!speech.hasThaiVoice && (
        <p className="px-6 pb-2 text-center text-xs text-white/50">
          เครื่องนี้ไม่มีเสียงอ่านภาษาไทย เชฟจะตอบเป็นข้อความบนจอแทนการพูด
        </p>
      )}

      <div className="flex items-center justify-center gap-4 px-6 pb-10 pt-4">
        <button
          onClick={bargeIn}
          disabled={!isSpeakingReply}
          className="flex h-14 items-center gap-2 rounded-full bg-white/10 px-6 text-sm transition-colors hover:bg-white/20 disabled:opacity-30"
        >
          <Mic className="h-4 w-4" />
          พูดแทรก
        </button>
        <button
          onClick={hangUp}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-chili text-white transition-transform active:scale-95"
          aria-label="วางสาย"
        >
          <PhoneOff className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
