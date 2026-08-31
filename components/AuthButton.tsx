'use client';

import { useState } from 'react';
import { LogIn, LogOut, Loader2, Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/supabase';
import { startSignIn } from '@/lib/authDialog';
import { isMockAuthEnabled, signInButtonLabel, MOCK_ACCOUNTS, mockSignIn } from '@/lib/mockAuth';
import { useUser } from '@/lib/useUser';

/**
 * ปุ่มเข้าสู่ระบบ/ออกจากระบบมุมบนของหน้า
 *
 * แอปนี้ไม่บังคับล็อกอินเพื่อใช้งาน — ล็อกอินมีผลกับ "เมนูที่บันทึกไว้" เท่านั้น
 * ปุ่มนี้เลยดีไซน์ให้เงียบๆ ไม่แย่งความสนใจจากช่องใส่วัตถุดิบซึ่งเป็นงานหลัก
 *
 * ในโหมดจำลองมีลิสต์ให้เลือกว่าจะเป็นบัญชีไหน (และสลับได้ทั้งที่ล็อกอินอยู่)
 * เพื่อทดสอบว่าเมนูที่บันทึกไว้ของแต่ละบัญชีแยกกันจริง — โหมดปกติไม่มีส่วนนี้
 */
export function AuthButton() {
  const { user, isLoading } = useUser();
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');
  // โหมดจำลองมีหลายบัญชี จึงต้องมีขั้น "เลือกก่อน" คั่น ไม่ใช่กดปุ่มแล้วล็อกอินเลย
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  function handleSignIn() {
    // โหมดจำลอง: ไม่ล็อกอินทันที เปิดลิสต์ให้เลือกว่าจะเป็นใครก่อน
    if (isMockAuthEnabled) {
      setIsPickerOpen(true);
      return;
    }

    // โหมดปกติ: กล่องเข้าสู่ระบบรับช่วงต่อทั้งหมด (ฟอร์มอีเมล/รหัสผ่าน + ปุ่ม Google)
    // ทั้งสถานะกำลังทำงานและ error ไปแสดงในกล่องนั้น ปุ่มนี้จึงไม่ต้องถือ state เอง
    setError('');
    startSignIn();
  }

  function handlePickAccount(accountId: string) {
    mockSignIn(accountId);
    setIsPickerOpen(false);
    setError('');
  }

  async function handleSignOut() {
    setIsWorking(true);
    setError('');
    setIsPickerOpen(false);
    try {
      await signOut();
    } catch {
      setError('ออกจากระบบไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setIsWorking(false);
    }
  }

  // ยังอ่าน session ไม่เสร็จ — เว้นที่ว่างความสูงเท่าปุ่มไว้ กันหน้ากระตุกตอนปุ่มโผล่
  if (isLoading) {
    return <div className="h-8" />;
  }

  return (
    <div className="relative flex flex-col items-end gap-1">
      {/* ป้ายเตือนว่านี่ไม่ใช่การล็อกอินจริง — กันเข้าใจผิดว่า Google OAuth ใช้ได้แล้ว */}
      {isMockAuthEnabled && (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-yolk/25 text-[#8a5a12] border border-yolk/35">
          โหมดจำลอง — ไม่ได้ล็อกอินจริง
        </span>
      )}

      {user ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground max-w-[180px] truncate">
            {user.email}
          </span>

          {/* สลับบัญชีได้โดยไม่ต้องออกจากระบบก่อน — ตอนเทียบว่าใครเห็นเมนูอะไร
              ต้องสลับไปกลับหลายรอบ ถ้าบังคับให้ออกก่อนทุกครั้งจะกลายเป็น 2 คลิกต่อรอบ */}
          {isMockAuthEnabled && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsPickerOpen(open => !open)}
              className="h-8 text-xs text-muted-foreground"
            >
              <Users className="w-3.5 h-3.5" />
              สลับบัญชี
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={handleSignOut}
            disabled={isWorking}
            className="h-8 text-xs text-muted-foreground"
          >
            {isWorking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LogOut className="w-3.5 h-3.5" />
            )}
            ออกจากระบบ
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={handleSignIn}
          disabled={isWorking}
          className="h-8 text-xs"
        >
          {isWorking ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <LogIn className="w-3.5 h-3.5" />
          )}
          {signInButtonLabel}
        </Button>
      )}

      {isMockAuthEnabled && isPickerOpen && (
        <>
          {/* คลิกที่ไหนก็ได้นอกลิสต์แล้วต้องปิด ไม่งั้นแผงค้างทับหน้าจอจนต้องกดปุ่มเดิมซ้ำ */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsPickerOpen(false)}
            aria-hidden
          />
          <div className="absolute top-full right-0 z-20 mt-1 w-64 rounded-xl border bg-background shadow-lg p-1">
            <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
              เลือกบัญชีทดสอบ — แต่ละบัญชีเห็นเฉพาะเมนูที่ตัวเองบันทึกไว้
            </p>
            {MOCK_ACCOUNTS.map(account => {
              const isActive = user?.id === account.id;
              return (
                <button
                  key={account.id}
                  onClick={() => handlePickAccount(account.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted transition-colors"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium">{account.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {account.email}
                    </span>
                  </span>
                  {isActive && (
                    <Check className="w-3.5 h-3.5 shrink-0 text-basil" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {error && <p className="text-[11px] text-chili">{error}</p>}
    </div>
  );
}
