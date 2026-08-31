'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Heart,
  Home,
  ListChecks,
  Loader2,
  PartyPopper,
  X,
} from 'lucide-react';
import { Button } from './ui/button';
import ChefChat from './ChefChat';
import { StepTimer } from './StepTimer';
import { StepRail } from './StepRail';
import type { ChatMessage, Recipe, SaveResult } from '@/lib/types';
import { extractStepDurationSeconds, scaleAmountText, servingsFactor } from '@/lib/utils';
import { useWakeLock } from '@/lib/useWakeLock';

interface CookingModeProps {
  recipe: Recipe;
  // วัตถุดิบที่ผู้ใช้กรอกไว้จริง (คนละชุดกับ recipe.ingredients ที่เป็นของที่สูตรเรียกใช้)
  // ส่งต่อให้เชฟ AI เพื่อให้แนะนำของแทนจากที่มีอยู่จริงได้
  ingredients: string[];
  // จำนวนคนที่ผู้ใช้เลือกไว้ในหน้าสูตร — ต้องส่งต่อมาด้วย ไม่งั้นยืนตวงของอยู่หน้าเตา
  // แล้วเห็นปริมาณคนละชุดกับที่เพิ่งอ่านมา
  servings: number;
  // ส่งต่อให้ ChefChat ในโหมดนี้ด้วย เพราะคนถามเรื่อง "ใช้อะไรแทน" ตอนยืนหน้าเตามากกว่าตอนอ่านสูตร
  dietRestrictions: string[];
  allergies: string[];
  isSaved: boolean;
  onSave: () => Promise<SaveResult>;
  // ไม่ส่งมา = ไม่มีลิสต์เมนูให้กลับไปเลือก (ปุ่มจะไม่ขึ้น)
  onPickAnotherMenu?: () => void;
  // กลับไปหน้าแรก (แก้วัตถุดิบ) รวดเดียว — ไม่ใช่ถอยทีละขั้น
  onStartOver: () => void;
  onExit: () => void;
  // ป้ายบนปุ่มออกในหน้าจบ — ต้องบอกปลายทางจริง เพราะสูตรที่กู้มาจากเมนูที่บันทึกไว้
  // ไม่มีหน้าสูตรเต็มให้กลับไป (ข้อมูลไม่ครบ ดู lib/savedRecipe.ts) onExit จึงพากลับหน้าแรกแทน
  exitLabel: string;
  // บทสนทนากับเชฟชุดเดียวกับหน้าสูตร — ส่งผ่านลงไปให้ ChefChat ตรงๆ
  // เข้าโหมดนี้แล้วต้องคุยต่อจากที่ค้างไว้ ไม่ใช่เริ่มใหม่
  chatMessages: ChatMessage[];
  onChatMessagesChange: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
}

export function CookingMode({
  recipe,
  ingredients,
  servings,
  dietRestrictions,
  allergies,
  isSaved,
  onSave,
  onPickAnotherMenu,
  onStartOver,
  onExit,
  exitLabel,
  chatMessages,
  onChatMessagesChange,
}: CookingModeProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // ข้อความบอกผลการบันทึกของหน้านี้เอง — กล่องชวนล็อกอินกับแถบ error ของหน้าสูตรอยู่คนละหน้า
  // ถ้าไม่มีอันนี้ กดปุ่มบันทึกตรงนี้แล้วจะเงียบสนิทเหมือนปุ่มเสีย
  const [saveMessage, setSaveMessage] = useState('');

  async function handleSaveClick() {
    setIsSaving(true);
    setSaveMessage('');
    try {
      const result = await onSave();
      if (result === 'need-login') {
        setSaveMessage('ต้องเข้าสู่ระบบก่อนถึงจะเก็บสูตรไว้ได้ — ออกไปหน้าสูตรแล้วกดรูปหัวใจเพื่อเข้าสู่ระบบ');
      } else if (result === 'error') {
        setSaveMessage('เก็บสูตรไม่สำเร็จ ลองใหม่อีกครั้ง');
      }
    } finally {
      setIsSaving(false);
    }
  }

  const totalSteps = recipe.instructions.length;
  const factor = servingsFactor(servings, recipe.servings);
  const isLastStep = stepIndex === totalSteps - 1;
  const progress = isDone ? 100 : ((stepIndex + 1) / totalSteps) * 100;

  // กันจอดับตลอดเวลาที่อยู่ในโหมดนี้ (ปล่อยอัตโนมัติตอนออกจากโหมด — ดู useWakeLock)
  // ปล่อยไว้ตอนหน้าฉลองด้วย เพราะคนเพิ่งวางกระทะแล้วยังอ่านหน้าจบอยู่
  const isScreenAwake = useWakeLock(true);

  // ขึ้นปุ่มจับเวลาเฉพาะขั้นตอนที่เขียนเวลาไว้ชัดๆ เท่านั้น (null = ไม่ขึ้น)
  const stepSeconds = isDone
    ? null
    : extractStepDurationSeconds(recipe.instructions[stepIndex] ?? '');

  return (
    <main className="ground ground-stove min-h-screen">
      {/* แถบบนติดหนึบ: ตอนทำอาหารมือเลอะ ต้องเห็นตลอดว่าอยู่ขั้นไหนและออกยังไงโดยไม่ต้องเลื่อนหา */}
      <div className="sticky top-0 z-10 border-b border-line/60 bg-steam/90 backdrop-blur-sm">
        <div className="mx-auto max-w-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onExit}
              className="shrink-0 rounded-full p-1.5 text-ash transition-colors hover:bg-line hover:text-deep"
              aria-label="ออกจากโหมดทำอาหาร"
            >
              <X className="h-5 w-5" />
            </button>
            <p className="min-w-0 flex-1 truncate font-[family-name:var(--font-display-family)] text-sm font-semibold text-deep">
              {recipe.recipe_name}
            </p>
            {/* บอกเฉพาะตอนจับจองสำเร็จจริง — ขึ้นป้าย "จอจะไม่ดับ" แล้วจอดับอยู่ดี
                แย่กว่าไม่บอกอะไรเลย เพราะคนจะวางมือถือแล้วเดินไปหยิบของ */}
            {isScreenAwake && (
              <span className="hidden shrink-0 items-center gap-1 text-[11px] font-medium text-basil sm:flex">
                <Eye className="h-3 w-3" /> จอจะไม่ดับ
              </span>
            )}
            <span className="num shrink-0 text-xs font-medium text-ash">
              {isDone ? 'เสร็จแล้ว' : `${stepIndex + 1}/${totalSteps}`}
            </span>
          </div>

          {/* ใช้แถบอุณหภูมิตัวเดียวกับหน้าอื่น ไม่ใช่ progress bar คนละแบบ
              คนที่เพิ่งเดินมาจากหน้าสูตรจะได้เห็นว่ามันคือแถบเดิมที่เดินมาถึงช่วงร้อนสุดแล้ว */}
          <div className="mt-2">
            <StepRail step={4} subProgress={progress / 100} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
        {isDone ? (
          <div className="space-y-4 rounded-2xl border border-line bg-steam p-8 text-center">
            <PartyPopper className="mx-auto h-10 w-10 text-chili" />
            <div className="space-y-1">
              <p className="font-[family-name:var(--font-display-family)] text-xl font-semibold text-deep">
                ทำ{recipe.recipe_name}เสร็จแล้ว
              </p>
              <p className="text-sm text-ash">ขอให้อร่อยนะครับ</p>
            </div>
            {/* จังหวะที่เพิ่งทำเสร็จคือจังหวะที่อยากเก็บสูตรไว้ที่สุด เดิมหน้านี้มีแต่ปุ่มย้อนกลับ
                ทำให้ตอนจบกลายเป็นทางตัน ทั้งที่เป็นจุดที่ผู้ใช้พอใจกับเมนูมากที่สุด */}
            <div className="flex flex-col gap-2 pt-1">
              <Button
                className="h-11 w-full text-base font-semibold"
                onClick={handleSaveClick}
                disabled={isSaved || isSaving}
              >
                {isSaving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังเก็บ...</>
                ) : isSaved ? (
                  <><Heart className="mr-2 h-4 w-4 fill-current" /> เก็บสูตรนี้ไว้แล้ว</>
                ) : (
                  <><Heart className="mr-2 h-4 w-4" /> เก็บสูตรนี้ไว้</>
                )}
              </Button>

              {saveMessage && (
                <p className="rounded-lg border border-yolk/30 bg-yolk/10 px-3 py-2 text-xs leading-relaxed text-[#8a5a12]">
                  {saveMessage}
                </p>
              )}

              {onPickAnotherMenu && (
                <Button variant="outline" className="h-11 w-full" onClick={onPickAnotherMenu}>
                  <ListChecks className="mr-2 h-4 w-4" /> เลือกเมนูอื่นทำต่อ
                </Button>
              )}

              {/* ทำเสร็จแล้วอีกทางที่คนอยากไปคือกลับไปตั้งต้นใหม่ (ของในตู้เย็นเพิ่งถูกใช้ไป
                  ลิสต์เดิมเลยอาจไม่ตรงกับของที่เหลือแล้ว) เดิมต้องกด "เลือกเมนูอื่น"
                  แล้วค่อยกด "แก้วัตถุดิบ" ต่ออีกที ทั้งที่เป็นคนละเจตนากันตั้งแต่แรก
                  วัตถุดิบที่กรอกไว้ยังอยู่ครบ — หน้าแรกแก้/ลบเองได้ ไม่ล้างให้เงียบๆ */}
              <Button variant="outline" className="h-11 w-full" onClick={onStartOver}>
                <Home className="mr-2 h-4 w-4" /> กลับไปหน้าแรก
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="h-10 flex-1 text-sm text-ash"
                  onClick={() => {
                    setIsDone(false);
                    setStepIndex(totalSteps - 1);
                  }}
                >
                  ดูขั้นตอนสุดท้าย
                </Button>
                <Button
                  variant="ghost"
                  className="h-10 flex-1 text-sm text-ash"
                  onClick={onExit}
                >
                  {exitLabel}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ขั้นตอนปัจจุบัน: ตัวใหญ่ อ่านจากระยะห่างเตาได้ ทีละขั้นไม่ให้ตาหลงบรรทัด */}
            <div className="rounded-2xl border border-line bg-steam p-6">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="num flex h-9 w-9 items-center justify-center rounded-full bg-chili text-base font-semibold text-white">
                  {stepIndex + 1}
                </span>
                <span className="eyebrow">
                  ขั้นที่ {stepIndex + 1} จาก {totalSteps}
                </span>
              </div>
              {/* ตัวใหญ่กว่าที่อื่นในแอปโดยตั้งใจ — หน้านี้ถูกอ่านตอนยืนห่างจากมือถือหนึ่งช่วงแขน
                  มือเปื้อน หยิบขึ้นมาดูใกล้ๆ ไม่ได้ */}
              <p className="text-xl leading-relaxed text-deep">
                {recipe.instructions[stepIndex]}
              </p>
            </div>

            {/* ขั้นตอนที่ระบุเวลาไว้จะมีนาฬิกาให้กดตรงนั้นเลย ไม่ต้องออกไปหาแอปนาฬิกาอื่น
                key={stepIndex} บังคับให้ย้ายขั้นแล้วได้นาฬิกาตัวใหม่ที่ตั้งต้นจากศูนย์
                ไม่ใช่ตัวเดิมที่ยังนับค้างเวลาของขั้นก่อนหน้าอยู่ */}
            {stepSeconds !== null && (
              <StepTimer key={stepIndex} seconds={stepSeconds} />
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="h-12 flex-1 text-base"
                onClick={() => setStepIndex(i => i - 1)}
                disabled={stepIndex === 0}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" /> ก่อนหน้า
              </Button>

              {isLastStep ? (
                <Button
                  className="h-12 flex-1 text-base font-semibold"
                  onClick={() => setIsDone(true)}
                >
                  <Check className="mr-1.5 h-4 w-4" /> ทำเสร็จแล้ว
                </Button>
              ) : (
                <Button
                  className="h-12 flex-1 text-base font-semibold"
                  onClick={() => setStepIndex(i => i + 1)}
                >
                  ถัดไป <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              )}
            </div>

            {/* พับเก็บไว้เพราะระหว่างทำจริงจะเกะกะ แต่ต้องกางดูปริมาณกลางคันได้โดยไม่ต้องออกจากโหมดนี้ */}
            <div className="overflow-hidden rounded-xl border border-line bg-steam">
              <button
                onClick={() => setShowIngredients(v => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm text-deep transition-colors hover:bg-chill/60"
              >
                <span>
                  ดูวัตถุดิบและปริมาณ (สำหรับ <span className="num">{servings}</span> คน)
                </span>
                {showIngredients ? (
                  <ChevronUp className="h-4 w-4 text-ash" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-ash" />
                )}
              </button>

              {showIngredients && (
                <div className="divide-y border-t">
                  {recipe.ingredients.map((ing, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm text-deep">{ing.item}</span>
                      <span className="num text-xs text-ash">{scaleAmountText(ing, factor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* หัวใจของโหมดนี้: ติดตรงไหนถามได้ทันทีโดยไม่ต้องออกไปหน้าอื่น */}
        <ChefChat
          recipeName={recipe.recipe_name}
          recipeSteps={recipe.instructions}
          ingredients={ingredients}
          servings={servings}
          recipeIngredients={recipe.ingredients.map(
            ing => `${ing.item} ${scaleAmountText(ing, factor)}`
          )}
          dietRestrictions={dietRestrictions}
          allergies={allergies}
          currentStep={
            isDone
              ? undefined
              : {
                  number: stepIndex + 1,
                  total: totalSteps,
                  text: recipe.instructions[stepIndex],
                }
          }
          messagesClassName="max-h-72 min-h-32"
          messages={chatMessages}
          onMessagesChange={onChatMessagesChange}
        />
      </div>
    </main>
  );
}
