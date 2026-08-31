'use client';

import { useState } from 'react';
import { ChefHat, Heart, Loader2, ChevronDown, ChevronUp, LogIn, Trash2 } from 'lucide-react';
import {
  DeleteNotAllowedError,
  deleteSavedRecipe,
  getSavedRecipes,
  type SavedRecipe,
} from '@/lib/supabase';
import { startSignIn } from '@/lib/authDialog';
import { signInButtonLabel } from '@/lib/mockAuth';
import { useUser } from '@/lib/useUser';
import { Button } from '@/components/ui/button';
import { savedRecipeToRecipe } from '@/lib/savedRecipe';
import type { Recipe } from '@/lib/types';

interface SavedRecipesProps {
  // กดแล้วพาเข้าโหมดทำอาหารด้วยสูตรที่บันทึกไว้ พร้อมจำนวนคนที่บันทึกไว้ตอนนั้น
  // ไม่ส่งมา = ไม่ขึ้นปุ่ม (แผงนี้ยังใช้ดู/ลบได้ตามเดิม)
  onCookAgain?: (recipe: Recipe, servings: number) => void;
}

export function SavedRecipes({ onCookAgain }: SavedRecipesProps) {
  const { user, isLoading: isAuthLoading } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // เก็บไว้ด้วยว่ารายการนี้เป็นของบัญชีไหน เพื่อจะได้ทิ้งทันทีที่คนล็อกอินเปลี่ยน
  // (ไม่ต้องใช้ useEffect คอยล้าง — เทียบตอน render เอาเลย)
  const [loaded, setLoaded] = useState<{ userId: string; recipes: SavedRecipe[] } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // id ที่กดลบไปแล้วรอยืนยัน — ถามซ้ำก่อนลบเพราะเมนูที่บันทึกไว้เรียกคืนไม่ได้
  // ใช้การเปลี่ยนปุ่มเป็น "แน่ใจนะ? ลบเลย" แทน confirm() ของเบราว์เซอร์
  // เพราะ confirm() เป็น dialog แบบ blocking แบบเดียวกับ alert() ที่เคยทำหน้าเว็บค้างมาแล้ว
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // ผูก error ไว้กับ id ของรายการที่กดลบ ไม่ใช่เก็บเป็นข้อความลอยๆ
  // (ถ้าเก็บลอยๆ แล้ว render อยู่ใน map ข้อความเดียวกันจะไปโผล่ใต้ทุกรายการพร้อมกัน)
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteSavedRecipe(id);
      // ตัดออกจากรายการที่โหลดไว้แทนการยิงโหลดใหม่ทั้งชุด — เร็วกว่าและไม่ทำให้
      // ที่พับ/กางของรายการอื่นเด้งกลับ
      setLoaded(prev =>
        prev ? { ...prev, recipes: prev.recipes.filter(r => r.id !== id) } : prev
      );
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      setDeleteError({
        id,
        message:
          err instanceof DeleteNotAllowedError
            ? err.message
            : 'ลบเมนูไม่สำเร็จ ลองใหม่อีกครั้ง',
      });
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  }

  // กดออกจากระบบแล้วรายการของคนเก่าต้องหายจากจอทันที ไม่ค้างให้คนถัดไปที่ใช้เครื่องเห็น
  const recipes = loaded && loaded.userId === user?.id ? loaded.recipes : null;

  async function handleToggle() {
    const willOpen = !isOpen;
    setIsOpen(willOpen);

    // ยังไม่ล็อกอินก็ไม่มีอะไรให้โหลด (แผงจะขึ้นปุ่มชวนล็อกอินแทน)
    // และถ้าโหลดของบัญชีนี้ไว้แล้วก็ไม่ต้องยิงซ้ำ
    if (!willOpen || !user || loaded?.userId === user.id) return;

    setIsLoading(true);
    setError('');
    try {
      setLoaded({ userId: user.id, recipes: await getSavedRecipes() });
    } catch {
      setError('ไม่สามารถโหลดเมนูที่บันทึกไว้ได้');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
      >
        <Heart className="w-3.5 h-3.5" />
        เมนูที่บันทึกไว้
        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {isOpen && (
        <div className="mt-3 border rounded-xl divide-y bg-background">
          {/* ยังไม่ล็อกอิน: เมนูที่บันทึกผูกกับบัญชี เลยไม่มีอะไรให้แสดง */}
          {!isAuthLoading && !user && (
            <div className="flex flex-col items-center gap-3 py-6 px-4 text-center">
              <p className="text-sm text-muted-foreground">
                เข้าสู่ระบบเพื่อดูเมนูที่บันทึกไว้
                <br />
                <span className="text-xs">ใช้แอปหาเมนูได้ตามปกติโดยไม่ต้องล็อกอิน</span>
              </p>
              <Button size="sm" variant="outline" onClick={() => startSignIn()}>
                <LogIn className="w-3.5 h-3.5 mr-2" /> {signInButtonLabel}
              </Button>
            </div>
          )}

          {user && isLoading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด...
            </div>
          )}

          {user && !isLoading && error && (
            <p className="py-6 text-center text-sm text-chili">{error}</p>
          )}

          {user && !isLoading && !error && recipes?.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              ยังไม่มีเมนูที่บันทึกไว้
            </p>
          )}

          {user &&
            !isLoading &&
            recipes?.map(r => {
              const isExpanded = expandedId === r.id;
              return (
                <div key={r.id} className="p-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      className="flex flex-1 items-center justify-between gap-2 text-left min-w-0"
                    >
                      <span className="text-sm font-medium truncate">{r.recipe_name}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                    </button>

                    {pendingDeleteId === r.id ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleDelete(r.id)}
                          disabled={deletingId === r.id}
                        >
                          {deletingId === r.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'ลบเลย'
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={() => setPendingDeleteId(null)}
                          disabled={deletingId === r.id}
                        >
                          ยกเลิก
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setPendingDeleteId(r.id);
                          setDeleteError(null);
                        }}
                        className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-chili/10 hover:text-chili"
                        aria-label={`ลบ ${r.recipe_name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* error ของการลบต้องอยู่ติดรายการที่กด ไม่ใช่ลอยอยู่หัวแผง
                      ไม่งั้นคนที่มีเมนูบันทึกไว้หลายสิบอันจะไม่เห็นว่ามันพูดถึงอันไหน */}
                  {deleteError?.id === r.id && (
                    <p className="mt-2 rounded-lg border border-chili/20 bg-chili/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-chili">
                      {deleteError.message}
                    </p>
                  )}

                  {isExpanded && (
                    <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-1">วัตถุดิบ</p>
                        <p>{r.ingredients.join(', ')}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-1">ขั้นตอนการทำ</p>
                        <ol className="list-decimal list-inside space-y-1">
                          {r.instructions.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                      </div>

                      {/* เหตุผลที่คนเปิดดูเมนูที่บันทึกไว้ ส่วนใหญ่คือ "จะทำอันนี้อีก"
                          เดิมกางออกมาแล้วอ่านได้อย่างเดียว ต้องเลื่อนดูขั้นตอนเองทั้งหมด
                          ทั้งที่โหมดทำอาหาร (ทีละขั้น ตัวใหญ่ จับเวลา จอไม่ดับ) มีอยู่แล้ว */}
                      {onCookAgain && (
                        <Button
                          variant="outline"
                          className="h-10 w-full"
                          onClick={() => {
                            const { recipe, servings } = savedRecipeToRecipe(r);
                            onCookAgain(recipe, servings);
                          }}
                        >
                          <ChefHat className="mr-2 h-4 w-4" /> ทำซ้ำอีกรอบ
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
