'use client';

import { Refrigerator, ListChecks, ScrollText, Flame } from 'lucide-react';

/**
 * แถบอุณหภูมิ — ตัวบอกว่าตอนนี้อยู่ขั้นไหนของการทำอาหาร
 *
 * ทำไมถึงเป็น "อุณหภูมิ" ไม่ใช่ progress bar ธรรมดา: งานของแอปนี้คือพาของจากตู้เย็นไปถึงเตา
 * ทั้ง 4 ขั้นของ flow คือการเดินทางนั้นตรงๆ สีของแต่ละช่วงจึงร้อนขึ้นเรื่อยๆ
 * (เขียวเย็น → เขียวมะกอก → เหลืองไข่แดง → แดงพริก) แถบนี้เลยบอกสองอย่างพร้อมกัน
 * คือ "อยู่ขั้นไหน" กับ "ใกล้ได้กินหรือยัง" โดยไม่ต้องอ่านตัวหนังสือ
 *
 * จำเป็นขึ้นมาจริงๆ ตั้งแต่ปุ่ม Back ของเบราว์เซอร์ใช้ถอยทีละขั้นได้ — ก่อนหน้านี้
 * ทุกหน้าหน้าตาเหมือนกันหมด ถอยไปแล้วไม่รู้ว่าอยู่ตรงไหน
 */

const STEPS = [
  { key: 'input', label: 'ของในตู้เย็น', icon: Refrigerator, color: '#4e7f6e' },
  { key: 'list', label: 'เลือกเมนู', icon: ListChecks, color: '#7f9463' },
  { key: 'detail', label: 'อ่านสูตร', icon: ScrollText, color: '#c98f3c' },
  { key: 'cooking', label: 'ลงมือทำ', icon: Flame, color: '#c8402b' },
] as const;

interface StepRailProps {
  /** 1-4 ตามลำดับใน STEPS */
  step: number;
  /** ความคืบหน้าภายในขั้นปัจจุบัน 0-1 (ใช้ตอนทำอาหาร ที่มีหลายขั้นตอนย่อย) */
  subProgress?: number;
}

export function StepRail({ step, subProgress }: StepRailProps) {
  const current = STEPS[Math.min(Math.max(step, 1), STEPS.length) - 1];
  const Icon = current.icon;

  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors duration-700"
        style={{ backgroundColor: current.color }}
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-[family-name:var(--font-display-family)] text-sm font-semibold text-deep">
            {current.label}
          </p>
          <span className="num shrink-0 text-[11px] text-ash">
            {step}/{STEPS.length}
          </span>
        </div>

        {/* รางแบ่ง 4 ช่วงเท่ากัน ช่วงที่ผ่านมาแล้วติดสีของตัวเอง ช่วงที่ยังไม่ถึงเป็นเส้นจาง
            ช่วงปัจจุบันเติมตาม subProgress ถ้ามี (ตอนทำอาหารจะค่อยๆ เต็มตามขั้นตอนย่อย) */}
        <div className="mt-1.5 flex gap-1" aria-hidden>
          {STEPS.map((s, i) => {
            const index = i + 1;
            const isPast = index < step;
            const isCurrent = index === step;
            const fill = isPast ? 1 : isCurrent ? (subProgress ?? 1) : 0;

            return (
              <div key={s.key} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${fill * 100}%`, backgroundColor: s.color }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
