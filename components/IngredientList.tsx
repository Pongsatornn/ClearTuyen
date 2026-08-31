import { Clock, X } from 'lucide-react';
import { Badge } from './ui/badge';

interface IngredientListProps {
  ingredients: string[];
  onRemove: (index: number) => void;
  onClearAll: () => void;
  // ของที่ผู้ใช้ติดธงว่า "ใกล้เสีย ใช้ก่อน" — เก็บเป็นชื่อไม่ใช่ index
  // เพราะ index เลื่อนทุกครั้งที่ลบของออกจากลิสต์ แล้วธงจะไปติดผิดชิ้น
  priorityIngredients: string[];
  onTogglePriority: (ingredient: string) => void;
}

export function IngredientList({
  ingredients,
  onRemove,
  onClearAll,
  priorityIngredients,
  onTogglePriority,
}: IngredientListProps) {
  const hasPriority = priorityIngredients.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground/60">
          {ingredients.length > 0 && `${ingredients.length} รายการ`}
        </span>
        {ingredients.length > 0 && (
          <button
            onClick={onClearAll}
            className="text-xs text-ash transition-colors hover:text-chili"
          >
            ล้างทั้งหมด
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 min-h-[32px]">
        {ingredients.length === 0 ? (
          <p className="text-sm text-muted-foreground/60">
            ยังไม่มีวัตถุดิบ — ลองพิมพ์อะไรสักอย่าง
          </p>
        ) : (
          ingredients.map((ing, i) => {
            const isPriority = priorityIngredients.includes(ing);
            return (
              <Badge
                key={i}
                variant="secondary"
                className={`gap-1.5 pl-2 pr-2 py-1 ${
                  isPriority ? 'bg-yolk/25 text-[#8a5a12] hover:bg-yolk/25' : ''
                }`}
              >
                {/* ธง "ใช้ก่อน" อยู่หน้าชื่อ ไม่ใช่หลัง เพื่อไม่ให้ชนกับปุ่ม × ที่อยู่ท้าย
                    (นิ้วโป้งบนมือถือกดพลาดข้ามปุ่มง่ายมากถ้าปุ่มทำลายกับปุ่มไม่ทำลายอยู่ติดกัน) */}
                <button
                  onClick={() => onTogglePriority(ing)}
                  aria-label={isPriority ? `เอาธงใช้ก่อนออกจาก ${ing}` : `ติดธงใช้ก่อนให้ ${ing}`}
                  aria-pressed={isPriority}
                  title={isPriority ? 'ใกล้เสีย — จะถูกใช้ก่อน' : 'ติดธงว่าใกล้เสีย ให้ใช้ก่อน'}
                  className={`rounded-full transition-colors ${
                    isPriority
                      ? 'text-[#8a5a12]'
                      : 'text-muted-foreground/40 hover:text-[#8a5a12]'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                </button>

                {ing}

                <button
                  onClick={() => onRemove(i)}
                  aria-label={`ลบ ${ing}`}
                  className="rounded-full hover:text-chili transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            );
          })
        )}
      </div>

      {/* บอกวิธีใช้เฉพาะตอนที่ยังไม่มีใครติดธงเลย พอเริ่มใช้เป็นแล้วก็ไม่ต้องสอนซ้ำ
          แอปชื่อ "ล้างตู้เย็น" แต่เดิมไม่มีอะไรช่วยจัดลำดับว่าควรรีบใช้อะไรก่อนเลย
          ทั้งที่นั่นคือหัวใจของการล้างตู้เย็น (รอบรีวิว 30 ก.ค. หัวข้อ 3) */}
      {ingredients.length > 0 && !hasPriority && (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground/70">
          <Clock className="w-3 h-3 shrink-0" />
          กดรูปนาฬิกาหน้าชื่อของที่ใกล้เสีย เพื่อให้ระบบเน้นเมนูที่ใช้ของชิ้นนั้นก่อน
        </p>
      )}

      {hasPriority && (
        <p className="mt-2 flex items-center gap-1 text-xs text-[#8a5a12]">
          <Clock className="w-3 h-3 shrink-0" />
          จะเน้นเมนูที่ได้ใช้ <strong>{priorityIngredients.join(', ')}</strong> ก่อน
        </p>
      )}
    </div>
  );
}
