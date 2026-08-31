'use client';

import { useEffect, useState } from 'react';

/**
 * กันจอดับระหว่างอยู่ในโหมดทำอาหาร
 *
 * รอบรีวิว 30 ก.ค. ข้อ 12: "มือเปื้อนแล้วต้องปัดจอปลุกทุกสองนาที" — โหมดนี้ทำมาเพื่อ
 * ยืนอ่านหน้าเตาโดยเฉพาะ การที่จอดับเองจึงทำลายเหตุผลทั้งหมดของการมีโหมดนี้
 *
 * คืน `true` เมื่อจับจองสำเร็จจริง เพื่อให้ UI บอกผู้ใช้ได้ตามความจริง — ไม่ใช่ขึ้นป้าย
 * "จอจะไม่ดับ" แล้วจอดับอยู่ดี ซึ่งแย่กว่าไม่บอกอะไรเลย
 *
 * ⚠️ Wake Lock API ใช้ไม่ได้ทุกที่: ต้องเป็น secure context (https หรือ localhost)
 * และ Safari บน iOS เพิ่งรองรับในเวอร์ชันหลังๆ เท่านั้น — ทุกเส้นทางจึงต้องพังแบบเงียบ
 * ไม่ใช่โยน error ใส่หน้าคนที่กำลังจะทำอาหาร
 */
export function useWakeLock(enabled: boolean): boolean {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    // กันเคส unmount ระหว่างที่ request ยังค้างอยู่ ไม่งั้นจะได้ sentinel ที่ไม่มีใครปล่อย
    let isCancelled = false;

    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (isCancelled) {
          await lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        setIsActive(true);
        // ระบบปฏิบัติการปล่อย lock เองได้ (เช่น แบตใกล้หมด) ต้องอัปเดตป้ายบนจอตามความจริง
        lock.addEventListener('release', () => setIsActive(false));
      } catch {
        // ผู้ใช้/เบราว์เซอร์ปฏิเสธ — ถือว่าไม่มีฟีเจอร์นี้ ไม่ต้องบอก error
        setIsActive(false);
      }
    }

    // สลับไปแอปอื่นแล้วกลับมา เบราว์เซอร์จะปล่อย lock ทิ้งเสมอ ต้องขอใหม่เอง
    // (เกิดจริงบ่อยมากในครัว — คนเปิดไลน์ตอบแชทแป๊บนึงแล้วสลับกลับมา)
    function handleVisibility() {
      if (document.visibilityState === 'visible') acquire();
    }

    acquire();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      sentinel?.release().catch(() => {});
      setIsActive(false);
    };
  }, [enabled]);

  return isActive;
}
