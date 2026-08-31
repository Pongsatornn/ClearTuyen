'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Timer } from 'lucide-react';
import { Button } from './ui/button';
import { formatDuration } from '@/lib/utils';

interface StepTimerProps {
  /** ความยาวที่แกะได้จากข้อความขั้นตอน (วินาที) */
  seconds: number;
}

/**
 * นาฬิกาจับเวลาของขั้นตอนที่กำลังทำอยู่
 *
 * รอบรีวิว 30 ก.ค. ข้อ 12: โหมดทำอาหารตั้งใจทำมาให้ใช้หน้าเตา (ตัวใหญ่ ทีละขั้น ปุ่มใหญ่)
 * แต่ขาดสองอย่างที่คนหน้าเตาต้องใช้จริงคือ "จับเวลา" กับ "จอไม่ดับ"
 * (จอไม่ดับอยู่ใน CookingMode.tsx เพราะต้องคุมทั้งโหมด ไม่ใช่แค่ตอนจับเวลา)
 *
 * จงใจไม่มีปุ่มตั้งเวลาเอง — ขึ้นเฉพาะขั้นตอนที่เขียนเวลาไว้ชัดๆ เท่านั้น
 * (ดู `extractStepDurationSeconds`) คนกำลังทำอาหารไม่ควรต้องมาพิมพ์ตัวเลข
 */
export function StepTimer({ seconds }: StepTimerProps) {
  const [remaining, setRemaining] = useState(seconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  // นับถอยหลังจาก "เวลาจริง" ไม่ใช่การบวกทีละวินาที
  // เพราะ setInterval ในแท็บที่ถูกพับไว้เบื้องหลังจะถูกเบรกให้ช้าลง (browser throttling)
  // ถ้านับด้วยตัวนับ นาฬิกาจะเดินช้ากว่าความจริงแล้วของไหม้คามือ
  const deadlineRef = useRef<number | null>(null);

  // หมายเหตุ: การ "รีเซ็ตเมื่อย้ายขั้นตอน" ทำด้วย `key={stepIndex}` ฝั่ง CookingMode
  // ให้ React ทิ้ง component นี้แล้วสร้างใหม่ ไม่ใช่เขียน effect มาไล่ setState เอง
  // (นาฬิกาที่นับค้างจากขั้นก่อนหน้าคือของอันตรายในครัว ต้องเริ่มจากศูนย์ทุกครั้งให้แน่นอน)
  useEffect(() => {
    if (!isRunning) return;

    if (deadlineRef.current === null) {
      deadlineRef.current = Date.now() + remaining * 1000;
    }

    const tick = () => {
      const left = Math.max(0, Math.round(((deadlineRef.current ?? 0) - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setIsRunning(false);
        setIsFinished(true);
        deadlineRef.current = null;
        notifyDone();
      }
    };

    const id = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(id);
    // remaining ถูกอ่านแค่ตอนตั้ง deadline ครั้งแรก จงใจไม่ใส่ใน deps
    // ไม่งั้น interval จะถูกสร้างใหม่ทุกวินาที
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  function handleToggle() {
    if (isFinished) {
      setRemaining(seconds);
      setIsFinished(false);
      deadlineRef.current = null;
      setIsRunning(true);
      return;
    }

    if (isRunning) {
      // หยุดชั่วคราว: ทิ้ง deadline เดิม แล้วให้ตอนกดเล่นต่อคำนวณใหม่จากเวลาที่เหลือ
      deadlineRef.current = null;
      setIsRunning(false);
    } else {
      setIsRunning(true);
    }
  }

  function handleReset() {
    setRemaining(seconds);
    setIsRunning(false);
    setIsFinished(false);
    deadlineRef.current = null;
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
        isFinished
          ? 'border-yolk/45 bg-yolk/10'
          : isRunning
            ? 'border-basil/25 bg-basil-soft'
            : 'border-line bg-white'
      }`}
    >
      <Timer
        className={`h-5 w-5 shrink-0 ${
          isFinished ? 'text-[#8a5a12]' : isRunning ? 'text-basil' : 'text-ash'
        }`}
      />

      <div className="min-w-0 flex-1">
        {/* ตัวเลขต้องใหญ่พอให้อ่านจากระยะที่ยืนห่างจากมือถือหนึ่งช่วงแขน
            และใช้ tabular-nums ไม่ให้ความกว้างขยับไปมาทุกวินาทีจนกวนสายตา */}
        <p
          className={`text-2xl font-bold tabular-nums leading-none ${
            isFinished ? 'text-[#8a5a12]' : 'text-deep'
          }`}
        >
          {formatDuration(remaining)}
        </p>
        <p className="mt-1 text-xs text-ash">
          {isFinished
            ? 'ครบเวลาแล้ว ไปดูที่เตาได้เลย'
            : isRunning
              ? 'กำลังจับเวลาขั้นตอนนี้'
              : `ขั้นตอนนี้ใช้เวลา ${formatDuration(seconds)} — กดเริ่มจับเวลาได้`}
        </p>
      </div>

      {remaining !== seconds && !isRunning && (
        <Button
          size="icon"
          variant="ghost"
          onClick={handleReset}
          aria-label="ตั้งเวลาใหม่"
          className="h-10 w-10 shrink-0 text-ash"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}

      <Button
        onClick={handleToggle}
        variant={isRunning ? 'outline' : 'default'}
        className="h-10 shrink-0"
      >
        {isRunning ? (
          <><Pause className="mr-1.5 h-4 w-4" /> หยุด</>
        ) : (
          <><Play className="mr-1.5 h-4 w-4" /> {isFinished ? 'จับใหม่' : 'เริ่มจับเวลา'}</>
        )}
      </Button>
    </div>
  );
}

/**
 * เตือนตอนครบเวลา — เสียงสั้นๆ + สั่น (เท่าที่เบราว์เซอร์นั้นรองรับ)
 *
 * สร้างเสียงเองด้วย Web Audio แทนไฟล์เสียง เพราะไฟล์เสียงต้องโหลดข้ามเน็ต
 * ซึ่งเชื่อถือไม่ได้ในครัวที่สัญญาณไม่ดี และเป็นของที่ต้องเพิ่มใน public/ อีก
 *
 * ทั้งสองอย่างพังเงียบๆ ได้ในบางเบราว์เซอร์/บางสถานการณ์ (เช่น iOS ไม่รองรับ vibrate,
 * หรือ AudioContext ถูกบล็อกเพราะยังไม่มี user gesture) จึงห่อ try/catch ทั้งคู่ —
 * ตัวเลขบนจอกับสีกรอบที่เปลี่ยนเป็นสีเหลืองคือการเตือนหลักที่ต้องทำงานเสมอ
 * เสียงกับการสั่นเป็นของแถม ไม่ใช่ของที่ผู้ใช้ต้องพึ่ง
 */
function notifyDone() {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      // ค่อยๆ หรี่ลงแทนการตัดจบห้วนๆ ที่จะได้ยินเป็นเสียง "ป๊อก" แทนเสียงเตือน
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
      osc.start();
      osc.stop(ctx.currentTime + 0.9);
      osc.onended = () => ctx.close().catch(() => {});
    }
  } catch {
    // เบราว์เซอร์ไม่ยอมให้เล่นเสียง — ปล่อยผ่าน ตัวเลขบนจอเตือนแทนแล้ว
  }

  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // ไม่รองรับการสั่น — ปล่อยผ่านเช่นกัน
  }
}
