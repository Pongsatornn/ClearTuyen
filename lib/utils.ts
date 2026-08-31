import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Difficulty, RecipeIngredient } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ระดับความยากเก็บเป็นอังกฤษเพราะเป็นค่าที่ตกลงกับ AI ไว้ใน schema (เปลี่ยนแล้ว prompt พังทั้งชุด)
// แต่เวลาแสดงบนจอต้องเป็นไทยให้เหมือนข้อความอื่นทั้งแอป เลยแปลงตรงจุดเดียวที่นี่
// ทั้งหน้าลิสต์เมนูและหน้ารายละเอียดใช้ตัวนี้ร่วมกัน จะได้ไม่แสดงคนละภาษากัน
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  Easy: "ง่าย",
  Medium: "ปานกลาง",
  Hard: "ยาก",
}

export const DIFFICULTY_BADGE_CLASS: Record<Difficulty, string> = {
  Easy: "bg-basil-soft text-basil border-basil/20",
  Medium: "bg-yolk/15 text-[#8a5a12] border-yolk/30",
  Hard: "bg-chili/12 text-chili border-chili/25",
}

// สีจุดนำหน้าชื่อเมนูในลิสต์ — ใช้ชุดเดียวกับแถบอุณหภูมิ (เย็น→ร้อน = ง่าย→ยาก)
// ให้คนกวาดสายตาหาเมนูง่ายๆ เจอโดยไม่ต้องอ่าน badge ทีละใบ
export const DIFFICULTY_DOT_CLASS: Record<Difficulty, string> = {
  Easy: "bg-basil",
  Medium: "bg-yolk",
  Hard: "bg-chili",
}

// ---------------------------------------------------------------------------
// จำนวนคนกิน + การคูณปริมาณวัตถุดิบ
//
// ทั้งหมดนี้คำนวณในเครื่องล้วนๆ ไม่ยิง AI ใหม่ตอนกดปรับจำนวนคน เพราะ
// (1) ต้องเห็นตัวเลขขยับทันทีที่กด ไม่ใช่รอ 2-3 วินาที
// (2) ยิงใหม่ = เสี่ยงได้สูตรคนละอันกับที่กำลังอ่านอยู่ (LLM ไม่ตอบเหมือนเดิมเป๊ะ)
// ราคาที่จ่ายคือ AI ต้องส่งปริมาณมาเป็นตัวเลข+หน่วยแยกกัน (ดู RecipeIngredient)
// ---------------------------------------------------------------------------

export const MIN_SERVINGS = 1
export const MAX_SERVINGS = 10
// ใช้เมื่อ AI ไม่ได้บอก servings มา (หรือบอกมาเป็นค่าที่เป็นไปไม่ได้)
export const DEFAULT_SERVINGS = 2

export function clampServings(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SERVINGS
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(value)))
}

// เศษส่วนที่คนเขียนสูตรอาหารใช้จริง — "½ ช้อนชา" อ่านแล้วตวงถูกทันที
// ส่วน "0.5 ช้อนชา" ต้องแปลงในหัวก่อนอีกทีว่าคือครึ่งช้อน
const FRACTION_GLYPH: Record<string, string> = {
  "0.25": "¼",
  "0.5": "½",
  "0.75": "¾",
}

// ปัดผลคูณให้เป็นตัวเลขที่ "ตวงได้จริงในครัว"
// 100 กรัม ÷ 2 คน × 3 คน = 150 (ลงตัว) แต่ 2 ช้อนโต๊ะ ÷ 4 × 3 = 1.5 ต้องได้ "1½" ไม่ใช่ "1.5"
// และ 250 ÷ 3 = 83.333... ต้องไม่หลุดทศนิยมยาวๆ ออกไปโชว์บนจอ
function formatAmountNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ""

  // ของชิ้นใหญ่ (กรัม/มิลลิลิตร) ปัดเป็นจำนวนเต็มพอ ทศนิยมไม่มีประโยชน์ตอนชั่ง
  // ของหน่วยเล็ก (ช้อน/ถ้วย) ปัดเป็นเศษ 1/4 เพราะช้อนตวงจริงมีขีด ¼ ½ ¾
  const rounded =
    value >= 10
      ? Math.round(value)
      : value >= 1
        ? Math.round(value * 4) / 4
        : Math.round(value * 20) / 20

  if (rounded === 0) return ""

  const whole = Math.floor(rounded)
  const fraction = rounded - whole
  const glyph = FRACTION_GLYPH[fraction.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")]

  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph
  // ไม่ตรงเศษส่วนมาตรฐาน (เช่น 0.15) ก็แสดงเป็นทศนิยมตามจริง แต่ตัดศูนย์ท้ายทิ้ง
  return String(Number(rounded.toFixed(2)))
}

// แปลงข้อความปริมาณที่ AI เขียนมาเป็นตัวเลข+หน่วย ใช้เป็นตาข่ายรับกรณี AI
// ไม่ยอมส่ง amount_value/amount_unit มาให้ตามสคีมา (เกิดขึ้นได้เสมอกับ LLM)
// ตั้งใจให้ "ไม่แน่ใจก็คืน null" ดีกว่าเดาผิดแล้วคูณเลขมั่วให้ผู้ใช้เอาไปทำอาหารจริง
export function parseAmountText(amount: string): { value: number | null; unit: string } {
  const text = amount.trim()
  if (!text) return { value: null, unit: "" }

  // ช่วงตัวเลข ("1-2 ลูก") คูณไม่ได้ตรงๆ ปล่อยเป็นข้อความเดิมไป
  if (/^\d+(?:\.\d+)?\s*[-–—]\s*\d/.test(text)) return { value: null, unit: "" }

  // เศษส่วนแบบ "1/2 ถ้วย"
  const fraction = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(.*)$/)
  if (fraction) {
    const numerator = Number(fraction[1])
    const denominator = Number(fraction[2])
    if (denominator > 0) {
      return { value: numerator / denominator, unit: fraction[3].trim() }
    }
  }

  const plain = text.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/)
  if (plain) {
    const value = Number(plain[1].replace(",", "."))
    if (Number.isFinite(value) && value > 0) {
      return { value, unit: plain[2].trim() }
    }
  }

  // "เล็กน้อย" / "ตามชอบ" / "พอประมาณ" — เป็นคำตอบที่ถูกต้องของมันอยู่แล้ว ไม่ต้องคูณ
  return { value: null, unit: "" }
}

// ปริมาณที่จะแสดงจริงบนจอเมื่อผู้ใช้เลือกกินกี่คน
export function scaleAmountText(ingredient: RecipeIngredient, factor: number): string {
  if (ingredient.amount_value === null || !Number.isFinite(factor) || factor <= 0) {
    return ingredient.amount
  }

  const scaled = formatAmountNumber(ingredient.amount_value * factor)
  if (!scaled) return ingredient.amount

  return ingredient.amount_unit ? `${scaled} ${ingredient.amount_unit}` : scaled
}

export function servingsFactor(servings: number, baseServings: number): number {
  if (!Number.isFinite(baseServings) || baseServings <= 0) return 1
  return servings / baseServings
}

// ตัวเลขโภชนาการมาจาก AI เป็นข้อความ บางครั้งมีหน่วยติดมาเอง บางครั้งไม่มี
// ถ้าเป็นตัวเลขล้วนค่อยเติมหน่วยให้ ไม่งั้นจะได้ "250 kcal kcal" เวลา AI ใส่หน่วยมาแล้ว
// (รีวิวผู้ใช้ข้อ 10: "PROTEIN 20 — 20 อะไร? กรัม?")
export function formatNutritionValue(raw: string, unit: string): string {
  const text = (raw ?? "").trim()
  if (!text) return "-"
  return /^\d+(?:\.\d+)?$/.test(text) ? `${text} ${unit}` : text
}

// จำนวนวินาทีสูงสุดที่ยอมให้ตั้งจับเวลา (3 ชั่วโมง)
// กันกรณีแกะตัวเลขจากข้อความผิดจนได้ค่ามหาศาล แล้วโชว์นาฬิกาที่นับไปอีก 40 วัน
const MAX_TIMER_SECONDS = 3 * 60 * 60;

/**
 * แกะ "ระยะเวลา" ออกจากข้อความขั้นตอนการทำอาหาร เพื่อเอาไปตั้งนาฬิกาจับเวลาให้
 * คืน `null` ถ้าขั้นตอนนั้นไม่ได้ระบุเวลาไว้ (ซึ่งเป็นกรณีปกติของขั้นตอนอย่าง "ล้างผัก")
 *
 * เจตนา: **ไม่เดา** — โหมดทำอาหารทำมาให้คนยืนหน้าเตาใช้จริง นาฬิกาที่ตั้งเวลาผิด
 * แย่กว่าไม่มีนาฬิกา เพราะคนจะเดินไปทำอย่างอื่นแล้วกลับมาเจอของไหม้
 * ขั้นตอนไหนไม่ได้เขียนเวลาไว้ชัดๆ ก็ไม่ต้องมีปุ่มจับเวลา
 *
 * รองรับ "5 นาที", "3-5 นาที" (เอาตัวน้อยไว้ก่อน ให้เดินมาเช็คเร็วกว่าปล่อยไหม้),
 * "1 ชั่วโมง" และ "ครึ่งชั่วโมง"
 */
export function extractStepDurationSeconds(text: string): number | null {
  if (!text) return null;

  // "ครึ่งชั่วโมง" ไม่มีตัวเลขให้จับ ต้องดักแยกก่อน
  if (/ครึ่งชั่วโมง/.test(text)) return 30 * 60;

  // ตัวเลขตัวแรกที่ตามด้วยหน่วยเวลา — ช่วง "3-5 นาที" จะได้ 3
  // (`[-–—ถึง]` ครอบทั้งขีดปกติ ขีดยาว และคำว่า "ถึง" ที่ AI ใช้สลับกันไปมา)
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:\s*[-–—]\s*\d+(?:\.\d+)?|\s*ถึง\s*\d+(?:\.\d+)?)?\s*(นาที|ชั่วโมง|ชม\.?)/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const seconds = match[2] === 'นาที' ? value * 60 : value * 60 * 60;
  const rounded = Math.round(seconds);

  return rounded > 0 && rounded <= MAX_TIMER_SECONDS ? rounded : null;
}

/** วินาที → "M:SS" หรือ "H:MM:SS" สำหรับโชว์บนนาฬิกาจับเวลา */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
