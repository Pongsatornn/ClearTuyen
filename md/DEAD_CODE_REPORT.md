# Dead Code Report — fridge-menu

**สำรวจล่าสุด: 2026-08-23** (เขียนทับรายงานเดิมของ 30 ก.ค. ทั้งฉบับ เพราะข้อสรุปเก่าหลายข้อไม่จริงแล้ว)

วิธีสำรวจ: สคริปต์ไล่อ่าน `app/`, `components/`, `lib/` ทุกไฟล์ `.ts`/`.tsx` แล้วเช็ค 5 อย่าง —
export ที่ไม่มีไฟล์อื่นอ้าง, ไฟล์ที่ไม่มีใคร import, dependency ที่ไม่มีใคร import,
CSS class ใน `globals.css` ที่ไม่มีใครใช้, prop ใน `*Props` ที่ไม่มีใครส่งค่าให้

---

## ผลสรุป: โปรเจกต์นี้แทบไม่มี dead code

ไม่พบไฟล์ที่ไม่ถูก import, ไม่พบ type/interface ที่ประกาศทิ้ง, ไม่พบ prop ที่ไม่มีใครส่ง,
ไม่พบ `TODO`/`FIXME`/`console.log`/บล็อกโค้ดที่ comment ทิ้งไว้ และ lint ก็ผ่านสะอาด
(`eslint-config-next` จับ unused variable/import ให้อยู่แล้ว ตรงนี้จึงกวาดไปตั้งแต่ต้นทาง)

---

## สิ่งที่ลบ/แก้ไปแล้วในรอบนี้

| รายการ | ที่อยู่เดิม | ทำอะไร |
|---|---|---|
| `clearSession()` | `lib/sessionState.ts` | **ลบ** — ไม่มีใครเรียกเลย ตรวจแล้วว่าไม่ใช่ "ลืมต่อสาย" ด้วย: state ใน sessionStorage เก็บวัตถุดิบ/เมนู ซึ่งไม่ผูกกับตัวตนผู้ใช้ การสลับบัญชีจึงไม่ควรล้างมันอยู่แล้ว |
| `export const STEPS` | `components/StepRail.tsx` | **ถอด `export`** — ใช้แค่ในไฟล์ตัวเอง |
| `export function formatAmountNumber` | `lib/utils.ts` | **ถอด `export`** — ใช้แค่ใน `scaleAmountText()` ไฟล์เดียวกัน |
| `export function getPreset` | `lib/diet.ts` | **ถอด `export`** — ใช้แค่ใน `findDietViolations()`/`buildDietRules()` ไฟล์เดียวกัน |
| `@AGENTS.md` ใน `CLAUDE.md` | root | **แก้เป็น `@md/AGENTS.md`** — ลิงก์เสียตั้งแต่ตอนย้ายเอกสารเข้า `md/` |

> ที่ยัง `export` ไว้ทั้งที่ "ดูเหมือนไม่มีใครใช้": `DietPreset`, `DietViolation`, `MockAccount`,
> `SavedSession` — ทั้ง 4 ตัวเป็น type ที่โผล่ใน signature ของฟังก์ชัน/ตัวแปรที่ export จริง
> (`DIET_PRESETS`, `findDietViolations`, `MOCK_ACCOUNTS`, `loadSession`) ถอด export ออกแล้วยัง
> compile ผ่าน แต่คนที่เรียกใช้จะอ้างชนิดข้อมูลของสิ่งที่ตัวเองได้รับไม่ได้ — **ไม่ใช่ dead code**

---

## ⚠️ บทเรียนจากรอบนี้: `shadcn` เกือบโดนลบทั้งที่จำเป็น

สคริปต์สำรวจรายงานว่า `shadcn` ใน `dependencies` ไม่มีใคร import และดูสมเหตุสมผลมาก
(shadcn คือ CLI ปกติไม่ควรเป็น runtime dependency — ใช้ `npx shadcn add` เอาก็ได้)
ลบออกแล้วรัน `npm install` → **build พังทันที**

```
Can't resolve 'shadcn/tailwind.css' in '.../app'
```

เพราะ `app/globals.css` บรรทัดที่ 3 มี `@import "shadcn/tailwind.css";`
สคริปต์หา import ด้วยแพตเทิร์น `from '...'` ของ JS/TS เท่านั้น **`@import` ของ CSS จึงหลุดสายตาไปทั้งดุ้น**

**กฎที่ต้องถือรอบหน้า: ก่อนลบ dependency ต้อง grep ชื่อมันใน `.css` และไฟล์ config ด้วยเสมอ
ไม่ใช่แค่ `.ts`/`.tsx` — และต้องรัน `npm run build` ยืนยัน ไม่ใช่แค่ `tsc`/`lint`**
(`tsc` กับ `lint` ผ่านฉลุยทั้งคู่ตอนที่ build พังอยู่ เพราะทั้งสองตัวไม่แตะ CSS pipeline)

ตอนนี้ `shadcn` ถูกใส่กลับเข้า `dependencies` แล้ว และ build ผ่านปกติ

### หางของบั๊กนี้: ใส่ package กลับแล้ว dev server ยังพังต่ออีก 20 นาที

หลังใส่ `shadcn` กลับและ `npm run build` ผ่านแล้ว **`next dev` ยังขึ้น error เดิมเป๊ะๆ หน้าเว็บเป็น HTTP 500**
สาเหตุคือ **การรัน `npm install` ขณะที่ dev server เปิดค้างอยู่** — `node_modules` ถูกสลับใต้เท้า
แล้ว persistent cache ของ Turbopack ใน `.next/` จดผลไว้ว่า "resolve `shadcn/tailwind.css` ไม่ได้" แล้วเล่นซ้ำผลนั้นตลอด

ลำดับสิ่งที่ลองแล้ว**ไม่หาย**:

1. `touch app/globals.css` ให้ compile ใหม่ → ยัง error เดิม
2. ปิด dev server แล้วเปิดใหม่ + ลบแค่ `.next/dev` → **ยัง error เดิม** (ตรงนี้ที่หลอกง่าย — นึกว่าพังจริง)

สิ่งที่แก้ได้จริงคือ **ปิด dev server → `rm -rf .next` ทั้งก้อน → เปิดใหม่**
(`.next/dev` เก็บแค่ log/lock — cache จริงอยู่นอกโฟลเดอร์นั้น)

**กฎ:** แก้ `package.json` หรือรัน `npm install` เมื่อไหร่ ให้ปิด dev server ก่อนเสมอ
และอย่าเชื่อ error ของ dev server ที่เปิดคร่อมการเปลี่ยน dependency — เทียบกับ `npm run build` ก่อนเสมอ
ถ้า build ผ่านแต่ dev พัง → เป็นเรื่อง cache ไม่ใช่เรื่องโค้ด

---

## ของที่ "ดูเหมือนไม่ได้ใช้" แต่ยืนยันแล้วว่าใช้อยู่ — อย่าเผลอลบ

- **ทุก dependency ใน `package.json`** — ตรวจทีละตัวแล้วมีคนเรียกจริงหมด
  `radix-ui` (`Slot` ใน `ui/badge.tsx`, `ui/button.tsx`), `class-variance-authority`,
  `clsx` + `tailwind-merge` (`lib/utils.ts`), `zod`, `groq-sdk`, `@supabase/supabase-js`,
  `lucide-react` และ **`shadcn` + `tw-animate-css` ที่ถูกเรียกผ่าน `@import` ใน `globals.css`**
- **ตัวแปร `--radius-sm`/`-lg`/`-xl`/`-2xl`/`-3xl`/`-4xl` ใน `globals.css`** — Tailwind v4 แปลง token
  พวกนี้เป็น utility `rounded-lg`, `rounded-xl`, `rounded-2xl` ที่ใช้อยู่เต็มโปรเจกต์
  การ grep หาชื่อ `--radius-lg` ตรงๆ จะไม่เจอ **ห้ามใช้ผลนั้นตัดสินว่าไม่ได้ใช้**
- **`--color-accent`, `--color-popover` และเพื่อน** — token มาตรฐานของ shadcn ที่ component
  ใน `components/ui/` เรียกผ่าน utility (`hover:bg-accent`) ทิ้งไว้ให้ครบชุดดีกว่าไล่ลบทีละตัว

---

## ของที่ยังค้าง (ไม่ใช่โค้ด)

- **`public/` ว่างเปล่า** — SVG ของ `create-next-app` ถูกลบไปแล้ว เหลือโฟลเดอร์เปล่า
  ไม่กระทบอะไร (git ไม่ track โฟลเดอร์ว่างอยู่แล้ว) เก็บไว้เผื่อมี static file ในอนาคตได้
- **`.env.local`** — อ่านจากตรงนี้ไม่ได้ (gitignore) เอกสารเก่าระบุว่าเคยมี `GEMINI_API_KEY`
  กับ `ANTHROPIC_API_KEY` ค้างอยู่ ทั้งที่โค้ดใช้แค่ `GROQ_API_KEY` + คีย์ Supabase
  ถ้ายังมีอยู่คือ dead config ลบได้ **ต้องเปิดเช็คเอง**
