'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, MailCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  isGoogleAuthEnabled,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '@/lib/supabase';
import {
  closeAuthDialog,
  subscribeAuthDialog,
  type AuthDialogRequest,
} from '@/lib/authDialog';

/**
 * กล่องเข้าสู่ระบบ — mount ไว้ที่ `app/layout.tsx` ตัวเดียวทั้งแอป
 * เปิดด้วย `startSignIn()` จาก `lib/authDialog.ts` (ดูเหตุผลที่ทำแบบนี้ในไฟล์นั้น)
 *
 * ให้ 2 ทางในกล่องเดียว: อีเมล/รหัสผ่าน กับ Google — เพราะทั้งคู่คือ Supabase Auth
 * ตัวเดียวกัน ผู้ใช้ที่สมัครด้วยอีเมลวันนี้แล้วพรุ่งนี้กด Google ด้วยอีเมลเดียวกัน
 * จะได้บัญชีเดิม (Supabase เปิด "Link accounts with same email" ไว้เป็นค่าเริ่มต้น)
 * เมนูที่บันทึกไว้จึงไม่หายไปไหน
 *
 * วาง Google ไว้บนสุดเพราะกดครั้งเดียวจบ ไม่ต้องคิดรหัสผ่านใหม่ — ฟอร์มอีเมลอยู่ล่าง
 * สำหรับคนที่ไม่อยากผูกกับบัญชี Google (หรือใช้เครื่องที่ไม่ได้ล็อกอิน Google ไว้)
 *
 * ⚠️ ปุ่ม Google จะโผล่ก็ต่อเมื่อ `NEXT_PUBLIC_GOOGLE_AUTH=1` เท่านั้น (ดู `lib/supabase.ts`)
 * ถ้ายังไม่ได้เปิด provider ใน Dashboard กล่องนี้จะเหลือแค่ฟอร์มอีเมล/รหัสผ่าน
 */

type Mode = 'signin' | 'signup';

// โลโก้ Google — lucide ไม่มีให้ (เป็นเครื่องหมายการค้า ไม่ใช่ไอคอนทั่วไป)
// วาดตาม branding guideline ของ Google ที่กำหนดว่าปุ่มต้องใช้ตัว G สี่สีนี้เท่านั้น
function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" className="w-4 h-4" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

export function AuthDialog() {
  const [request, setRequest] = useState<AuthDialogRequest | null>(null);
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');
  // ไม่ว่างเมื่อสมัครเสร็จแล้วแต่ยังต้องไปกดลิงก์ในอีเมลก่อน (เก็บอีเมลไว้โชว์ว่าส่งไปที่ไหน)
  const [confirmationSentTo, setConfirmationSentTo] = useState('');

  const isOpen = request !== null;

  // ล้างฟอร์มทุกครั้งที่ "เปิด" ไม่งั้นคนที่พิมพ์รหัสผิดแล้วปิดกล่องไป จะเจอรหัสเดิม
  // กับข้อความ error เดิมค้างรออยู่ตอนกลับมาเปิดใหม่
  //
  // ล้างในนี้ (callback ของ store) ไม่ใช่ใน useEffect ที่ดู `isOpen` เพราะการ setState
  // ตรงๆ ในร่าง effect ทำให้ render ซ้อนรอบโดยไม่จำเป็น — ตรงนี้เป็น callback
  // จากระบบภายนอกซึ่งเป็นที่ที่ React ตั้งใจให้ setState ได้
  useEffect(
    () =>
      subscribeAuthDialog(nextRequest => {
        setRequest(nextRequest);
        if (!nextRequest) return;
        setMode('signin');
        setEmail('');
        setPassword('');
        setIsPasswordVisible(false);
        setError('');
        setConfirmationSentTo('');
      }),
    []
  );

  // Escape ปิดได้ตามที่คนคาดหวังจากกล่องแบบนี้ (เป็นทางออกเดียวที่ไม่ต้องเล็งเมาส์)
  // และล็อก scroll ข้างหลังไว้ ไม่งั้นบนมือถือจะเลื่อนหน้าเบื้องหลังจนหลงว่าอยู่ตรงไหน
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeAuthDialog();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isWorking) return;

    const trimmedEmail = email.trim();

    // เช็คในเครื่องก่อนยิงเน็ต เพราะสองเคสนี้รู้ผลได้ทันทีโดยไม่ต้องรอ round-trip
    // (และ Supabase จะตอบกลับมาเป็นภาษาอังกฤษ ซึ่งแปลไทยแล้วได้ข้อความเดียวกันนี้)
    if (!trimmedEmail.includes('@')) {
      setError('กรอกอีเมลให้ถูกรูปแบบก่อน');
      return;
    }
    if (password.length < 6) {
      setError('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }

    setIsWorking(true);
    setError('');
    try {
      if (mode === 'signup') {
        const result = await signUpWithEmail(trimmedEmail, password);
        if (result === 'needs-confirmation') {
          setConfirmationSentTo(trimmedEmail);
          return;
        }
      } else {
        await signInWithEmail(trimmedEmail, password);
      }
      // สำเร็จแบบไม่ต้องออกนอกแอป — ปิดกล่องแล้วบอกคนที่สั่งเปิดว่าไปต่อได้
      request?.onSuccess?.();
      closeAuthDialog();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleGoogle() {
    setIsWorking(true);
    setError('');
    try {
      // สำเร็จ = เบราว์เซอร์เด้งออกไปหน้า Google เลย โค้ดหลังบรรทัดนี้จะไม่ได้ทำงาน
      // (จึงไม่ต้องปิดกล่องเอง — ตอนกลับมาหน้าโหลดใหม่ทั้งหน้า state นี้หายไปพร้อมกัน)
      await signInWithGoogle();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง');
      setIsWorking(false);
    }
  }

  if (!isOpen) return null;

  const isSignUp = mode === 'signup';

  return (
    <div
      // คลิกพื้นที่มืดรอบๆ แล้วปิด แต่ต้องเช็คว่าคลิกโดนตัว overlay จริงๆ ไม่ใช่ลูกของมัน
      // ไม่งั้นการลากเลือกข้อความในฟอร์มแล้วปล่อยเมาส์นอกกล่องจะปิดกล่องทิ้งกลางคัน
      onMouseDown={event => {
        if (event.target === event.currentTarget) closeAuthDialog();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-[2px]"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        className="relative w-full max-w-sm rounded-2xl border bg-background p-5 shadow-xl"
      >
        <button
          onClick={closeAuthDialog}
          aria-label="ปิด"
          className="absolute top-3 right-3 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {confirmationSentTo ? (
          /* สมัครแล้วแต่ Supabase เปิด "Confirm email" ไว้ — ยังเข้าใช้ไม่ได้จนกว่าจะกดลิงก์
             ต้องบอกให้ชัดตรงนี้ ไม่งั้นผู้ใช้จะกดสมัครซ้ำเรื่อยๆ เพราะเห็นว่าไม่มีอะไรเกิดขึ้น */
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <MailCheck className="w-8 h-8 text-basil" />
            <h2 id="auth-dialog-title" className="font-display text-lg font-semibold">
              ส่งลิงก์ยืนยันไปแล้ว
            </h2>
            <p className="text-sm text-muted-foreground">
              เปิดอีเมลของ{' '}
              <span className="font-medium text-foreground">{confirmationSentTo}</span> แล้วกดลิงก์ยืนยัน
              จากนั้นกลับมาเข้าสู่ระบบได้เลย
              <br />
              <span className="text-xs">ไม่เจอในกล่องเข้า ลองดูในโฟลเดอร์อีเมลขยะ</span>
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setConfirmationSentTo('');
                setMode('signin');
                setPassword('');
              }}
            >
              กลับไปหน้าเข้าสู่ระบบ
            </Button>
          </div>
        ) : (
          <>
            <h2 id="auth-dialog-title" className="font-display text-lg font-semibold">
              {isSignUp ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              ล็อกอินมีผลกับ &ldquo;เมนูที่บันทึกไว้&rdquo; เท่านั้น — หาเมนูใช้งานได้ตามปกติโดยไม่ต้องล็อกอิน
            </p>

            {/* ปิดไว้จนกว่าจะเปิด Google provider ใน Dashboard จริง — ปุ่มที่กดแล้วพา
                ไปหน้า JSON ดิบแย่กว่าไม่มีปุ่ม เส้นคั่น "หรือใช้อีเมล" ก็ต้องหายไปด้วย
                ไม่งั้นจะเหลือคำว่า "หรือ" ที่ไม่มีตัวเลือกอื่นให้เทียบ */}
            {isGoogleAuthEnabled && (
              <>
                <Button
                  variant="outline"
                  onClick={handleGoogle}
                  disabled={isWorking}
                  className="mt-4 h-9 w-full"
                >
                  <GoogleIcon />
                  {isSignUp ? 'สมัครด้วยบัญชี Google' : 'เข้าสู่ระบบด้วย Google'}
                </Button>

                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] text-muted-foreground">หรือใช้อีเมล</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className={`flex flex-col gap-3 ${isGoogleAuthEnabled ? '' : 'mt-4'}`}>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium">อีเมล</span>
                <Input
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  // โฟกัสช่องแรกให้เลย คนใช้คีย์บอร์ดจะได้พิมพ์ต่อได้ทันทีไม่ต้องคลิกก่อน
                  // (กล่องทั้งกล่อง unmount ตอนปิด ทุกครั้งที่เปิดใหม่จึงโฟกัสให้ใหม่จริง)
                  autoFocus
                  disabled={isWorking}
                  className="h-9"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium">รหัสผ่าน</span>
                <div className="relative">
                  <Input
                    type={isPasswordVisible ? 'text' : 'password'}
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    placeholder={isSignUp ? 'อย่างน้อย 6 ตัวอักษร' : ''}
                    // บอกเบราว์เซอร์ให้ถูกว่าเป็นรหัสใหม่หรือรหัสเดิม ตัวจัดการรหัสผ่าน
                    // จะได้เสนอ "สร้างรหัสให้" ตอนสมัคร และเติมรหัสเดิมให้ตอนเข้าสู่ระบบ
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    disabled={isWorking}
                    className="h-9 pr-9"
                  />
                  {/* พิมพ์รหัสผ่านบนมือถือพลาดง่ายมาก ให้เปิดดูได้ว่าพิมพ์อะไรไป */}
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible(visible => !visible)}
                    aria-label={isPasswordVisible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                    className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>

              {error && (
                <p className="rounded-lg border border-chili/20 bg-chili/10 px-3 py-2 text-xs text-chili">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={isWorking} className="h-9 w-full">
                {isWorking && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSignUp ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              {isSignUp ? 'มีบัญชีอยู่แล้ว?' : 'ยังไม่มีบัญชี?'}{' '}
              <button
                onClick={() => {
                  setMode(isSignUp ? 'signin' : 'signup');
                  setError('');
                }}
                className="font-medium text-basil underline-offset-4 hover:underline"
              >
                {isSignUp ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
