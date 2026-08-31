# CODE_WALKTHROUGH — ไล่โค้ด "ล้างตู้เย็น" ทีละไฟล์

> ไฟล์นี้ชื่อเดิมว่า `README.md` — เปลี่ยนชื่อ 2026-08-23 เพราะเนื้อหาจริงไม่ใช่ README
> (คือคำอธิบายไล่ทุกไฟล์ ทุกฟังก์ชัน ทุก prop ยาว 675 บรรทัด) และการวางชื่อนี้ไว้ทำให้คนเข้าโปรเจกต์มาอ่านไฟล์นี้ก่อน
>
> ⚠️ **เนื้อหาเป็น snapshot ของช่วง ก.ค. 2026 ที่ Supabase/vision ยังพังอยู่**
> อยากรู้สถานะปัจจุบันให้อ่าน [`PROJECT_GUIDE.md`](PROJECT_GUIDE.md) แทน — ไฟล์นี้เก็บไว้เพราะคำอธิบายระดับบรรทัดของมันยังมีค่า

## ภาพรวมเดิม (ตอนที่ยังชื่อ README)

เว็บแอปหน้าเดียว (Single Page App บน Next.js) ที่แก้ปัญหา "มีวัตถุดิบเหลือในตู้เย็นแต่คิดเมนูไม่ออก" ผู้ใช้กรอกรายชื่อวัตถุดิบที่มี (พิมพ์เองหรือถ่าย/อัปโหลดรูปให้ AI มองแล้วเดาชื่อวัตถุดิบให้) เลือกสไตล์อาหารที่อยากกิน กดปุ่มเดียว แล้ว AI ที่สวมบท "เชฟบริหารมือหนึ่ง (Executive Chef de Cuisine)" จะออกแบบเมนูให้ 1 เมนูโดยใช้วัตถุดิบที่มีจริงเป็นหลัก พร้อมสูตร ขั้นตอนทำ ข้อมูลโภชนาการคร่าวๆ และเคล็ดลับจากเชฟ จากนั้นสามารถเปิดแชทถามเชฟ AI ต่อเกี่ยวกับเมนูนั้นได้ (เช่น "ถ้าไม่มีน้ำปลาใช้อะไรแทน") และมีปุ่มหัวใจสำหรับบันทึกเมนูที่ชอบ (ฟีเจอร์นี้เขียนโค้ดไว้แล้วแต่ **ยังใช้งานจริงไม่ได้** — อธิบายเหตุผลไว้ในหัวข้อ "จุดที่ยังไม่สมบูรณ์")

เอกสารนี้ไล่ละเอียดทุกไฟล์ ทุกฟังก์ชัน ทุก prop พร้อมโค้ดจริงประกอบ เพื่อให้กลับมาอ่านทีหลังแล้วเข้าใจโฟลว์ทั้งระบบได้ทันทีโดยไม่ต้องไล่โค้ดใหม่

---

## สารบัญ

1. [ภาพรวมโปรเจกต์และ Tech Stack](#ภาพรวมโปรเจกต์และ-tech-stack)
2. [โครงสร้างไฟล์ทั้งหมด](#โครงสร้างไฟล์ทั้งหมด)
3. [ภาพรวมโฟลว์ทั้งระบบ (End-to-End)](#ภาพรวมโฟลว์ทั้งระบบ-end-to-end)
4. [รายละเอียดไฟล์ระดับ Layout / Style](#4-รายละเอียดไฟล์ระดับ-layout--style)
5. [รายละเอียดไฟล์หลัก `app/page.tsx`](#5-รายละเอียดไฟล์หลัก-apppagetsx)
6. [รายละเอียด API Routes ทั้ง 3 เส้น](#6-รายละเอียด-api-routes-ทั้ง-3-เส้น)
7. [รายละเอียด Components ทั้งหมด](#7-รายละเอียด-components-ทั้งหมด)
8. [รายละเอียด `lib/` (utils + supabase)](#8-รายละเอียด-lib-utils--supabase)
9. [เอกสารสเปก `AI_CHEF_SPEC.md` และไฟล์ agent instructions](#9-เอกสารสเปก-ai_chef_specmd-และไฟล์-agent-instructions)
10. [ตัวแปรสิ่งแวดล้อม (Environment Variables)](#10-ตัวแปรสิ่งแวดล้อม-environment-variables)
11. [จุดที่ยังไม่สมบูรณ์ / บั๊กที่ยืนยันแล้ว](#11-จุดที่ยังไม่สมบูรณ์--บั๊กที่ยืนยันแล้ว)
12. [วิธีรันโปรเจกต์](#12-วิธีรันโปรเจกต์)

---

## ภาพรวมโปรเจกต์และ Tech Stack

| ส่วน | รายละเอียด |
|---|---|
| Framework | Next.js **16.2.6** (App Router), React **19.2.4**, TypeScript strict mode |
| Styling | Tailwind CSS v4 + shadcn/ui (style: `radix-nova`, base color: `neutral`) + Radix UI primitives + `tw-animate-css` + ไอคอนจาก `lucide-react` |
| AI/LLM ที่ใช้จริง | **Groq API** (แพ็กเกจ `groq-sdk`) เท่านั้น — ยิงตรงจาก server (API routes) ไม่มี client เรียก LLM ตรงเลย |
| โมเดลที่ใช้ | `llama-3.3-70b-versatile` (ข้อความ + JSON mode สำหรับสร้างเมนู/แชท) และ `meta-llama/llama-4-scout-17b-16e-instruct` (โมเดล vision รองรับรูปภาพ สำหรับสแกนวัตถุดิบจากรูป) |
| Validation | `zod` — ใช้ตรวจรูปแบบ JSON ที่ AI ตอบกลับมาใน `generate-recipe/route.ts` เท่านั้น (เป็น transitive dependency ที่มาจาก `groq-sdk`/`ai`, ไม่ได้ประกาศตรงใน `package.json`) |
| Persistence | Supabase (Postgres) — ตั้งใจให้ใช้บันทึก "เมนูที่ชอบ" แต่ปัจจุบันใช้งานไม่ได้ (ดูหัวข้อ 11) |
| ระบบ auth | **ไม่มี** — ทุกคนที่ใช้แอปถือเป็นผู้ใช้เดียวกัน (`anonymous-user-001` ที่ hardcode ไว้) |
| Testing/CI | ไม่มีเลย — ไม่มี test framework, ไม่มี CI config, ไม่มี Docker |

**Dependency ที่ประกาศใน `package.json` แต่ไม่ได้ถูก `import` ใช้งานจริงที่ไหนในโค้ดเลย:**
`@anthropic-ai/sdk`, `@google/generative-ai`, `@ai-sdk/google`, `ai` (Vercel AI SDK) — สันนิษฐานว่าเป็นเศษที่เหลือจากตอนที่ยังทดลองใช้ Gemini/Claude ก่อนจะย้ายมาลงตัวที่ Groq/Llama จริง (สอดคล้องกับชื่อไฟล์เดิม `GEMINI.md` (ตอนนี้เปลี่ยนชื่อเป็น `AI_CHEF_SPEC.md` แล้ว) ที่ยังหลงเหลืออยู่ตอนนั้น ซึ่งเขียนสเปกไว้ในสไตล์ system prompt ที่ดูเหมือนตั้งใจให้ Gemini ใช้ แต่พอ implement จริงกลับยิง Groq ทั้งหมด)

---

## โครงสร้างไฟล์ทั้งหมด

```
fridge-menu/
├── .env.local                        # เก็บ API key จริง (git-ignore ไว้ ไม่ถูก commit)
├── .gitignore
├── AGENTS.md                         # คำสั่งพิเศษให้ AI coding agent (เช่น Claude Code) อ่านก่อนแก้โค้ด
├── CLAUDE.md                         # แค่ "@AGENTS.md" — ลิงก์ไปไฟล์เดียวกัน
├── AI_CHEF_SPEC.md                         # เอกสารสเปก/system prompt ต้นแบบบุคลิก AI เชฟ (ไฟล์สำคัญที่สุดที่ไม่ใช่โค้ด)
├── CODE_WALKTHROUGH.md                         # ไฟล์นี้
├── components.json                   # คอนฟิกของ shadcn/ui
├── eslint.config.mjs                 # กฎ lint (extends eslint-config-next)
├── next.config.ts                    # คอนฟิก Next.js (ว่าง ใช้ค่า default ทั้งหมด)
├── next-env.d.ts                     # ไฟล์ type ที่ Next.js gen ให้อัตโนมัติ
├── package.json / package-lock.json
├── postcss.config.mjs                # โหลด Tailwind v4 PostCSS plugin
├── tsconfig.json                     # TS strict + path alias @/*
│
├── app/
│   ├── favicon.ico
│   ├── globals.css                   # ธีมสี Tailwind v4 (ตัวแปร OKLCH ของ shadcn "radix-nova")
│   ├── layout.tsx                    # Root layout: โหลดฟอนต์ Geist, ห่อ <html>/<body>
│   ├── page.tsx                      # ⭐⭐⭐ หน้าเดียวของทั้งแอป รวม state + logic หลักทั้งหมด
│   └── api/
│       ├── generate-recipe/route.ts  # POST — สร้างเมนูจากวัตถุดิบ (แกนหลักของแอป)
│       ├── chat/route.ts             # POST — แชทถาม-ตอบเกี่ยวกับเมนูที่กำลังดู
│       └── vision/route.ts           # POST — แปลงรูปภาพ → รายชื่อวัตถุดิบ (ข้อความ)
│
├── components/
│   ├── ImageUpload.tsx               # ปุ่มอัปโหลดรูป → เรียก /api/vision
│   ├── IngredientInput.tsx           # ช่องพิมพ์ + ปุ่มเพิ่มวัตถุดิบ 1 รายการ
│   ├── IngredientList.tsx            # แสดงวัตถุดิบที่เพิ่มแล้วเป็น badge ลบได้
│   ├── CuisineSelector.tsx           # ปุ่มเลือกสไตล์อาหาร (pill 5 ปุ่ม)
│   ├── RecipeCard.tsx                # การ์ดแสดงผลเมนูที่ AI สร้างให้ (presentational)
│   ├── ChefChat.tsx                  # วิดเจ็ตแชทลอย เก็บ state ข้อความของตัวเอง
│   └── ui/                           # ชิ้นส่วนพื้นฐานของ shadcn/ui
│       ├── button.tsx
│       ├── card.tsx
│       ├── badge.tsx
│       └── input.tsx
│
├── lib/
│   ├── utils.ts                      # ฟังก์ชัน cn() รวม className (clsx + tailwind-merge)
│   └── supabase.ts                   # client Supabase + saveRecipe() — ⚠️ พังอยู่ (ดูหัวข้อ 11)
│
└── public/                           # ไอคอน SVG default ของ create-next-app (ยังไม่เปลี่ยนเป็นของแอปจริง)
    ├── file.svg, globe.svg, next.svg, vercel.svg, window.svg
```

---

## ภาพรวมโฟลว์ทั้งระบบ (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     [Browser]  app/page.tsx (client)                 │
│                                                                       │
│  State เดียวของทั้งหน้า (PageState):                                   │
│  inputValue, ingredientList[], errorMessage, isLoading,               │
│  recipe, isSaved, cuisineType                                         │
└─────────────────────────────────────────────────────────────────────┘
        │                              │
        │ (A) พิมพ์วัตถุดิบเอง            │ (B) อัปโหลด/ถ่ายรูป
        ▼                              ▼
IngredientInput.tsx              ImageUpload.tsx
  → onAdd() = handleAddIngredient()   → FileReader.readAsDataURL(file) → base64
  → sanitize + กันซ้ำ + เพิ่มเข้า list   → POST /api/vision { image: base64 }
                                          │
                                          ▼
                                   app/api/vision/route.ts
                                     → Groq (llama-4-scout, vision model)
                                     → AI อ่านรูป ตอบ "หมูสับ, ไข่ไก่, ผักกาดขาว"
                                     → split ด้วย , หรือ ，
                                          │
                                          ▼
                                   { ingredients: string[] }
                                          │
                                          ▼
                          handleDetectedIngredients() ใน page.tsx
                             → merge เข้า ingredientList (ข้ามตัวซ้ำ, case-insensitive)

        ▼
CuisineSelector.tsx → onSelect(value) → เก็บใน state.cuisineType
(ทั่วไป / อาหารไทย / อาหารญี่ปุ่น / เพื่อสุขภาพ / ทำเร็ว ≤15 นาที)

        ▼
กดปุ่ม "หาเมนูล้างตู้เย็น" (disabled ถ้า ingredientList ว่าง หรือ isLoading)
        │
        ▼
fetchRecipe()  ← ฟังก์ชันใน page.tsx
        │
        ▼
POST /api/generate-recipe { ingredients, cuisineType }
        │
        ▼
app/api/generate-recipe/route.ts
   → Groq (llama-3.3-70b-versatile, response_format: json_object)
   → system prompt: บุคลิกเชฟ + กฎเหล็ก (ห้ามมั่ววัตถุดิบ, food safety, ต้องตอบ JSON เท่านั้น)
   → user prompt: ประเภทอาหาร + รายชื่อวัตถุดิบ + ย้ำ JSON schema
   → JSON.parse(text) → RecipeSchema.parse() (Zod validate)
   → คืน Recipe object (หรือ error ภาษาไทยถ้า parse/validate พลาด)
        │
        ▼
state.recipe ← เก็บผลลัพธ์ → trigger re-render
        │
        ├──────────────────────────────┐
        ▼                              ▼
RecipeCard.tsx (แสดงเมนู)         ChefChat.tsx (โผล่ขึ้นมาเพราะมี recipe แล้ว)
   │                                    │
   │ กดไอคอนหัวใจ                        │ พิมพ์คำถาม → sendMessage()
   ▼                                    ▼
handleSave() ใน page.tsx          POST /api/chat { messages, recipeName, recipeSteps }
   → optimistic: isSaved = true          │
   → saveToSupabase() (lib/supabase.ts)  ▼
   → insert ตาราง "saved_recipes"   app/api/chat/route.ts
   ⚠️ พังอยู่ (package ไม่ได้ติดตั้งจริง)   → Groq (llama-3.3-70b-versatile, ข้อความล้วน)
                                        → system prompt ฝัง recipeName + recipeSteps เป็น context
                                        → ตอบกลับ { role: 'assistant', content }
                                        → ต่อท้ายในแชท UI
```

**ลักษณะสำคัญของสถาปัตยกรรมที่ควรรู้ก่อนแก้โค้ด:**

- ทั้งแอปมีแค่ **หน้าเดียว** (`app/page.tsx`) ไม่มี routing ย่อย ไม่มีหน้า `/history`, `/login`, ฯลฯ
- **API 3 เส้นเป็น stateless ทั้งหมด** — แต่ละ request สร้าง `new Groq(...)` ใหม่ทุกครั้ง (ไม่มี connection pool หรือ singleton ข้าม request)
- **ไม่มีการอ่านข้อมูลจากฐานข้อมูลเลยในทั้งแอป** — โค้ดที่แตะ Supabase มีแค่ทาง "เขียน" (insert) อย่างเดียว ไม่มีหน้าไหนดึงเมนูที่บันทึกไว้กลับมาดู
- **รีเฟรชหน้าเว็บ = ข้อมูลทั้งหมดหายทันที** เพราะทุกอย่างเก็บอยู่ใน React state ล้วนๆ ไม่มี localStorage/sessionStorage ไม่มี URL state
- ChefChat เก็บ state ข้อความของตัวเอง (`useState` ในตัวเอง) ไม่ได้แชร์กับ state หลักของ `page.tsx` — ถ้า `page.tsx` re-render เพราะเหตุอื่น ประวัติแชทจะไม่หาย เพราะ React จะไม่ unmount `ChefChat` ตราบใดที่ `state.recipe` ยังไม่เป็น `null`

---

## 4. รายละเอียดไฟล์ระดับ Layout / Style

### `app/layout.tsx`

Root layout ของทั้งเว็บ เป็น **server component** (ไม่มี `'use client'`)

```ts
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};
```

- โหลดฟอนต์ Geist Sans/Mono ผ่าน `next/font/google` แล้ว expose เป็น CSS variable (`--font-geist-sans`, `--font-geist-mono`) เพื่อให้ `globals.css` เอาไปใช้ต่อ
- `metadata` (title/description ของแท็บเบราว์เซอร์) **ยังเป็นค่า default ของ create-next-app** ไม่เคยถูกเปลี่ยนเป็น "ล้างตู้เย็น" เลย — เป็นจุดที่ควรแก้ถ้าจะเอาไป deploy จริง
- `RootLayout` รับ `children` มาห่อด้วย `<html lang="en">` (แปลว่า `lang` ก็ยังตั้งเป็นอังกฤษ ทั้งที่เนื้อหาทั้งหมดเป็นภาษาไทย) และ `<body className="min-h-full flex flex-col">`

### `app/globals.css`

ไม่มี logic เป็นไฟล์ธีมล้วนๆ:

- `@import "tailwindcss"` + `@import "tw-animate-css"` + `@import "shadcn/tailwind.css"` — import 3 ชั้นตามลำดับ (Tailwind engine → animation utility ของ shadcn → base theme ของ shadcn)
- `@custom-variant dark (&:is(.dark *));` — กำหนดว่า dark mode จะทำงานเมื่อมี class `.dark` อยู่บน ancestor element (ต้องมีใครไป toggle class นี้เอง — **ในโค้ดปัจจุบันไม่มีใคร toggle เลย แปลว่า dark mode ไม่ได้ถูกเปิดใช้งานจริงในแอปนี้** ทั้งที่ตัวแปรสีถูกเตรียมไว้ครบแล้ว)
- `@theme inline { ... }` — map ตัวแปร CSS ของ shadcn (เช่น `--color-primary`, `--color-border`) ให้เข้ากับระบบ theme ของ Tailwind v4 เพื่อให้ใช้ class อย่าง `bg-primary`, `text-muted-foreground`, `border-border` ได้ทั่วโปรเจกต์
- `:root { ... }` — ตัวแปรสีโหมด light เป็นค่าสี OKLCH (background ขาว, foreground เข้ม, primary ดำ ฯลฯ)
- `.dark { ... }` — ตัวแปรสีโหมด dark (background เข้ม, foreground ขาว) เตรียมไว้แต่ไม่ได้ใช้จริงตามที่บอกไปข้างบน
- `@layer base { ... }` — กฎพื้นฐาน 3 ข้อ: ทุก element ใช้ `border-border` และ `outline-ring/50`, `body` ใช้สี `bg-background`/`text-foreground`, `html` ใช้ `font-sans`

**หมายเหตุ:** สีจริงที่หน้าแอปใช้ (เขียวมรกต `emerald-*`, ครีม `stone-*`, เหลืองอำพัน `amber-*`) เป็น Tailwind utility class มาตรฐานที่เขียนตรงในแต่ละ component (เช่น `bg-emerald-700`, `bg-stone-50`) **ไม่ได้ผ่านตัวแปรธีมของ shadcn ข้างบนนี้เลย** — เพราะฉะนั้นถ้าจะเปลี่ยนธีมสีหลักของแอป ต้องไปไล่แก้ใน component แต่ละไฟล์ ไม่ใช่แก้แค่ `globals.css`

---

## 5. รายละเอียดไฟล์หลัก `app/page.tsx`

ไฟล์นี้เป็น **client component** (`'use client'`) รวม state และ logic เกือบทั้งหมดของแอปไว้ที่เดียว ไม่มี custom hook แยกไฟล์ ไม่มี context — ทุกอย่างอยู่ใน component `Home` ตัวเดียว

### Types

```ts
interface Recipe {
  recipe_name: string;
  estimated_time: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  ingredients: { item: string; amount: string; is_staple: boolean }[];
  instructions: string[];
  nutritional_info: {
    calories: string;
    protein: string;
    remarks?: string;
  };
  chef_tips: string;
}

interface PageState {
  inputValue: string;       // ค่าที่กำลังพิมพ์ในช่อง IngredientInput
  ingredientList: string[]; // วัตถุดิบที่ถูกเพิ่มเข้าลิสต์แล้ว
  errorMessage: string;     // error ที่จะโชว์ใต้ช่อง IngredientInput
  isLoading: boolean;       // true ระหว่างรอ /api/generate-recipe ตอบ
  recipe: Recipe | null;    // ผลลัพธ์เมนูที่ AI สร้างให้ (null = ยังไม่มี/ยังไม่กดค้นหา)
  isSaved: boolean;         // true หลังกดปุ่มหัวใจบันทึกสำเร็จ (optimistic)
  cuisineType: string;      // สไตล์อาหารที่เลือกไว้ (default: 'ทั่วไป')
}
```

`Recipe` interface นี้ต้อง **ตรงเป๊ะ** กับ `RecipeSchema` (Zod) ใน `app/api/generate-recipe/route.ts` และกับ `Recipe` interface ที่ประกาศซ้ำอีกรอบใน `components/RecipeCard.tsx` (ทั้ง 3 ที่ก็อปปี้โครงเดียวกันแบบไม่ได้แชร์ type กลาง — ถ้าจะแก้โครงสร้างเมนูต้องไล่แก้ 3 ที่พร้อมกัน)

### State เดียวกับ helper

```ts
const [state, setState] = useState<PageState>({ ...ค่าเริ่มต้นทั้งหมด... });

function updateState(partial: Partial<PageState>) {
  setState(prev => ({ ...prev, ...partial }));
}
```

ทั้งไฟล์ไม่มีการแยก `useState` หลายตัว แต่รวมทุก field ไว้ใน object เดียวแล้วใช้ `updateState()` เป็น setter กลางที่ shallow-merge partial object เข้ากับ state เดิมทุกครั้ง (คล้าย `this.setState` สมัย React class component)

### ฟังก์ชันจัดการวัตถุดิบ

**`handleAddIngredient()`** — เรียกเมื่อกด Enter หรือกดปุ่ม "+ เพิ่ม" ใน `IngredientInput`

```ts
const sanitized = state.inputValue
  .trim()
  .replace(/[<>{}[]()\"\'\\]/g, '') // Basic XSS/Injection prevention
  .slice(0, 50); // Limit length
```

ทำ 3 อย่างตามลำดับ: (1) ตัดช่องว่างหัว-ท้าย (2) กรองอักขระ `<>{}[]()"'\` ออกทั้งหมดเพื่อป้องกัน injection เบื้องต้น (เพราะค่านี้จะถูกส่งเข้าไปฝังใน prompt ที่ยิงให้ AI ต่อ ถ้าไม่กรองอาจถูกใช้ทำ prompt injection ได้บางระดับ) (3) ตัดความยาวไม่ให้เกิน 50 ตัวอักษร

ต่อจากนั้น:
- ถ้า sanitize แล้วว่างเปล่า → ตั้ง `errorMessage: 'กรุณาระบุวัตถุดิบที่ถูกต้อง'` แล้ว `return` ทันที (ไม่เพิ่มเข้าลิสต์)
- ถ้าพบว่าซ้ำกับของที่มีอยู่แล้ว (เทียบด้วย `.toLowerCase()` ไม่สนตัวพิมพ์ใหญ่/เล็ก) → ตั้ง `errorMessage` บอกว่าซ้ำ แล้ว `return`
- ถ้าผ่านทั้งสองเงื่อนไข → `push` เข้า `ingredientList`, เคลียร์ `inputValue` และ `errorMessage`

**`handleRemoveIngredient(index: number)`** — ลบวัตถุดิบออกจากลิสต์ด้วย `Array.filter((_, i) => i !== index)` ตาม index ที่ระบุ (ผูกกับปุ่ม X บน badge แต่ละใบใน `IngredientList`)

**`handleDetectedIngredients(newIngredients: string[])`** — callback ที่ `ImageUpload` เรียกกลับมาหลัง AI วิเคราะห์รูปเสร็จแล้ว logic คือ loop ผ่านทุกชื่อที่ AI ตรวจพบ ถ้ายังไม่มีใน `ingredientList` (case-insensitive) ก็ push เข้าไปในตัวแปร local `currentList` แล้วตั้ง flag `hasNew = true` — สุดท้ายค่อย `updateState` ทีเดียวถ้ามีของใหม่จริง (ไม่ยิง re-render เปล่าๆถ้า AI ตรวจพบแต่ของที่มีอยู่แล้วทั้งหมด)

**หมายเหตุ:** ชื่อวัตถุดิบที่มาจาก AI vision ไม่ผ่านการ sanitize แบบเดียวกับ `handleAddIngredient()` (ไม่ถูก `.replace()` กรองอักขระอันตราย) เพราะ merge ตรงเข้าลิสต์เลย — ถือเป็นความไม่สมมาตรเล็กๆ ระหว่าง 2 ทางที่เพิ่มวัตถุดิบเข้าระบบ

### `fetchRecipe()` — เรียก API สร้างเมนู

```ts
async function fetchRecipe() {
  updateState({ isLoading: true, recipe: null, isSaved: false, errorMessage: '' });
  try {
    const res = await fetch('/api/generate-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients: state.ingredientList, cuisineType: state.cuisineType }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API Error');
    updateState({ recipe: data });
  } catch (err: any) {
    alert(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
  } finally {
    updateState({ isLoading: false });
  }
}
```

ขั้นตอน: (1) เคลียร์ recipe เดิม/isSaved เดิมทิ้งก่อนเริ่มโหลดใหม่ทุกครั้ง (2) ยิง `POST /api/generate-recipe` พร้อม body เป็นวัตถุดิบทั้งลิสต์ + สไตล์อาหารที่เลือก (3) ถ้า `res.ok` เป็น false (เช่น 400/500) จะ throw error โดยดึงข้อความจาก `data.error` ที่ backend ส่งมา (4) ถ้าสำเร็จ เก็บ JSON ที่ได้ตรงเข้า `state.recipe` เลยโดยไม่มีการ validate ฝั่ง client อีกชั้น (เชื่อว่า backend validate ด้วย Zod ให้แล้ว) (5) error ใดๆ จะโชว์ผ่าน `alert()` ของเบราว์เซอร์ (ไม่ใช่ toast/UI สวยๆ) (6) `finally` ปิด `isLoading` เสมอไม่ว่าสำเร็จหรือพลาด

### `handleSave()` — บันทึกเมนูลง Supabase

```ts
async function handleSave() {
  if (!state.recipe || state.isSaved) return;
  updateState({ isSaved: true }); // Optimistic Update
  try {
    await saveToSupabase({
      name: state.recipe.recipe_name,
      ingredients: state.recipe.ingredients.map(i => `${i.item} (${i.amount})`),
      steps: state.recipe.instructions
    });
  } catch (error) {
    console.error('Failed to save:', error);
    updateState({ isSaved: false });
    alert('ไม่สามารถบันทึกเมนูได้');
  }
}
```

ทำงานแบบ **optimistic update**: ตั้ง `isSaved: true` ให้ UI (หัวใจในการ์ด) เปลี่ยนเป็นสีแดง "ก่อน" ที่จะรู้ผลจริงจาก Supabase — ถ้าเซฟพลาด (เช่น network error หรือกรณีปัจจุบันคือ import พังทั้ง module) จะ rollback `isSaved` กลับเป็น `false` แล้ว alert แจ้งผู้ใช้ ก่อนเรียก `saveToSupabase` มีการแปลงรูปข้อมูลจาก `Recipe` (โครงที่มี `ingredients: {item, amount, is_staple}[]`) ให้กลายเป็นโครงง่ายๆที่ `lib/supabase.ts` ต้องการ (`ingredients: string[]` แบบ `"ชื่อ (ปริมาณ)"`)

### ส่วน Render (JSX)

โครงหน้าเรียงจากบนลงล่างเป็น:

1. **Header** — `<div className="text-5xl">🧊</div>` + `<h1>ล้างตู้เย็น</h1>` + คำโปรย
2. **Card หลัก** (`<Card><CardContent>`) ครอบ:
   - `ImageUpload` — prop `onIngredientsDetected={handleDetectedIngredients}`
   - `IngredientInput` — prop `value`, `onChange` (เคลียร์ `errorMessage` ทุกครั้งที่พิมพ์), `onAdd={handleAddIngredient}`, `error={state.errorMessage}`
   - `IngredientList` — prop `ingredients`, `onRemove={handleRemoveIngredient}`, `onClearAll` (เคลียร์ `ingredientList` เป็น `[]` ตรงๆ)
   - `CuisineSelector` — prop `selected`, `onSelect` (เซ็ต `cuisineType`)
   - `<hr>` เส้นแบ่ง
   - ปุ่ม submit ขนาดใหญ่ (`h-12`) — `disabled` เมื่อ `ingredientList.length === 0 || isLoading`, สลับข้อความ/ไอคอนระหว่างสถานะโหลด (`Loader2` หมุน + "กำลังค้นหาเมนู...") กับสถานะปกติ (`Search` ไอคอน + "หาเมนูล้างตู้เย็น")
3. `{state.recipe && <RecipeCard .../>}` — เงื่อนไข render แบบ short-circuit ทั่วไปของ React
4. `{state.recipe && <ChefChat .../>}` — โผล่มาพร้อมกับ RecipeCard เพราะเงื่อนไขเดียวกัน (มี recipe แล้ว)
5. กล่องคำเตือนความปลอดภัยด้านอาหารสีเหลืองอำพัน (ข้อความ static ไม่เปลี่ยนตามเมนู ไม่ได้มาจาก AI)

---

## 6. รายละเอียด API Routes ทั้ง 3 เส้น

ทั้ง 3 ไฟล์อยู่ใน `app/api/<name>/route.ts` ตามข้อกำหนดของ Next.js App Router (แต่ละไฟล์ export function `POST` ที่รับ `NextRequest` และคืน `NextResponse.json(...)`) ทั้ง 3 ไฟล์สร้าง Groq client ตัวเองแยกกัน (`new Groq({ apiKey: process.env.GROQ_API_KEY })`) ที่ระดับบนสุดของไฟล์ (module scope) — แปลว่า client ถูกสร้างครั้งเดียวตอน route module ถูกโหลดขึ้น serverless function/edge runtime ไม่ใช่สร้างใหม่ทุก request

### 6.1 `app/api/generate-recipe/route.ts` — แกนหลักของแอป

**Zod Schema** ที่ใช้ตรวจ (validate) ผลลัพธ์จาก AI ก่อนส่งกลับให้ frontend:

```ts
const RecipeSchema = z.object({
  recipe_name: z.string(),
  estimated_time: z.string(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  ingredients: z.array(z.object({
    item: z.string(), amount: z.string(), is_staple: z.boolean()
  })),
  instructions: z.array(z.string()),
  nutritional_info: z.object({
    calories: z.string(), protein: z.string(), remarks: z.string().optional()
  }),
  chef_tips: z.string()
});
```

**ลำดับการทำงานของ `POST`:**

1. `req.json().catch(() => null)` — parse body แบบกันพัง ถ้า body ไม่ใช่ JSON ที่ถูกต้องจะได้ `null` แทนการ throw
2. ตรวจว่า `body.ingredients` มีอยู่, เป็น array, และมีความยาว > 0 — ถ้าไม่ผ่านเงื่อนไขใดข้อหนึ่งตอบ `400` พร้อม `{ error: 'กรุณาระบุวัตถุดิบอย่างน้อย 1 อย่าง' }`
3. destructure `ingredients` และ `cuisineType` (ถ้าไม่ส่งมา default เป็น `'ทั่วไป'`)
4. เรียก `client.chat.completions.create` ด้วย:
   - `model: 'llama-3.3-70b-versatile'`
   - `messages` มี 2 ข้อความ: **system** (นิยามบุคลิก "Executive Chef de Cuisine" + กฎเหล็ก 3 ข้อ: ห้ามเพิ่มวัตถุดิบหลักที่ไม่มียกเว้น staple, food safety ต้องมาก่อน, ต้องตอบ JSON เท่านั้นห้าม markdown) และ **user** (ระบุ `cuisineType` + `ingredients.join(', ')` + แปะโครง JSON ที่ต้องการซ้ำอีกรอบแบบ literal เพื่อ "ย้ำ" ให้โมเดลตอบตรงสคีมา)
   - `response_format: { type: 'json_object' }` — สั่ง Groq ให้บังคับ output เป็น JSON object เท่านั้น (ฟีเจอร์ JSON mode ของ Groq/OpenAI-compatible API)
5. ดึง `response.choices[0]?.message?.content` — ถ้าไม่มีเนื้อหาเลย (undefined/empty) จะ `throw new Error('AI returned an empty response')`
6. `JSON.parse(text)` แปลง string เป็น object ดิบ
7. `RecipeSchema.parse(rawRecipe)` — ถ้าโครงสร้างไม่ตรง (เช่น AI ลืมใส่ field, หรือใส่ `difficulty` เป็นค่าที่ไม่ใช่ 'Easy'/'Medium'/'Hard') Zod จะ throw `ZodError`
8. คืน `NextResponse.json(validatedRecipe)` เป็นผลลัพธ์สุดท้าย

**การจัดการ error:** `catch` แยก 2 กรณี — ถ้า `error instanceof z.ZodError` ตอบ 500 พร้อมข้อความไทยเจาะจงว่า "ข้อมูลจาก AI ไม่ถูกต้องตามรูปแบบที่กำหนด กรุณาลองใหม่อีกครั้ง" (บอกผู้ใช้ให้กดใหม่ เพราะบางทีโมเดลตอบผิดสคีมาแบบสุ่มๆ ลองใหม่อาจผ่าน) ส่วน error อื่นๆ (เช่น `JSON.parse` พัง เพราะ AI ตอบ markdown ปนมา, หรือ network error ไปหา Groq) ตอบ 500 ทั่วไปว่า "เกิดข้อผิดพลาดในการสร้างเมนู กรุณาลองใหม่อีกครั้ง" — ทั้งสอง error จะถูก log ด้วย `console.error('Generate Recipe Error:', error)` ฝั่ง server ก่อนตอบกลับ

### 6.2 `app/api/chat/route.ts` — แชทถาม-ตอบ

**ลำดับการทำงาน:**

1. parse body แบบกันพังเหมือนกัน, ถ้าไม่มี `body.messages` ตอบ 400 `{ error: 'Missing messages' }`
2. destructure `messages`, `recipeName`, `recipeSteps` จาก body
3. เรียก Groq โมเดลเดิม (`llama-3.3-70b-versatile`) แต่ **ไม่ตั้ง** `response_format` (แปลว่าตอบเป็นข้อความธรรมดา ไม่ใช่ JSON)
4. system prompt ฝัง context ของเมนูปัจจุบันเข้าไปแบบ dynamic:
   ```ts
   `...ตอนนี้ผู้ใช้กำลังทำเมนู: ${recipeName || 'อาหารทั่วไป'}
   วิธีทำ: ${recipeSteps?.join(' | ') || 'ไม่ได้ระบุ'}
   กฎสำคัญ: ตอบเป็นภาษาไทย, ให้คำแนะนำชัดเจนแม่นยำ,
   หากเปลี่ยนวัตถุดิบให้เน้น Food Safety First, ตอบสั้นกระชับ`
   ```
   วิธีทำถูก join ด้วย `|` ให้เป็นบรรทัดเดียวยาวๆ (ไม่ใช่ list แบบมี newline) แล้วยัดเข้า system prompt ทุกครั้งที่มีการแชท 1 ครั้ง — หมายความว่า **ทุก message ในการสนทนาจะแปะสูตรเมนูทั้งหมดซ้ำเข้าไปใน system prompt ใหม่ทุกรอบ** (ไม่ได้ cache หรือส่งครั้งเดียว)
5. แปลง `messages` ที่รับมาจาก client ด้วย `.map()` — บังคับ role ที่ไม่ใช่ `'assistant'` ให้กลายเป็น `'user'` ทั้งหมด (กันกรณี client ส่ง role แปลกๆ เช่น `'system'` ปลอมเข้ามาปนในประวัติแชท) แล้วต่อท้าย system message ด้วย spread `...messages.map(...)`
6. ดึง `response.choices[0]?.message?.content` ถ้าว่าง/undefined จะ fallback เป็นข้อความไทย `'ขอโทษครับ ลองถามใหม่อีกครั้ง'` (ต่างจาก generate-recipe ที่ throw error ตรงนี้จะ fallback เงียบๆแทน)
7. คืน `{ role: 'assistant', content: text }` เป็น JSON

**Error handling:** catch ครอบทั้งฟังก์ชัน, log แล้วตอบ 500 พร้อม `{ role: 'assistant', content: 'เกิดข้อผิดพลาดในการเชื่อมต่อกับเชฟ' }` (ยังคงส่งรูปแบบ message กลับมาเหมือนตอนสำเร็จ เพื่อให้ frontend เอาไปแสดงในแชทได้ตรงๆโดยไม่ต้องเช็ค error แยก)

### 6.3 `app/api/vision/route.ts` — แปลงรูปภาพเป็นวัตถุดิบ

**ลำดับการทำงาน:**

1. parse body, ถ้าไม่มี `body.image` ตอบ 400 `{ error: 'ไม่พบรูปภาพ' }`
2. **ตรวจขนาดไฟล์** จากความยาวสตริง base64 ด้วยสูตรประมาณ:
   ```ts
   const sizeInBytes = (image.length * 3) / 4;
   const maxSizeInBytes = 5 * 1024 * 1024; // 5MB
   if (sizeInBytes > maxSizeInBytes) return 413 (...)
   ```
   สูตรนี้มาจากข้อเท็จจริงว่า base64 encode ทุก 3 byte ต้นฉบับให้กลายเป็น 4 ตัวอักษร ดังนั้นแปลงกลับคือ `length * 3/4` (เป็นค่าประมาณ ไม่หัก padding `=` ท้ายสตริง แต่ค่าคลาดเคลื่อนเล็กน้อยไม่กระทบการเช็คเกิน 5MB)
3. เรียก Groq ด้วยโมเดล vision `meta-llama/llama-4-scout-17b-16e-instruct` โดยส่ง `messages` แบบ **multimodal**:
   ```ts
   content: [
     { type: 'image_url', image_url: { url: image } }, // image คือ data-URL base64 ทั้งก้อน
     { type: 'text', text: 'วิเคราะห์รูปภาพนี้และบอกชื่อวัตถุดิบ... ตอบเป็นรายการคั่นด้วยจุลภาค เช่น: หมูสับ, ไข่ไก่, ผักกาดขาว ห้ามมีคำบรรยายอื่น' }
   ]
   ```
4. รับ `content` (string) ที่ AI ตอบมา แล้ว **แยกด้วย regex** `content.split(/[,，]/)` — รองรับทั้งจุลภาคภาษาอังกฤษ (`,`) และจุลภาคเต็มความกว้างภาษาจีน/ญี่ปุ่น (`，`) ที่โมเดลอาจสุ่มใช้ปนมา จากนั้น `.map(trim)` และ `.filter(length > 0)` เพื่อตัดช่องว่างและตัวที่ว่างเปล่าออก
5. คืน `{ ingredients: string[] }`

**ข้อสังเกต:** endpoint นี้ไม่มีการตรวจ `Content-Type` ของรูปจริงๆ (แค่เชื่อว่า client ส่ง data-URL รูปมาให้) และไม่มีการ validate ว่า string ที่ AI ตอบมาเป็นชื่ออาหารจริงหรือไม่ (ถ้า AI ตอบมั่วหรือมีคำอธิบายแทรกมา ก็จะถูก split ไปเป็น "วัตถุดิบ" ปนเข้าลิสต์ตรงๆ)

---

## 7. รายละเอียด Components ทั้งหมด

### `components/ImageUpload.tsx`

```ts
interface ImageUploadProps {
  onIngredientsDetected: (ingredients: string[]) => void;
}
```

- state ภายในตัวเดียว: `isAnalyzing: boolean`
- `<input type="file" accept="image/*" className="hidden" id="image-upload">` ถูกซ่อนไว้ (ผู้ใช้มองไม่เห็น input จริง) และผูกกับ `<label htmlFor="image-upload">` ที่ตกแต่งเป็นกล่องเส้นประสีเขียวมรกต ทำให้กดที่ label แล้ว trigger การเลือกไฟล์ของ input ที่ซ่อนไว้ได้ (เทคนิค CSS/HTML มาตรฐานสำหรับ custom file-upload button)
- `handleFileChange(e)`: ดึงไฟล์แรกจาก `e.target.files`, เช็กขนาดไฟล์ฝั่ง client ก่อน (`file.size > 5*1024*1024` → `alert` + reset `e.target.value = ''`), ถ้าผ่านใช้ `FileReader.readAsDataURL(file)` แปลงเป็น base64 data-URL แบบ async ผ่าน `reader.onload` callback แล้วเรียก `analyzeImage(base64)`
- `analyzeImage(base64)`: ตั้ง `isAnalyzing: true`, `POST /api/vision` ด้วย `{ image: base64 }`, ถ้า response มี `data.ingredients` เรียก prop `onIngredientsDetected(data.ingredients)`, ถ้าไม่มี (เช่น backend ตอบ error) จะ `alert(data.error || 'ไม่สามารถวิเคราะห์รูปภาพได้')`, จบด้วย `finally` ปิด `isAnalyzing`
- UI สลับระหว่าง 2 สถานะ: ปกติ (ไอคอน `Image` + "อัปโหลดรูปภาพเพื่อสแกน") กับกำลังวิเคราะห์ (ไอคอน `Loader2` หมุน + "กำลังสแกนวัตถุดิบ...") — ตอน `isAnalyzing` จะ `disabled` input ด้วยและเปลี่ยนสีกล่องเป็นสีเทา (`bg-muted`)

### `components/IngredientInput.tsx`

```ts
interface IngredientInputProps {
  value: string;
  onChange: (val: string) => void;
  onAdd: () => void;
  error?: string;
}
```

Controlled input ล้วนๆ ไม่มี state ภายในของตัวเอง — ทุกอย่างถูกควบคุมจาก `page.tsx` ผ่าน props `handleKeyDown` เช็คว่าปุ่มที่กดคือ `Enter` แล้ว `e.preventDefault()` (กัน form submit เริ่มต้นของเบราว์เซอร์ ถึงแม้ที่นี่จะไม่มี `<form>` ล้อมอยู่ก็ตาม เป็นการป้องกันไว้ก่อน) ก่อนเรียก `onAdd()` — ถ้ามี `error` prop ที่ไม่ว่าง component จะเปลี่ยนสี border ของ `Input` เป็นแดง (`border-red-400 focus-visible:ring-red-300`) และโชว์ข้อความ error สีแดงเล็กๆใต้ช่อง

### `components/IngredientList.tsx`

```ts
interface IngredientListProps {
  ingredients: string[];
  onRemove: (index: number) => void;
  onClearAll: () => void;
}
```

- แสดงจำนวนรายการที่มุมซ้ายบน (`{ingredients.length} รายการ`) — ถ้าลิสต์ว่างจะไม่โชว์ตัวเลขเลย (เงื่อนไข `ingredients.length > 0 && ...`)
- ปุ่ม "ล้างทั้งหมด" (สีแดง, hover เข้มขึ้น) โผล่มาเฉพาะเมื่อมีวัตถุดิบอย่างน้อย 1 ตัว เรียก `onClearAll` ตรงๆ
- แต่ละวัตถุดิบ render เป็น `<Badge variant="secondary">` ที่มีปุ่ม `X` (จาก `lucide-react`) ต่อท้าย กด `X` เรียก `onRemove(i)` โดย `i` คือ index ในอาร์เรย์ (ไม่ใช่ id เฉพาะ — ถ้ามี 2 ชื่อซ้ำกันในลิสต์ที่ผ่านมาได้ยาก เพราะกันซ้ำไว้ตั้งแต่ `handleAddIngredient`/`handleDetectedIngredients` แล้ว)
- ถ้าลิสต์ว่างเปล่า โชว์ placeholder เทาๆว่า "ยังไม่มีวัตถุดิบ — ลองพิมพ์อะไรสักอย่าง"

### `components/CuisineSelector.tsx`

```ts
const CUISINE_TYPES = [
  { label: '🍜 ทั่วไป', value: 'ทั่วไป' },
  { label: '🌶 อาหารไทย', value: 'อาหารไทย' },
  { label: '🍱 อาหารญี่ปุ่น', value: 'อาหารญี่ปุ่น' },
  { label: '🥗 เพื่อสุขภาพ', value: 'เพื่อสุขภาพ' },
  { label: '⚡ ทำเร็ว', value: 'ทำเร็ว (ไม่เกิน 15 นาที)' },
];
```

ค่าคงที่ (module-level constant) ไม่ได้อยู่ใน state — แต่ละปุ่มเป็นทรง pill (`rounded-full`), ปุ่มที่ตรงกับ `selected` prop (เทียบตรงกับ `value`) จะไฮไลต์เป็นพื้นเขียวมรกตตัวหนังสือขาว (`bg-emerald-600 text-white`) ที่เหลือเป็นพื้นขาว ตัวหนังสือเทา มี border บางๆ ที่ hover จะเปลี่ยนสี border เป็นเขียวอ่อน คลิกปุ่มไหนจะเรียก `onSelect(c.value)` — สังเกตว่า `value` ของ "ทำเร็ว" ไม่ใช่แค่ `'ทำเร็ว'` แต่เป็น `'ทำเร็ว (ไม่เกิน 15 นาที)'` เต็มๆ ซึ่งค่านี้จะถูกส่งตรงเข้า prompt ของ AI ในฐานะ `cuisineType`

### `components/RecipeCard.tsx`

Component ที่ไม่มี state ภายในเลย (pure presentational) รับ `recipe: Recipe`, `isSaved: boolean`, `onSave: () => void`

โครง render จากบนลงล่าง:

1. **CardHeader พื้นเขียวเข้ม** (`bg-emerald-700`) มี:
   - Badge ระดับความยาก — สีขึ้นกับ `recipe.difficulty` ผ่าน object mapping `{ Easy: 'เขียว', Medium: 'เหลือง/อำพัน', Hard: 'แดง' }`
   - เวลาทำโดยประมาณ พร้อมไอคอน `Timer`
   - ชื่อเมนู (`recipe.recipe_name`) เป็นหัวข้อใหญ่ตัวหนา
   - ปุ่มหัวใจ (มุมขวาบน) — ไอคอน `Heart` เปลี่ยนเป็น `fill-red-400 text-red-400` (หัวใจตันสีแดง) เมื่อ `isSaved === true`, เป็นเส้นขอบสีเขียวอ่อนเมื่อยังไม่ได้บันทึก, `onClick={onSave}`
2. **สรุปโภชนาการ** — กล่อง 2 คอลัมน์ (Calories | Protein) มีเส้นแบ่งกลาง แสดงค่าจาก `recipe.nutritional_info.calories`/`.protein` ตรงๆ (เป็น string ที่ AI กำหนดมาเอง ไม่มีการคำนวณเลขจริงฝั่งแอป)
3. **วัตถุดิบที่ต้องใช้** — grid responsive (1 คอลัมน์บนมือถือ, 2 คอลัมน์บนหน้าจอ `sm` ขึ้นไป) แต่ละช่องแสดง `ing.item` ทางซ้ายและ `ing.amount` เป็น chip ทางขวา — **ไม่ได้ใช้ field `is_staple` ในการแสดงผลเลย** (มีอยู่ใน data แต่ UI ไม่ได้เอาไปทำอะไร เช่น ไม่มีการ badge แยกว่าอันไหนคือเครื่องปรุงพื้นฐานที่คาดว่ามีติดบ้านอยู่แล้ว)
4. **ขั้นตอนการทำ** — loop `recipe.instructions` เป็น list ที่มีเลขกลมๆ (1, 2, 3, ...) ข้างหน้าแต่ละขั้น, มี hover effect ให้เลขวงกลมเปลี่ยนเป็นพื้นเขียวตัวหนังสือขาวตอนชี้เมาส์ (กลุ่ม `group`/`group-hover`)
5. **กล่องเคล็ดลับจากเชฟ** — พื้นเขียวอ่อน มีไอคอน `ChefHat` ทั้งแบบเล็กในหัวข้อและแบบใหญ่จางๆเป็นลายน้ำมุมขวาล่าง (`absolute -right-4 -bottom-4 ... text-emerald-600/5 rotate-12`) แสดง `recipe.chef_tips` เป็นข้อความ italic ในเครื่องหมายคำพูด
6. **Remarks** — แสดงเฉพาะถ้า `recipe.nutritional_info.remarks` มีค่า (เป็น optional field) พร้อมไอคอน `Info`

### `components/ChefChat.tsx`

```ts
interface ChefChatProps { recipeName: string; recipeSteps: string[]; }
interface Message { role: 'user' | 'assistant'; content: string; }
```

เป็น client component ที่มี **state ของตัวเอง แยกจาก `page.tsx` โดยสิ้นเชิง**:
- `messages: Message[]` — เริ่มต้นด้วยข้อความทักทาย 1 ข้อความจาก assistant ที่พูดถึง `recipeName` แบบ dynamic: `` `สวัสดีครับ! ผมเป็นเชฟ AI พร้อมช่วยแนะนำเรื่อง ${recipeName} มีคำถามอะไรไหมครับ?` ``
- `input: string` — ค่าที่กำลังพิมพ์ในช่องแชท
- `isLoading: boolean` — true ระหว่างรอ `/api/chat` ตอบ
- `messagesEndRef` — `useRef<HTMLDivElement>` วางไว้ท้ายสุดของลิสต์ข้อความ ใช้ร่วมกับ `useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])` เพื่อ auto-scroll ลงล่างสุดทุกครั้งที่มีข้อความใหม่เพิ่มเข้ามา (ทั้งจากผู้ใช้และจาก AI)

**`sendMessage()`:**
1. ถ้า `input` เป็นค่าว่าง (หลัง trim) หรือกำลังโหลดอยู่แล้ว → ไม่ทำอะไร (`return`)
2. สร้าง `userMsg` ใหม่ role `'user'`, ต่อเข้า `messages` เดิมเป็น `newMessages`, `setMessages(newMessages)` ทันที (แสดงข้อความผู้ใช้ขึ้นจอก่อนรอคำตอบ), เคลียร์ `input`, ตั้ง `isLoading: true`
3. `POST /api/chat` ส่ง `{ messages: newMessages, recipeName, recipeSteps }` — **ส่งประวัติแชททั้งหมดไปทุกครั้ง** ไม่ใช่แค่ข้อความล่าสุด (backend ต้องเอาทั้งหมดมาต่อท้าย system prompt เพื่อให้ AI มี context การสนทนาก่อนหน้า)
4. เอาผลลัพธ์ `data.content` มาต่อท้ายเป็น message ใหม่ role `'assistant'`
5. ถ้า fetch พัง (catch) เพิ่ม message assistant สำเร็จรูป `'ขอโทษครับ เกิดข้อผิดพลาด'` เข้าไปแทน
6. `finally` ปิด `isLoading`

**UI:** กรอบมี header เล็กๆ (จุดเขียวกระพริบ + "ถาม-ตอบกับเชฟ AI" + ตัวอย่างคำถาม), พื้นที่ข้อความ (`max-h-64 overflow-y-auto` — สูงจำกัด เลื่อนดูย้อนหลังได้) โดย bubble ของ user ชิดขวาพื้นเขียว, bubble assistant ชิดซ้ายพื้นเทา (`bg-muted`) ตอนกำลังรอคำตอบจะโชว์ bubble พิเศษที่มีจุด 3 จุดเด้งสลับกัน (`animate-bounce` พร้อม `animationDelay` ต่างกัน 0/150/300ms จำลอง "กำลังพิมพ์...") ช่องพิมพ์ด้านล่างกด Enter หรือกดปุ่ม `Send` (ไอคอนจาก lucide) เพื่อส่ง ปุ่มจะ `disabled` เมื่อ input ว่างหรือกำลังโหลด

### `components/ui/button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`

ทั้ง 4 ไฟล์นี้เป็นไฟล์ที่ **generate มาจาก shadcn/ui CLI** ไม่มี logic เฉพาะแอปเลย เป็น design-system ชั้นล่างสุดที่ component อื่นๆทั้งหมดเรียกใช้:

- **`button.tsx`** — ใช้ `class-variance-authority` (`cva`) นิยาม variant ของสไตล์ปุ่ม (`default`, `outline`, `secondary`, `ghost`, `destructive`, `link`) และขนาด (`default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`) รองรับ prop `asChild` ที่ใช้ Radix `Slot` เพื่อให้ Button ห่อ element อื่น (เช่น `<a>`) แล้วยังได้สไตล์ปุ่มแต่ไม่ได้ render `<button>` จริง — ในแอปนี้ใช้แค่ variant `default` และ `ghost`, size `default` และ `icon`
- **`card.tsx`** — export `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` เป็นกลุ่ม compound component มาตรฐานของ shadcn — แอปนี้ใช้แค่ `Card`, `CardContent`, `CardHeader`, `CardTitle`
- **`badge.tsx`** — คล้าย button แต่เป็นชิ้นเล็ก ทรง pill (`rounded-4xl`) สูง `h-5` — แอปนี้ใช้ variant `default` (ในหน้า RecipeCard ผ่าน `className` override สีเอง) และ `secondary` (ใน IngredientList)
- **`input.tsx`** — wrap `<input>` ธรรมดาด้วยสไตล์มาตรฐาน (สูง `h-8`, border, focus ring) ไม่มี logic เพิ่ม

---

## 8. รายละเอียด `lib/` (utils + supabase)

### `lib/utils.ts`

```ts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

ฟังก์ชันเดียว ใช้ทั่วทั้งโปรเจกต์ (ทุกไฟล์ใน `components/ui/`) — `clsx` รวม className หลายๆอันเข้าด้วยกัน (รองรับ conditional className แบบ object/array) แล้ว `twMerge` มาช่วย "แก้ conflict" ของ Tailwind class ที่ทับกัน (เช่นถ้ามีทั้ง `px-2` และ `px-4` ในสองที่ที่ถูก merge กัน `twMerge` จะเลือกอันที่มาหลังสุดให้ ไม่ใช่ปล่อยให้ CSS ทั้งคู่ apply แล้วชนกันมั่วๆ)

### `lib/supabase.ts` — ⚠️ พังอยู่ในสภาพปัจจุบัน

```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Recipe {
  name: string;
  ingredients: string[];
  steps: string[];
}

const ANONYMOUS_USER_ID = 'anonymous-user-001';

export async function saveRecipe(recipe: Recipe) {
  const { error } = await supabase.from('saved_recipes').insert({
    user_id: ANONYMOUS_USER_ID,
    recipe_name: recipe.name,
    ingredients: recipe.ingredients,
    instructions: recipe.steps,
  });
  if (error) console.error('Save error:', error);
}
```

- `createClient(url, anonKey)` สร้าง Supabase client ตัวเดียวระดับ module (ใช้ `NEXT_PUBLIC_*` แปลว่าค่านี้ถูก inline เข้าไปใน JS bundle ฝั่ง browser ตรงๆตอน build — ปกติของ Supabase anon key คือออกแบบให้ expose ฝั่ง client ได้อยู่แล้ว เพราะสิทธิ์การเข้าถึงจริงต้องคุมด้วย Row Level Security ที่ฝั่ง Supabase dashboard แต่โปรเจกต์นี้ไม่มีไฟล์ migration/policy ใดๆให้เห็นเลยว่าตั้ง RLS ไว้หรือยัง)
- `saveRecipe()` มี interface `Recipe` ของตัวเอง (คนละตัวกับ `Recipe` ใน `page.tsx`/`RecipeCard.tsx` — ง่ายกว่า มีแค่ `name`/`ingredients`/`steps`) แล้ว insert 1 แถวเข้าตาราง `saved_recipes` โดยใส่ `user_id` เป็นค่าคงที่เดียวกันเสมอ (ไม่มี auth จริง — ทุกคนที่ใช้แอปนี้จะปนกันในฐานะ user เดียวกัน ถ้าเปิดหน้า list เมนูที่บันทึกในอนาคต ทุกคนจะเห็นเมนูของทุกคนปนกัน)
- ฟังก์ชันนี้ **swallow error แบบเงียบๆ**: ถ้า `supabase.from().insert()` คืน error จะแค่ `console.error` ไม่ throw ต่อ — หมายความว่าฝั่ง `page.tsx`'s `handleSave()` ที่ครอบด้วย `try/catch` จะ**ไม่เคยเข้า catch จาก error นี้เลย** (เพราะ `saveRecipe` ไม่ throw) นอกจากกรณีที่ทั้งโมดูล `@supabase/supabase-js` โหลดไม่ขึ้นตั้งแต่ import ซึ่งจะพังตั้งแต่ compile/build time ไม่ใช่ runtime — พูดอีกแบบคือ ปุ่ม UI ตอนนี้ "ดูเหมือน" จะรายงาน error ผ่าน `alert('ไม่สามารถบันทึกเมนูได้')` แต่ในทางปฏิบัติแล้ว ถ้าติดตั้ง `@supabase/supabase-js` และ insert ล้มเหลวจริงๆ (เช่นตาราง `saved_recipes` ไม่มี, หรือ RLS ปฏิเสธ) ผู้ใช้จะไม่เห็น error เลย เพราะ error ถูก swallow ไปตั้งแต่ใน `saveRecipe()` แล้ว, `isSaved` จะค้างเป็น `true` (จากการ optimistic update) ทั้งที่ insert จริงไม่สำเร็จ

**บั๊กที่ยืนยันจากการตรวจสอบ `package.json`/`package-lock.json`/`node_modules` จริง:** `@supabase/supabase-js` **ไม่มีอยู่ในทั้ง 3 ที่** แปลว่า `npm install` ในสภาพปัจจุบันจะไม่ดึงแพ็กเกจนี้มาเลย และทุกครั้งที่มีโค้ดพาธไหน import `lib/supabase.ts` (ซึ่งก็คือทันทีที่ `app/page.tsx` โหลด เพราะ import แบบ static ที่หัวไฟล์) จะเกิด module-not-found error ตั้งแต่ตอน build/dev server compile ไม่ต้องรอให้ผู้ใช้กดปุ่มหัวใจด้วยซ้ำ

---

## 9. เอกสารสเปก `AI_CHEF_SPEC.md` และไฟล์ agent instructions

### `AI_CHEF_SPEC.md`

ไฟล์นี้ **ไม่ใช่โค้ด แต่เป็นเอกสารออกแบบ system prompt** ที่นิยามบุคลิกของ AI ไว้ละเอียดที่สุดในทั้งโปรเจกต์ แบ่งเป็นหัวข้อ:

- **System Persona & Tone** — บทบาท "Executive Chef de Cuisine" บุคลิกรอบรู้เรื่องวัตถุดิบ ช่างสังเกต ให้คำแนะนำใช้งานได้จริง เป็นมิตรแต่มืออาชีพ โทนการพูด 4 แบบ (Professional & Precise / Encouraging / Concise / รองรับไทยเป็นหลัก+อังกฤษ)
- **Core Objectives** 4 ข้อ — สร้างสูตรจากวัตถุดิบที่มีจริงเป็นอันดับแรก, แนะนำใช้วัตถุดิบคุ้มค่าเพื่อลด food waste, ให้ข้อมูลโภชนาการโดยประมาณ, ส่งข้อมูลกลับเป็นโครงสร้างที่ระบบ render ได้ทันที
- **Strict Rules & Constraints** 5 ข้อ (กฎเหล็ก) — ห้าม hallucinate วัตถุดิบหลัก (ยกเว้น staples), food safety ต้องมาก่อน, ปฏิเสธคำถามนอกเรื่องอาหารอย่างสุภาพ, ห้ามขอข้อมูลส่วนตัวเกินจำเป็น, ถ้าสั่งให้ตอบ JSON ห้ามมี markdown code block ปนมา
- **Output Format** — นิยาม 2 โหมด: **API Mode** (JSON schema แบบเป๊ะ ที่ `generate-recipe/route.ts` เอาไปทำ Zod schema ต่อ) และ **Chat Mode** (Markdown ที่มีกฎการใช้ `#` สำหรับชื่อเมนู, `>` สำหรับเคล็ดลับ, `- [ ]` สำหรับ checklist วัตถุดิบ — **ข้อสังเกตสำคัญ:** กฎ Chat Mode นี้ไม่ได้ถูกนำไปใช้จริงใน `app/api/chat/route.ts` เลย เพราะ system prompt จริงในนั้นเขียนสั้นกว่ามากและไม่ได้พูดถึง markdown formatting convention ข้อนี้)
- **Edge Cases & Error Handling** — 3 กรณี: วัตถุดิบไม่พอ (ให้แนะนำเมนูใกล้เคียงที่สุดพร้อมบอกว่าต้องซื้อเพิ่มอะไร), input ไร้สาระที่ไม่ใช่ของกิน เช่น "ยางรถยนต์"/"ตะปู" (ให้ปฏิเสธอย่างสุภาพด้วยประโยคที่กำหนดไว้ตรงๆ), คำถามกำกวม (ให้ AI ถามกลับเพื่อตีกรอบก่อน) — **ข้อสังเกต:** edge case ทั้ง 3 นี้เป็น "ความตั้งใจ" ที่เขียนไว้ในเอกสาร แต่ system prompt จริงใน `generate-recipe/route.ts` สั้นกว่ามากและไม่ได้พูดถึง edge case เหล่านี้ตรงๆ (ต้องหวังพึ่ง general instruction "food safety first" ให้ครอบคลุมโดยอนุมาน) แปลว่าพฤติกรรมจริงของแอปตอนนี้อาจไม่ตรงกับที่ `AI_CHEF_SPEC.md` สัญญาไว้เป๊ะ 100%
- **Examples** — ตัวอย่าง 1 ชุด (input: "มีไข่ไก่ 2 ฟอง, ปลากระป๋อง, ผักกาดขาว" → output ตัวอย่างคำตอบสไตล์เชฟ)

**สรุปความสัมพันธ์:** `AI_CHEF_SPEC.md` คือ "เอกสารต้นแบบ/ideal spec" ส่วน system prompt จริงที่ฝังอยู่ใน 3 ไฟล์ `route.ts` เป็นเวอร์ชัน **ย่อ/ถอดความบางส่วน** จากเอกสารนี้ ไม่ใช่การอ้างอิงไฟล์ตรงๆ (เพราะไฟล์ `.md` นี้ไม่ได้ถูก import หรืออ่านที่ runtime เลย — เป็นแค่เอกสารอ้างอิงสำหรับคนเขียนโค้ด/AI agent ที่มาช่วยพัฒนาเท่านั้น)

### `AGENTS.md`

```
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure
may all differ from your training data. Read the relevant guide in
node_modules/next/dist/docs/ before writing any code. Heed deprecation notices.
```

ไม่เกี่ยวกับฟีเจอร์ของแอปเลย — เป็นคำเตือนที่ฝากไว้ให้ AI coding agent (เช่น Claude Code, Gemini CLI, Cursor ฯลฯ) ที่มาช่วยแก้โค้ดในโปรเจกต์นี้ในอนาคต ให้ไปอ่านเอกสารจริงใน `node_modules/next/dist/docs/` ก่อนเขียนโค้ดใดๆ เพราะ Next.js เวอร์ชัน 16.2.6 ที่ใช้อยู่ (ณ เวลาที่เขียนไฟล์นี้) ใหม่กว่าข้อมูลที่โมเดล AI ส่วนใหญ่เคยเทรนมา อาจมี API/convention ที่เปลี่ยนไปจากที่ AI "จำ" ไว้

### `CLAUDE.md`

มีเนื้อหาเดียวคือ `@AGENTS.md` — เป็น syntax ของ Claude Code ที่แปลว่า "ให้ไปอ่านเนื้อหาของไฟล์ `AGENTS.md` มาใช้แทน" กันไม่ต้องเขียนซ้ำสองที่

---

## 10. ตัวแปรสิ่งแวดล้อม (Environment Variables)

เก็บไว้ในไฟล์ `.env.local` (git-ignore ไว้ตาม `.gitignore` — ไม่ถูก commit ขึ้น repo ไม่มีไฟล์ `.env.example` ให้ดูโครงด้วย)

| ตัวแปร | ใช้ที่ไฟล์ | จำเป็นหรือไม่ |
|---|---|---|
| `GROQ_API_KEY` | `app/api/generate-recipe/route.ts`, `app/api/chat/route.ts`, `app/api/vision/route.ts` (ทั้ง 3 ไฟล์ อ่านตรงผ่าน `process.env.GROQ_API_KEY`) | ✅ **จำเป็นที่สุด** — ถ้าไม่มี/ผิด ทุกฟีเจอร์หลักของแอปจะพังหมด (สร้างเมนูไม่ได้, แชทไม่ได้, สแกนรูปไม่ได้) |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase.ts` | ✅ จำเป็นสำหรับฟีเจอร์บันทึกเมนู (แต่ตอนนี้พังจากสาเหตุอื่นอยู่ดี — ดูหัวข้อ 11) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase.ts` | ✅ เช่นเดียวกับข้างบน |
| `GEMINI_API_KEY` | **ไม่ถูกอ้างถึงในโค้ดที่ไหนเลย** | ❌ ไม่จำเป็น — ของเก่าที่หลงเหลือ (ดูหัวข้อ AI_CHEF_SPEC.md) |
| `ANTHROPIC_API_KEY` | **ไม่ถูกอ้างถึงในโค้ดที่ไหนเลย** | ❌ ไม่จำเป็น — ของเก่าที่หลงเหลือ |

หมายเหตุ: `NEXT_PUBLIC_*` prefix เป็น convention ของ Next.js ที่บอกว่าตัวแปรนี้จะถูก inline เข้า JS bundle ฝั่ง browser ได้ (ไม่ใช่ secret ที่ปลอดภัย 100% ถ้าเผลอใส่ secret จริงเข้าตัวแปรที่มี prefix นี้จะรั่วไปอยู่ใน bundle ที่ใครก็เปิดดูได้) ส่วน `GROQ_API_KEY` ไม่มี prefix นี้ แปลว่าอ่านได้แค่ฝั่ง server (API routes) เท่านั้น ปลอดภัยกว่า

---

## 11. จุดที่ยังไม่สมบูรณ์ / บั๊กที่ยืนยันแล้ว

1. **ปุ่มบันทึกเมนู (หัวใจ) พังทั้งระบบ ณ ปัจจุบัน** — `lib/supabase.ts` import `@supabase/supabase-js` แต่แพ็กเกจนี้ไม่มีอยู่จริงใน `package.json`/`package-lock.json`/`node_modules` การ `npm install` มาตรฐานจะไม่ได้แพ็กเกจนี้มา และเพราะ `app/page.tsx` import `saveRecipe` แบบ static ที่หัวไฟล์ ผลคือ **แอปทั้งตัวจะพังตั้งแต่ compile/dev-server ไม่ต้องรอกดปุ่มหัวใจด้วยซ้ำ** — ทางแก้: รัน `npm install @supabase/supabase-js`
2. **ไม่มีตาราง `saved_recipes` เตรียมไว้เลย** — ไม่มีไฟล์ SQL migration หรือ schema ในโปรเจกต์ ต้องไปสร้างตารางด้วยมือในหน้า Supabase dashboard เอง (คอลัมน์ที่ต้องมีอย่างน้อย: `user_id`, `recipe_name`, `ingredients`, `instructions`)
3. **ไม่มีหน้าดูเมนูที่บันทึกไว้** — แม้ insert สำเร็จก็ไม่มีที่ไหนใน UI ดึงข้อมูลจากตาราง `saved_recipes` มาแสดง เป็นแค่ทาง "เขียน" ทางเดียว
4. **`saveRecipe()` swallow error เงียบๆ** — ถ้า insert ล้มเหลวจริง (เช่น RLS ปฏิเสธ) ฟังก์ชันแค่ `console.error` ไม่ throw แปลว่า `handleSave()` ใน `page.tsx` จะไม่เข้า `catch` และ `isSaved` จะค้างเป็น `true` (ปุ่มหัวใจแดง) ทั้งที่ insert จริงไม่สำเร็จ — UI จะโกหกผู้ใช้ว่าบันทึกสำเร็จ
5. **ไม่มีระบบผู้ใช้จริง** — `ANONYMOUS_USER_ID = 'anonymous-user-001'` เป็นค่าคงที่เดียวสำหรับทุกคนที่ใช้แอป ถ้าในอนาคตเปิดฟีเจอร์ดูเมนูที่บันทึกไว้ ทุกคนจะเห็นเมนูของทุกคนปนกันหมด
6. **Dependency เกินความจำเป็นใน `package.json`** — `@anthropic-ai/sdk`, `@google/generative-ai`, `@ai-sdk/google`, `ai` ถูกประกาศไว้แต่ไม่มีการ `import` ใช้งานที่ไหนในซอร์สโค้ดเลย เพิ่มขนาด `node_modules`/เวลา install โดยไม่จำเป็น ลบออกได้เลย
7. **`zod` ไม่ได้ประกาศตรงใน `package.json`** — ใช้งานจริงใน `generate-recipe/route.ts` ผ่าน `import { z } from 'zod'` แต่เป็น transitive dependency (มาจาก `groq-sdk`/`ai`) เท่านั้น ถ้าวันหนึ่ง dependency ต้นทางเปลี่ยนเวอร์ชันจนไม่พา `zod` ติดมาด้วย โค้ดจะพังทันทีแบบหาสาเหตุยาก ควรเพิ่ม `"zod": "^..."` เข้า `dependencies` ตรงๆ
8. **Metadata ของหน้าเว็บยังเป็นค่า default** — `app/layout.tsx` ยัง `title: "Create Next App"` / `description: "Generated by create next app"` และ `<html lang="en">` ทั้งที่เนื้อหาทั้งหมดเป็นภาษาไทย ควรเปลี่ยนเป็นชื่อแอปจริงและ `lang="th"`
9. **`public/` ยังเป็นไอคอนตัวอย่างของ create-next-app** (`next.svg`, `vercel.svg` ฯลฯ) — ไม่มีโลโก้/favicon ของแอปจริงที่ตั้งใจทำ ยกเว้น `favicon.ico` เดิม
10. **Dark mode เตรียมตัวแปรสีไว้ใน `globals.css` (`.dark { ... }`) แต่ไม่มีจุดไหนใน UI ที่ toggle class `.dark` เลย** — ฟีเจอร์สลับธีมมืดไม่ได้ถูกเปิดใช้งานจริง ถึงจะพร้อมทางเทคนิคแล้วก็ตาม
11. **สีจริงของ UI (เขียวมรกต/ครีม/อำพัน) เขียนเป็น Tailwind utility ตรงในแต่ละไฟล์ ไม่ได้ผ่านตัวแปรธีมของ shadcn** — ถ้าจะเปลี่ยนธีมสีต้องไล่แก้ทีละ component ไม่สามารถแก้จุดเดียวใน `globals.css` ได้
12. **`Recipe` interface ถูกประกาศซ้ำ 3 ที่แยกกัน** (`app/page.tsx`, `components/RecipeCard.tsx`, และโดยนัยใน `RecipeSchema` ของ `generate-recipe/route.ts`) ไม่มี type กลางไฟล์เดียวที่แชร์กัน — ถ้าจะแก้โครงสร้างข้อมูลเมนูต้องไล่แก้ให้ตรงกันทั้ง 3 ที่ด้วยมือ
13. **field `is_staple` ของวัตถุดิบมีอยู่ใน data แต่ `RecipeCard.tsx` ไม่ได้เอาไปแสดงผลอะไรเลย** — เก็บมาเปล่าๆ
14. **`/api/vision` ไม่ validate ว่าค่าที่ AI ตอบมาเป็นชื่ออาหารที่สมเหตุสมผลจริงหรือไม่** — ถ้าโมเดลตอบมีคำอธิบายแทรกมาแทนรายชื่อล้วนๆ ข้อความนั้นจะถูก split เข้าไปเป็น "วัตถุดิบ" ในลิสต์ตรงๆโดยไม่มีการกรองซ้ำ

---

## 12. วิธีรันโปรเจกต์

```bash
cd fridge-menu
npm install
# (แนะนำ) ติดตั้งแพ็กเกจที่ขาดเพื่อให้ฟีเจอร์บันทึกเมนูใช้ได้:
npm install @supabase/supabase-js

# สร้างไฟล์ .env.local แล้วเติมอย่างน้อย:
#   GROQ_API_KEY=...
#   NEXT_PUBLIC_SUPABASE_URL=...
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=...

npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000) — หน้าแรกที่เห็นคือหน้าเดียวของทั้งแอป (`app/page.tsx`) ตามที่อธิบายไว้ในหัวข้อ 5

คำสั่งอื่นที่มีใน `package.json`: `npm run build` (build production), `npm run start` (รัน production build), `npm run lint` (รัน ESLint ตามกฎ `eslint-config-next`)
