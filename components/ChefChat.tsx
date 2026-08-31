'use client';

import { Loader2, Mic, Phone, Send, Square, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, ChefContext } from '@/lib/types';
import { askChef } from '@/lib/askChef';
import { useVoiceInput } from '@/lib/useVoiceInput';
import { useSpeech } from '@/lib/useSpeech';
import ChefCall from './ChefCall';

/**
 * บริบทครัวทั้งชุด (`ChefContext`) + ของที่เป็นเรื่องหน้าตาและ state ของกล่องแชทเอง
 *
 * ที่ต้อง extends ไม่ใช่ประกาศซ้ำ เพราะ `ChefCall` กับ `askChef` รับบริบทก้อนเดียวกันนี้
 * ถ้าแยกกันเขียน วันที่เพิ่มบริบทใหม่จะได้เชฟที่รู้เรื่องไม่เท่ากันคนละหน้าจอ
 */
interface ChefChatProps extends ChefContext {
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
      className="mt-1.5 flex items-center gap-1 text-xs text-ash transition-colors hover:text-basil"
      aria-label={isReading ? 'หยุดอ่านออกเสียง' : 'อ่านออกเสียง'}
    >
      <Volume2 className="h-3.5 w-3.5" />
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
  const [isCallOpen, setIsCallOpen] = useState(false);
  // ข้อความทักทายนับเป็น message ตั้งแต่ mount แล้ว effect ด้านล่างจึงทำงานตั้งแต่ render แรกด้วย
  // ผลคือหน้าสูตรที่เพิ่งเปิดถูกลากลงไปจอดที่กล่องแชทท้ายหน้าทันที ทั้งที่ผู้ใช้กดเข้ามาเพื่ออ่านสูตรจากหัว
  // เลยข้ามการเลื่อนรอบแรกทิ้ง แล้วเริ่มเลื่อนตามจริงตั้งแต่ข้อความที่ 2 เป็นต้นไป (ตอนมีคนคุยแล้วจริงๆ)
  const hasAutoScrolledRef = useRef(false);

  const context = useMemo<ChefContext>(
    () => ({
      recipeName,
      recipeSteps,
      ingredients,
      servings,
      recipeIngredients,
      dietRestrictions,
      allergies,
      currentStep,
    }),
    [recipeName, recipeSteps, ingredients, servings, recipeIngredients, dietRestrictions, allergies, currentStep]
  );

  const speech = useSpeech();
  // ข้อความที่กำลังถูกอ่านอยู่ — ใช้ตัดสินว่าปุ่มของ "ฟองข้อความไหน" ควรเปลี่ยนเป็นปุ่มหยุด
  // ถ้าดูจาก speech.isSpeaking อย่างเดียว ทุกฟองในหน้าจะขึ้นว่า "หยุด" พร้อมกันหมด
  const [speakingText, setSpeakingText] = useState<string | null>(null);

  const speakAloud = useCallback(
    (text: string) => {
      setSpeakingText(text);
      speech.speak(text, () => setSpeakingText(null));
    },
    [speech]
  );

  const stopSpeaking = useCallback(() => {
    speech.stop();
    setSpeakingText(null);
  }, [speech]);

  // เครื่องที่ไม่มีเสียงไทยติดตั้งอยู่ (Windows หลายเครื่องเป็นแบบนี้) ยังพูดใส่ไมค์ได้ตามปกติ
  // แต่จะไม่มีใครอ่านคำตอบให้ฟัง — ซ่อนปุ่มลำโพงไปเลยจะได้ไม่มีปุ่มที่กดแล้วเงียบ
  const canSpeak = speech.hasThaiVoice;

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

      const withUser: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
      onMessagesChange(() => withUser);
      setInput('');
      setIsLoading(true);

      const reply = await askChef(context, withUser, spoken);
      onMessagesChange(prev => [...prev, { role: 'assistant', content: reply }]);
      setIsLoading(false);

      // ถามด้วยเสียงก็ตอบด้วยเสียง แล้วจบรอบ — **ไม่วนกลับไปเปิดไมค์ต่อเอง**
      // การคุยต่อเนื่องเป็นหน้าที่ของโหมดโทรคุย (`ChefCall`) ที่ทำมาเพื่อเรื่องนี้โดยเฉพาะ
      // ปุ่มไมค์ตรงนี้มีไว้สำหรับ "ถามแทรกหนึ่งคำถามโดยไม่ต้องพิมพ์" เท่านั้น
      if (spoken && canSpeak) speakAloud(reply);
    },
    [isLoading, messages, onMessagesChange, context, canSpeak, speakAloud]
  );

  useEffect(() => {
    sendRef.current = (text, spoken) => void send(text, spoken);
  }, [send]);

  /** ปุ่มไมค์ในกล่องแชท: ถามหนึ่งคำถามด้วยเสียง ไม่ใช่เปิดโหมดคุยต่อเนื่อง */
  function handleMicButton() {
    voice.clearError();
    if (voice.status === 'listening') {
      // พูดจบแล้วแต่ไม่อยากรอให้มันตัดจบเอง — ส่งเลย
      voice.stop();
      return;
    }
    if (speech.isSpeaking) {
      stopSpeaking();
      return;
    }
    voice.start();
  }

  /** เปิดสายคุยกับเชฟ — ต้องปลดล็อกลำโพงจากในการแตะครั้งนี้ ไม่งั้น iPhone จะเงียบทั้งสาย */
  function openCall() {
    voice.cancel();
    stopSpeaking();
    speech.unlock();
    setIsCallOpen(true);
  }

  // ข้อความบอกสถานะ ต้องมีทุกช่วงที่ผู้ใช้ "พูดไปแล้วแต่ยังไม่เห็นอะไรเกิดขึ้น"
  // ไม่งั้นจะเจอปัญหาเดียวกับปุ่มหัวใจในรีวิว 30 ก.ค. คือกดแล้วเงียบจนคิดว่าปุ่มเสีย
  const voiceStatusText =
    voice.status === 'listening'
      ? 'กำลังฟัง... พูดได้เลย'
      : voice.status === 'transcribing'
        ? 'กำลังถอดเสียง...'
        : null;

  // ระหว่างถอดเสียงหรือรอเชฟตอบ การกดไมค์ซ้ำจะทำให้มีคำถามซ้อนกันสองชุด
  const isBusy = isLoading || voice.status === 'transcribing';

  return (
    <>
      {isCallOpen && (
        <ChefCall
          context={context}
          messages={messages}
          onMessagesChange={onMessagesChange}
          onClose={() => setIsCallOpen(false)}
        />
      )}

      <div className={`overflow-hidden rounded-xl border bg-background ${className ?? ''}`}>
        <div className="flex items-center gap-2.5 border-b bg-background px-4 py-3">
          <span className="h-2 w-2 rounded-full bg-basil animate-pulse" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">ถาม-ตอบกับเชฟ AI</p>
            <p className="truncate text-xs text-muted-foreground">
              เช่น &ldquo;ถ้าไม่มีน้ำปลาใช้อะไรแทน?&rdquo;
            </p>
          </div>
          {/* ทางเข้าโหมดโทรคุย — อยู่บนหัวกล่องไม่ใช่ในแถวปุ่มล่าง เพราะเป็นการ
              "ย้ายไปอีกโหมด" ไม่ใช่การกระทำกับข้อความที่กำลังพิมพ์อยู่ */}
          <button
            onClick={openCall}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-basil px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-deep"
          >
            <Phone className="h-3.5 w-3.5" />
            พูดคุย
          </button>
        </div>

        <div className={`flex flex-col gap-3 overflow-y-auto p-4 ${messagesClassName ?? 'max-h-64'}`}>
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'self-end rounded-br-sm bg-basil text-white'
                  : 'self-start rounded-bl-sm bg-muted'
              }`}
            >
              {m.content}
              {m.role === 'assistant' && canSpeak && (
                <ReplayButton
                  isReading={speech.isSpeaking && speakingText === m.content}
                  onClick={() =>
                    speech.isSpeaking && speakingText === m.content ? stopSpeaking() : speakAloud(m.content)
                  }
                />
              )}
            </div>
          ))}
          {isLoading && (
            <div className="max-w-[80%] self-start rounded-xl rounded-bl-sm bg-muted px-3.5 py-2.5">
              <span className="flex gap-1">
                {[0, 150, 300].map(d => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {(voice.error || voiceStatusText) && (
          <div
            className={`border-t px-4 py-2 text-xs ${
              voice.error ? 'bg-chili/10 text-chili' : 'bg-basil-soft text-basil'
            }`}
          >
            {voice.error ?? voiceStatusText}
          </div>
        )}

        <div className="flex items-center gap-2 border-t p-3">
          {/* วงแหวนรอบปุ่มขยายตามความดังที่ไมค์ได้ยินจริง เพื่อให้เห็นด้วยตาว่ามันได้ยินเราอยู่ */}
          <button
            onClick={handleMicButton}
            disabled={isBusy}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
              voice.status === 'listening'
                ? 'bg-chili text-white'
                : 'bg-basil-soft text-basil hover:bg-basil hover:text-white'
            }`}
            aria-label={voice.status === 'listening' ? 'พูดจบแล้ว ส่งคำถาม' : 'ถามด้วยเสียง'}
          >
            {voice.status === 'listening' && (
              <span
                className="absolute inset-0 -z-10 rounded-full bg-chili/30"
                style={{ transform: `scale(${1 + voice.level * 0.8})`, transition: 'transform 80ms linear' }}
              />
            )}
            {voice.status === 'transcribing' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : voice.status === 'listening' ? (
              <Square className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Mic className="h-4 w-4" />
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
            placeholder="พิมพ์คำถาม..."
            className="h-9 min-w-0 flex-1 rounded-full border bg-background px-4 text-sm outline-none focus:border-basil focus:ring-2 focus:ring-basil/30"
          />
          <button
            onClick={() => send(input, false)}
            disabled={!input.trim() || isLoading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-basil text-white transition-colors hover:bg-basil disabled:opacity-40"
            aria-label="ส่ง"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
