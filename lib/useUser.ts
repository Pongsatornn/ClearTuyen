'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { isMockAuthEnabled, subscribeMockAuth } from './mockAuth';

/**
 * บอกว่าตอนนี้ใครล็อกอินอยู่ (หรือยังไม่ได้ล็อกอิน)
 *
 * `supabase` เป็น singleton ตัวเดียวทั้งแอป และ onAuthStateChange ยิง event
 * INITIAL_SESSION ให้ทันทีตอน subscribe อยู่แล้ว เลยใช้ hook นี้ซ้ำได้หลาย component
 * โดยไม่ต้องทำ Context ครอบ และไม่ต้องเรียก getSession() แยกอีกรอบ
 *
 * isLoading มีไว้กันจอกระพริบ: ช่วงแรกสุดยังอ่าน session จาก localStorage ไม่เสร็จ
 * ถ้าไม่เช็คจะเห็นปุ่ม "เข้าสู่ระบบ" แว้บนึงทั้งที่ล็อกอินค้างไว้อยู่แล้ว
 */
export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // โหมดจำลอง: อ่านสถานะจาก mock store แทน supabase.auth
    // สัญญาเหมือนกัน (ยิงสถานะปัจจุบันให้ทันทีตอน subscribe) component จึงไม่ต้องรู้ว่าอยู่โหมดไหน
    if (isMockAuthEnabled) {
      return subscribeMockAuth(mockUser => {
        setUser(mockUser);
        setIsLoading(false);
      });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, isLoading };
}
