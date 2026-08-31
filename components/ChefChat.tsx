'use client';

import { Loader2, Mic, Send, Square, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';
import { useVoiceInput } from '@/lib/useVoiceInput';
import { useSpeech } from '@/lib/useSpeech';

interface ChefChatProps {
  recipeName: string;
  recipeSteps: string[];
  ingredients: string[];
  // จำนวนคนกินที่ผู้ใช้ตั้งไว้ + ปริมาณวัตถุดิบที่ปรับตามจำนวนคนนั้นแล้ว
  // ถ้าไม่บอกเชฟ พอถูกถามว่า "ทำ 3 คนต้องเพิ่มเท่าไหร่" มันจะตอบวนว่า
  // "เพิ่มเป็น 3 เท่าของที่ใช้สำหรับ 1 คน" ทั้งที่ไม่เคยมีใครบอกว่า 1 คนใช้เท่าไหร่
  servings?: number;
  recipeIngredients?: string[];
  // ข้อจำกัดด้านอาหารที่ผู้ใช้ตั้งไว้ ต้องส่งไปด้วยทุกครั้งที่ถาม
  // ไม่งั้นเชฟจะแนะนำของแทนที่ผิดกฎ (เช่น บอกให้ใช้ซอสหอยนางรมแทนน้ำปลากับคนกินเจ)
  dietRestrictions?: string[];
  allergies?: string[];
  // ส่งมาเฉพาะตอนอยู่ในโหมดทำอาหาร เพื่อให้เชฟรู้ว่าผู้ใช้ทำถึงขั้นไหนแล้ว
  currentStep?: { number: number; total: number; text: string };
  // ให้หน้าที่เรียกใช้ปรับความสูงกล่องข้อความได้ (โหมดทำอาหารมีที่ให้แชทมากกว่าปกติ)
  className?: string;
  messagesClassName?: string;
  // บทสนทนาถูกยกไปเก็บที่ `app/page.tsx` — component นี้เป็นแบบ controlled เต็มตัว
  //
  // ที่ต้องยกออกไปเพราะ ChefChat ในหน้าสูตรกับใน CookingMode เป็นคนละ instance
  // ที่ mount คนละที ถ้าเก็บ state ไว้ในนี้ พอกด "เริ่มทำเมนูนี้" บทสนทนาจะหายทั้งชุด
  // ทั้งที่เป็นเมนูเดียวกัน (รอบรีวิว 30 ก.ค. ข้อ 11 — คำตอบที่ถามเตรียมไว้
  // หายไปตอนที่กำลังจะได้ใช้พอดี)
  messages: ChatMessage[];
  onMessagesChange: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
}

/** ปุ่มฟังซ้ำใต้คำตอบของเชฟ — แยกออกมาเพื่อไม่ให้ตรรกะ "ฟองไหนกำลังถูกอ่าน" ไปรกใน JSX ของลิสต์ */
function ReplayButton({ isReading, onClick }: { isReading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-1.5 flex items-center gap-1 text-xs text-ash hover:text-basil transition-colors"
      aria-label={isReading ? 'หยุดอ่านออกเสียง' : 'อ่านออกเสียง'}
    >
      <Volume2 className="w-3.5 h-3.5" />
      {isReading ? 'หยุด' : 'ฟัง'}
    </button>
  );
}

export default function ChefChat({
  recipeName,
  recipeSteps,
  ingredients,
  servings,
  recipeIngredients,
  dietRestrictions,
  allergies,
  currentStep,
  className,
  messagesClassName,
  messages,
  onMessagesChange,
}: ChefChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // ข้อความทักทายนับเป็น message ตั้งแต่ mount แล้ว effect ด้านล่างจึงทำงานตั้งแต่ render แรกด้วย
  // ผลคือหน้าสูตรที่เพิ่งเปิดถูกลากลงไปจอดที่กล่องแชทท้ายหน้าทันที ทั้งที่ผู้ใช้กดเข้ามาเพื่ออ่านสูตรจากหัว
  // เลยข้ามการเลื่อนรอบแรกทิ้ง แล้วเริ่มเลื่อนตามจริงตั้งแต่ข้อความที่ 2 เป็นต้นไป (ตอนมีคนคุยแล้วจริงๆ)
  const hasAutoScrolledRef = useRef(false);

  /**
   * โหมดคุยด้วยเสียง — เปิดค้างไว้แล้วผลัดกันพูดไปเรื่อยๆ โดยไม่ต้องแตะจออีกเลย
   *
   * เป็น "โหมด" ไม่ใช่ปุ่มกดพูดทีละครั้ง เพราะเหตุผลทั้งหมดของฟีเจอร์นี้คือมือเปื้อน
   * ถ้ายังต้องเอานิ้วไปแตะจอทุกคำถาม ก็ไม่ต่างจากพิมพ์เอาเท่าไหร่
   *
   * วงจรหนึ่งรอบ: ฟัง → ถอดเสียง → ถามเชฟ → อ่านคำตอบออกเสียง → กลับไปฟังต่อ
   * แต่ละสถานะห้ามเหลื่อมกันเด็ดขาด โดยเฉพาะ "อ่านคำตอบ" กับ "ฟัง" ที่ถ้าทับกันเมื่อไหร่
   * ไมค์จะได้ยินเสียงเชฟเองแล้วถอดเป็นคำถามใหม่ วนไม่จบจนกว่าแบตจะหมด
   */
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  // callback ของไมค์กับของลำโพงยิงกลับมาแบบ async หลัง state เปลี่ยนไปแล้ว
  // ต้องอ่านค่าล่าสุดจาก ref ไม่ใช่จากตัวแปรที่ถูก capture ไว้ตอน render นั้น
  const isVoiceModeRef = useRef(false);
  useEffect(() => {
    isVoiceModeRef.current = isVoiceMode;
  }, [isVoiceMode]);

  const speech = useSpeech();
  // ข้อความที่กำลังถูกอ่านอยู่ — ใช้ตัดสินว่าปุ่มของ "ฟองข้อความไหน" ควรเปลี่ยนเป็นปุ่มหยุด
  // ถ้าดูจาก speech.isSpeaking อย่างเดียว ทุกฟองในหน้าจะขึ้นว่า "หยุด" พร้อมกันหมด
  // ทั้งที่มีอันเดียวที่กำลังถูกอ่าน
  const [speakingText, setSpeakingText] = useState<string | null>(null);

  /** อ่านออกเสียงพร้อมจำไว้ว่ากำลังอ่านอันไหน — ทุกที่ที่สั่งพูดต้องผ่านตัวนี้ */
  const speakAloud = useCallback(
    (text: string, onDone?: () => void) => {
      setSpeakingText(text);
      speech.speak(text, () => {
        setSpeakingText(null);
        onDone?.();
      });
    },
    [speech]
  );

  const stopSpeaking = useCallback(() => {
    speech.stop();
    setSpeakingText(null);
  }, [speech]);

  // เครื่องที่ไม่มีเสียงไทยติดตั้งอยู่ (Windows หลายเครื่องเป็นแบบนี้) ยังพูดใส่ไมค์ได้ตามปกติ
  // แต่จะไม่มีใครอ่านคำตอบให้ฟัง — วงจร "ฟังต่อเองหลังพูดจบ" จึงใช้ไม่ได้ เพราะไม่มีจังหวะ
  // พูดจบให้รอ และผู้ใช้ต้องก้มมาอ่านคำตอบบนจอด้วยตาอยู่ดี เครื่องกลุ่มนี้จึงกลายเป็น
  // "พูดถามทีละครั้ง" โดยกดไมค์เองทุกรอบ ซึ่งยังเร็วกว่าพิมพ์ด้วยมือเปื้อนอยู่มาก
  const canConverse = speech.hasThaiVoice;

  const sendRef = useRef<(text: string, spoken: boolean) => void>(() => {});

  const voice = useVoiceInput({
    onTranscript: text => sendRef.current(text, true),
    // คำใบ้ให้ Whisper — ชื่อเมนูกับของในครัวชุดนี้คือคำที่ผู้ใช้กำลังจะพูดถึงแทบทั้งหมด
    // และเป็นคำที่ถอดผิดบ่อยที่สุดด้วย (ดูเหตุผลเต็มใน app/api/transcribe/route.ts)
    getBiasContext: () => ({
      recipeName,
      terms: [...ingredients, ...(recipeIngredients ?? [])],
    }),
  });

  useEffect(() => {
    if (!hasAutoScrolledRef.current) {
      hasAutoScrolledRef.current = true;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(
    async (text: string, spoken: boolean) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      const newMessages = [...messages, userMsg];
      onMessagesChange(() => newMessages);
      setInput('');
      setIsLoading(true);

      let reply = 'ขอโทษครับ เกิดข้อผิดพลาด';
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: newMessages,
            recipeName,
            recipeSteps,
            ingredients,
            servings,
            recipeIngredients,
            dietRestrictions,
            allergies,
            currentStep,
            // บอกฝั่ง route ว่าคำตอบนี้จะถูกอ่านออกเสียง ให้ตอบสั้นและเรียงประโยคแบบที่ฟังรู้เรื่อง
            voice: spoken,
          }),
        });
        const data = await res.json();
        reply = data.content ?? reply;
      } catch {
        // ปล่อยให้ reply เป็นข้อความ error ตั้งต้น
      } finally {
        onMessagesChange(prev => [...prev, { role: 'assistant', content: reply }]);
        setIsLoading(false);
      }

      // ถามด้วยเสียง = ตอบด้วยเสียง แล้วค่อยกลับไปเปิดไมค์รอบใหม่ "หลังพูดจบจริงๆ"
      // เท่านั้น การเปิดไมค์ก่อนลำโพงเงียบคือต้นเหตุของการวนฟังเสียงตัวเอง
      if (spoken && isVoiceModeRef.current && canConverse) {
        speakAloud(reply, () => {
          if (isVoiceModeRef.current) voice.start();
        });
      }
    },
    [
      isLoading,
      messages,
      onMessagesChange,
      recipeName,
      recipeSteps,
      ingredients,
      servings,
      recipeIngredients,
      dietRestrictions,
      allergies,
      currentStep,
      canConverse,
      speakAloud,
      voice,
    ]
  );

  useEffect(() => {
    sendRef.current = (text, spoken) => void send(text, spoken);
  }, [send]);

  /**
   * ปุ่มไมค์ทำหน้าที่ต่างกันตามสถานะที่กำลังเป็นอยู่ — ปุ่มเดียวคุมได้ทั้งวงจร
   *
   * รวมไว้ปุ่มเดียวเพราะปุ่มนี้ต้องกดโดนด้วยข้อนิ้วหรือสันมือขณะมือเปื้อน ยิ่งมีปุ่ม
   * ให้เล็งน้อยยิ่งดี ส่วนการ "ออกจากโหมดเสียง" แยกไปเป็นปุ่มข้อความในแถบสถานะ
   * เพราะเป็นสิ่งที่กดครั้งเดียวตอนจบ ไม่ใช่สิ่งที่กดระหว่างทำอาหาร
   */
  function handleMicButton() {
    voice.clearError();

    // กำลังฟังอยู่ = พูดจบแล้วแต่ไม่อยากรอให้มันตัดจบเอง ส่งเลย
    if (voice.status === 'listening') {
      voice.stop();
      return;
    }

    // เชฟกำลังพูด = ผู้ใช้อยากพูดแทรก หยุดอ่านแล้วเปิดไมค์รับต่อทันที
    // (speech.stop() ทิ้ง callback ของรอบที่ถูกตัด จึงไม่มีการเปิดไมค์ซ้อนอีกรอบ)
    if (speech.isSpeaking) {
      stopSpeaking();
      isVoiceModeRef.current = true;
      setIsVoiceMode(true);
      voice.start();
      return;
    }

    isVoiceModeRef.current = true;
    setIsVoiceMode(true);
    // ต้องเริ่มจากใน handler ของการแตะจอโดยตรง — iOS ไม่ยอมให้เปิดไมค์หรือเล่นเสียง
    // จากโค้ดที่ไม่ได้ต่อกับการกดของผู้ใช้ ถ้าไป start ใน useEffect จะเงียบสนิทบน iPhone
    voice.start();
  }

  /** ออกจากโหมดเสียง — ต้องหยุดทั้งไมค์และลำโพงพร้อมกัน ไม่ใช่หยุดอย่างใดอย่างหนึ่ง */
  function exitVoiceMode() {
    isVoiceModeRef.current = false;
    setIsVoiceMode(false);
    voice.cancel();
    stopSpeaking();
    voice.clearError();
  }

  // ข้อความบอกสถานะ ต้องมีทุกช่วงที่ผู้ใช้ "พูดไปแล้วแต่ยังไม่เห็นอะไรเกิดขึ้น"
  // ไม่งั้นจะเจอปัญหาเดียวกับปุ่มหัวใจในรีวิว 30 ก.ค. คือกดแล้วเงียบจนคิดว่าปุ่มเสีย
  const voiceStatusText =
    voice.status === 'listening'
      ? 'กำลังฟัง... พูดได้เลย'
      : voice.status === 'transcribing'
        ? 'กำลังถอดเสียง...'
        : isLoading
          ? 'เชฟกำลังคิด...'
          : speech.isSpeaking
            ? 'เชฟกำลังพูด... แตะไมค์เพื่อพูดแทรก'
            : isVoiceMode
              ? 'แตะไมค์เพื่อพูดอีกครั้ง'
              : null;

  // ระหว่างถอดเสียงหรือรอเชฟตอบ การกดไมค์ซ้ำจะทำให้มีคำถามซ้อนกันสองชุด
  const isBusy = isLoading || voice.status === 'transcribing';

  return (
    <div className={`border rounded-xl overflow-hidden bg-background ${className ?? ''}`}>
      <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-background">
        <span className="w-2 h-2 rounded-full bg-basil animate-pulse" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">ถาม-ตอบกับเชฟ AI</p>
          <p className="text-xs text-muted-foreground truncate">
            {isVoiceMode ? 'โหมดเสียง — คุยได้เลยโดยไม่ต้องแตะจอ' : 'เช่น "ถ้าไม่มีน้ำปลาใช้อะไรแทน?"'}
          </p>
        </div>
      </div>

      <div className={`flex flex-col gap-3 p-4 overflow-y-auto ${messagesClassName ?? 'max-h-64'}`}>
        {messages.map((m, i) => (
          <div
            key={i}
            className={`group max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-basil text-white self-end rounded-br-sm'
                : 'bg-muted self-start rounded-bl-sm'
            }`}
          >
            {m.content}
            {/* ปุ่มฟังซ้ำต่อคำตอบ — มีประโยชน์แม้ไม่ได้อยู่ในโหมดเสียง เพราะคำตอบมักมาถึง
                ตอนมือกำลังยุ่งพอดี ซ่อนไปเลยถ้าเครื่องนี้ไม่มีเสียงไทย จะได้ไม่มีปุ่มที่กดแล้วเงียบ */}
            {m.role === 'assistant' && canConverse && (
              <ReplayButton
                isReading={speech.isSpeaking && speakingText === m.content}
                onClick={() =>
                  speech.isSpeaking && speakingText === m.content
                    ? stopSpeaking()
                    : speakAloud(m.content)
                }
              />
            )}
          </div>
        ))}
        {isLoading && (
          <div className="max-w-[80%] bg-muted rounded-xl rounded-bl-sm px-3.5 py-2.5 self-start">
            <span className="flex gap-1">
              {[0, 150, 300].map(d => (
                <span
                  key={d}
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* แถบสถานะ/ข้อผิดพลาดของเสียง — อยู่เหนือแถวปุ่มเพื่อให้เห็นพร้อมกับปุ่มที่เพิ่งกด */}
      {(voice.error || (isVoiceMode && voiceStatusText)) && (
        <div
          className={`flex items-center gap-3 px-4 py-2 text-xs border-t ${
            voice.error ? 'bg-chili/10 text-chili' : 'bg-basil-soft text-basil'
          }`}
        >
          <span className="flex-1">{voice.error ?? voiceStatusText}</span>
          {isVoiceMode && (
            <button onClick={exitVoiceMode} className="shrink-0 underline underline-offset-2">
              ปิดโหมดเสียง
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 p-3 border-t">
        {/* ปุ่มโหมดเสียง — ปุ่มหลักของฟีเจอร์นี้ วงแหวนรอบปุ่มขยายตามความดังที่ไมค์ได้ยินจริง
            เพื่อให้เห็นด้วยตาว่ามันได้ยินเราอยู่ ไม่ใช่แค่ไอคอนที่เปลี่ยนสีเฉยๆ */}
        <button
          onClick={handleMicButton}
          disabled={isBusy}
          className={`relative w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${
            voice.status === 'listening'
              ? 'bg-chili text-white'
              : isVoiceMode
                ? 'bg-basil text-white'
                : 'bg-basil-soft text-basil hover:bg-basil hover:text-white'
          }`}
          aria-label={
            voice.status === 'listening'
              ? 'พูดจบแล้ว ส่งคำถาม'
              : speech.isSpeaking
                ? 'พูดแทรกเชฟ'
                : 'คุยกับเชฟด้วยเสียง'
          }
          aria-pressed={isVoiceMode}
        >
          {voice.status === 'listening' && (
            <span
              className="absolute inset-0 rounded-full bg-chili/30 -z-10"
              style={{ transform: `scale(${1 + voice.level * 0.8})`, transition: 'transform 80ms linear' }}
            />
          )}
          {voice.status === 'transcribing' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : voice.status === 'listening' ? (
            <Square className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>

        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              send(input, false);
            }
          }}
          placeholder={isVoiceMode ? 'หรือพิมพ์ถามก็ได้...' : 'พิมพ์คำถาม...'}
          className="flex-1 min-w-0 h-9 rounded-full border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-basil/30 focus:border-basil"
        />
        <button
          onClick={() => send(input, false)}
          disabled={!input.trim() || isLoading}
          className="w-9 h-9 shrink-0 rounded-full bg-basil text-white flex items-center justify-center hover:bg-basil disabled:opacity-40 transition-colors"
          aria-label="ส่ง"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* เครื่องที่ไม่มีเสียงไทย: บอกไปตรงๆ ว่าพูดถามได้แต่ต้องอ่านคำตอบเอง
          ดีกว่าปล่อยให้กดแล้วสงสัยว่าทำไมเชฟไม่ยอมพูดตอบ */}
      {isVoiceMode && !canConverse && (
        <p className="px-4 pb-3 -mt-1 text-xs text-ash">
          เครื่องนี้ยังไม่มีเสียงอ่านภาษาไทย พูดถามได้ตามปกติ แต่คำตอบต้องอ่านบนจอเองนะครับ
        </p>
      )}
    </div>
  );
}
