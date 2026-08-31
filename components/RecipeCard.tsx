import { useState } from 'react';
import { Heart, Timer, ChefHat, Info, Minus, Plus, Users, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import type { Recipe, SaveResult } from '@/lib/types';
import {
  DIFFICULTY_BADGE_CLASS,
  DIFFICULTY_LABEL,
  MAX_SERVINGS,
  MIN_SERVINGS,
  formatNutritionValue,
  scaleAmountText,
  servingsFactor,
} from '@/lib/utils';

interface RecipeCardProps {
  recipe: Recipe;
  // จำนวนคนที่ผู้ใช้เลือกตอนนี้ (อาจไม่เท่า recipe.servings ที่ AI เขียนสูตรมาให้)
  servings: number;
  onServingsChange: (servings: number) => void;
  isSaved: boolean;
  // คืนผลลัพธ์ออกมาเพื่อให้การ์ดขึ้นข้อความยืนยันได้เองตรงจุดที่กด
  // (หน้าสูตรยาวเกินหนึ่งจอ ถ้าผลไปโผล่ที่อื่นคนกดจะไม่เห็นว่ามีอะไรเกิดขึ้น)
  onSave: () => Promise<SaveResult>;
}

export function RecipeCard({
  recipe,
  servings,
  onServingsChange,
  isSaved,
  onSave,
}: RecipeCardProps) {
  const difficultyColor = DIFFICULTY_BADGE_CLASS[recipe.difficulty];
  const factor = servingsFactor(servings, recipe.servings);

  // รอบรีวิว 30 ก.ค. ข้อ 3: "กดปุ่มหัวใจแล้วไม่มีอะไรเกิดขึ้นบนจอ" — หัวใจเปลี่ยนสีอย่างเดียว
  // ไม่พอ เพราะไอคอนเล็กและคนกดกำลังมองหา "คำยืนยัน" ไม่ใช่การเปลี่ยนเฉดสี
  // ผลลัพธ์เลยต้องเป็นข้อความ และต้องอยู่ติดปุ่ม ไม่ใช่ท้ายหน้าใต้สูตรทั้งเก้าขั้น
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  async function handleSaveClick() {
    setIsSaving(true);
    setSaveMessage('');
    try {
      const result = await onSave();
      if (result === 'saved') setSaveMessage('เก็บไว้แล้ว ดูได้ที่ "เมนูที่บันทึกไว้"');
      // อีก 2 กรณี (ต้องล็อกอิน / เซฟไม่สำเร็จ) หน้าสูตรขึ้นกล่องของตัวเองเหนือการ์ดอยู่แล้ว
      // ถ้าขึ้นซ้ำตรงนี้ด้วยจะกลายเป็นสองข้อความพูดเรื่องเดียวกันคนละที่
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden border-none shadow-[0_18px_50px_-30px_rgba(18,36,30,0.85)]">
      {/* หัวการ์ดใช้สีหมึกเข้ม (--deep) ไม่ใช่เขียวสด — ชื่อจานควรอ่านเหมือนป้ายเมนู
          ไม่ใช่แบนเนอร์โฆษณา และทำให้ปุ่มหัวใจสีแดงเด่นขึ้นมาจากพื้นหลังได้จริง */}
      <CardHeader className="bg-deep p-6 text-white">
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge className={`font-medium ${difficultyColor}`}>
                {DIFFICULTY_LABEL[recipe.difficulty]}
              </Badge>
              <span className="flex items-center gap-1 text-xs text-white/70">
                <Timer className="w-3 h-3" /> <span className="num">{recipe.estimated_time}</span> นาที
              </span>
              <span className="flex items-center gap-1 text-xs text-white/70">
                <Users className="w-3 h-3" /> <span className="num">{servings}</span> คน
              </span>
            </div>
            <CardTitle className="font-[family-name:var(--font-display-family)] text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-white">
              {recipe.recipe_name}
            </CardTitle>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSaveClick}
              disabled={isSaving}
              aria-label={isSaved ? 'เก็บสูตรนี้ไว้แล้ว' : 'เก็บสูตรนี้ไว้'}
              className={`rounded-full hover:bg-white/15 ${isSaved ? 'text-chili' : 'text-white/60'}`}
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Heart className={`w-5 h-5 ${isSaved ? 'fill-chili text-chili' : ''}`} />
              )}
            </Button>
            {saveMessage && (
              <span className="max-w-[150px] text-right text-[11px] leading-tight text-white/75">
                {saveMessage}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-8 bg-steam p-6">
        {/* Nutritional Info Summary
            เดิมโชว์แค่ "CALORIES 250 / PROTEIN 20" ลอยๆ ซึ่งอ่านแล้วไม่รู้ว่า 20 คืออะไร
            และไม่รู้ว่าเป็นค่าทั้งจานหรือต่อคน — ตอนนี้ตกลงกับ AI ว่าเป็นค่าต่อ 1 คนเสมอ
            (ค่าต่อคนจึงไม่ขยับตามปุ่มปรับจำนวนคน มีแต่ปริมาณวัตถุดิบที่ขยับ) */}
        <div className="grid grid-cols-2 divide-x divide-line rounded-xl border border-line bg-chill/60">
          <div className="px-4 py-3">
            <p className="eyebrow mb-1">พลังงาน / คน</p>
            <p className="num text-xl font-semibold text-deep">
              {formatNutritionValue(recipe.nutritional_info.calories, 'kcal')}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="eyebrow mb-1">โปรตีน / คน</p>
            <p className="num text-xl font-semibold text-deep">
              {formatNutritionValue(recipe.nutritional_info.protein, 'กรัม')}
            </p>
          </div>
        </div>

        {/* Ingredients */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="h-3.5 w-1 rounded-full bg-basil" />
            <h3 className="eyebrow !text-deep">วัตถุดิบที่ต้องใช้</h3>
          </div>

          {/* ปุ่มปรับจำนวนคนกิน วางติดหัวข้อวัตถุดิบเพราะปริมาณด้านล่างคือสิ่งที่ขยับตาม
              ถ้าไปวางบนสุดของการ์ดคนจะกดแล้วไม่เห็นว่ามีอะไรเปลี่ยน */}
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-basil/20 bg-basil-soft p-3">
            <div className="flex min-w-0 items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-basil" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-basil">
                  ทำให้กิน <span className="num">{servings}</span> คน
                </p>
                <p className="text-[11px] text-basil/75">ปรับได้ ปริมาณข้างล่างจะคิดให้ใหม่</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 rounded-full bg-steam"
                onClick={() => onServingsChange(servings - 1)}
                disabled={servings <= MIN_SERVINGS}
                aria-label="ลดจำนวนคน"
              >
                <Minus className="w-3.5 h-3.5" />
              </Button>
              <span className="num w-8 text-center text-base font-semibold text-basil">
                {servings}
              </span>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 rounded-full bg-steam"
                onClick={() => onServingsChange(servings + 1)}
                disabled={servings >= MAX_SERVINGS}
                aria-label="เพิ่มจำนวนคน"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {recipe.ingredients.map((ing, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 border-b border-line/70 pb-2"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm text-deep">{ing.item}</span>
                  {ing.is_staple && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      ของพื้นฐาน
                    </Badge>
                  )}
                </div>
                <span className="num shrink-0 text-xs font-medium text-ash">
                  {scaleAmountText(ing, factor)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div>
          <div className="flex items-center gap-2 mb-5">
            <span className="h-3.5 w-1 rounded-full bg-yolk" />
            <h3 className="eyebrow !text-deep">ขั้นตอนการทำ</h3>
          </div>
          <div className="space-y-4">
            {recipe.instructions.map((step, i) => (
              <div key={i} className="flex gap-4 group">
                <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-chill/70 text-sm font-semibold text-ash transition-colors group-hover:border-basil group-hover:bg-basil group-hover:text-white">
                  {i + 1}
                </span>
                <p className="pt-1 text-sm leading-relaxed text-deep/85">
                  {step}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Chef's Tips */}
        <div className="relative overflow-hidden rounded-2xl bg-deep p-5 text-white">
          <ChefHat className="absolute -bottom-5 -right-4 h-24 w-24 rotate-12 text-white/[0.06]" />
          <div className="mb-2 flex items-center gap-2">
            <ChefHat className="h-4 w-4 text-yolk" />
            <h4 className="eyebrow !text-yolk">เคล็ดลับจากเชฟ</h4>
          </div>
          <p className="relative text-sm leading-relaxed text-white/85">
            {recipe.chef_tips}
          </p>
        </div>

        {/* Remarks/Disclaimer */}
        {recipe.nutritional_info.remarks && (
          <div className="flex gap-2 rounded-lg bg-chill/60 p-3 text-ash">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-[11px] leading-snug">
              {recipe.nutritional_info.remarks}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
