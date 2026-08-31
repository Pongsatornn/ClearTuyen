'use client';

import { ChevronRight, Loader2, ShoppingCart, Timer } from 'lucide-react';
import { Badge } from './ui/badge';
import type { MenuSuggestion } from '@/lib/types';
import { DIFFICULTY_BADGE_CLASS, DIFFICULTY_DOT_CLASS, DIFFICULTY_LABEL } from '@/lib/utils';

interface MenuListProps {
  menus: MenuSuggestion[];
  onSelect: (menu: MenuSuggestion) => void;
  // ชื่อเมนูที่กำลังรอสูตรเต็มอยู่ (null = ไม่ได้รออะไร)
  // ใช้ทั้งโชว์ spinner ที่การ์ดนั้นและล็อกการ์ดอื่นไม่ให้กดซ้อนจนได้สูตรผิดเมนู
  loadingMenuName: string | null;
}

export function MenuList({ menus, onSelect, loadingMenuName }: MenuListProps) {
  const isBusy = loadingMenuName !== null;

  return (
    <div className="space-y-2.5">
      {menus.map(menu => {
        const isLoading = loadingMenuName === menu.recipe_name;
        const needsShopping = menu.missing_ingredients.length > 0;

        return (
          <button
            key={menu.recipe_name}
            onClick={() => onSelect(menu)}
            disabled={isBusy}
            className="group w-full rounded-xl border border-line bg-steam p-4 text-left transition-all hover:-translate-y-px hover:border-basil/40 hover:shadow-[0_6px_20px_-12px_rgba(18,36,30,0.5)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-basil disabled:pointer-events-none disabled:opacity-55"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-2.5">
                {/* จุดสีตามความยาก — กวาดสายตาหาเมนูง่ายๆ เจอโดยไม่ต้องอ่าน badge ทีละใบ */}
                <span
                  className={`mt-[0.4rem] h-2 w-2 shrink-0 rounded-full ${DIFFICULTY_DOT_CLASS[menu.difficulty]}`}
                  aria-hidden
                />
                <div className="min-w-0 space-y-1">
                  <p className="font-[family-name:var(--font-display-family)] text-[1.0625rem] font-semibold leading-snug text-deep">
                    {menu.recipe_name}
                  </p>
                  <p className="text-[13px] leading-relaxed text-ash">
                    {menu.short_description}
                  </p>
                </div>
              </div>

              {isLoading ? (
                <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-basil" />
              ) : (
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-line transition-transform group-hover:translate-x-0.5 group-hover:text-basil" />
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[1.125rem]">
              <Badge className={`font-medium ${DIFFICULTY_BADGE_CLASS[menu.difficulty]}`}>
                {DIFFICULTY_LABEL[menu.difficulty]}
              </Badge>
              <span className="flex items-center gap-1 text-xs text-ash">
                <Timer className="h-3 w-3" />
                <span className="num">{menu.estimated_time}</span> นาที
              </span>

              {/* จุดตัดสินใจจริงของคนล้างตู้เย็นคือ "ต้องออกไปซื้อของเพิ่มไหม"
                  เลยดันขึ้นมาให้เห็นตั้งแต่ในลิสต์ — และให้เฉพาะกรณีที่ "ต้องซื้อ" เท่านั้นที่มีสี
                  ถ้าใส่สีทั้งสองแบบ ป้ายจะกลายเป็นของประดับที่ไม่มีใครอ่าน */}
              {needsShopping ? (
                <span className="flex items-center gap-1 text-xs font-medium text-[#8a5a12]">
                  <ShoppingCart className="h-3 w-3" />
                  ต้องซื้อ: {menu.missing_ingredients.join(', ')}
                </span>
              ) : (
                <span className="text-xs text-ash/80">ของครบแล้ว</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
