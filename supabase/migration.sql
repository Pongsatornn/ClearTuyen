-- migration.sql
-- รันไฟล์นี้เองในหน้า Supabase Dashboard > SQL Editor ของโปรเจกต์คุณ
-- (Claude ไม่มีสิทธิ์เข้าถึงฐานข้อมูล Supabase จริงของคุณ จึงรันให้อัตโนมัติไม่ได้
--  ต้อง copy ทั้งไฟล์นี้ไปวางแล้วกด Run เอง)

-- 1) สร้างตารางสำหรับเก็บเมนูที่ผู้ใช้กดบันทึกไว้
create table if not exists public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  recipe_name text not null,
  ingredients text[] not null,
  instructions text[] not null,
  created_at timestamptz not null default now()
);

-- index ให้ query "เมนูของ user คนนี้ เรียงจากใหม่ไปเก่า" (ที่ lib/supabase.ts ใช้) เร็วขึ้น
create index if not exists saved_recipes_user_id_created_at_idx
  on public.saved_recipes (user_id, created_at desc);

-- 2) เปิด Row Level Security (RLS) — ถ้าไม่เปิด ใครก็ insert/select/update/delete
--    ตารางนี้ได้หมดตราบใดที่มี anon key (ซึ่ง anon key ถูกฝังอยู่ใน JS bundle
--    ฝั่ง browser อยู่แล้ว ทุกคนที่เปิดเว็บก็เห็น key นี้ได้)
alter table public.saved_recipes enable row level security;

-- 3) กำหนดสิทธิ์ให้ role "anon" (คือทุกคนที่เรียกผ่าน anon key จาก browser)
--    หมายเหตุสำคัญ: แอปนี้ยังไม่มีระบบ auth จริง (ไม่ได้ใช้ Supabase Auth)
--    การแยก user_id ที่ทำตอนนี้ (lib/supabase.ts -> getAnonymousUserId())
--    เป็นแค่ id ที่สุ่มเก็บไว้ใน localStorage ของแต่ละเบราว์เซอร์ ไม่ใช่ตัวตนที่ยืนยันได้จริง
--    ดังนั้น Postgres ไม่มีทางรู้ "ตัวจริง" ของ user_id นี้ -> RLS ด้านล่างนี้
--    ป้องกันได้แค่ "ห้ามแก้ไข/ลบข้อมูลของคนอื่น" แต่ "ห้ามคนอื่นอ่านเมนูของเรา"
--    ยังทำไม่ได้ 100% จนกว่าจะทำระบบ auth จริง (เช่น Supabase Auth)

-- อนุญาตให้ insert ได้เสมอ (ทุกคนบันทึกเมนูของตัวเองได้)
create policy "anon can insert recipes"
  on public.saved_recipes
  for insert
  to anon
  with check (true);

-- อนุญาตให้อ่านได้ทุกแถว (ยังไม่ได้จำกัดเฉพาะของตัวเอง เพราะไม่มี auth จริงที่ฝั่ง DB
-- ตรวจสอบได้ว่า user_id ที่ส่งมาคือของจริง — ถ้าต้องการความเป็นส่วนตัวจริงจัง
-- ต้องทำระบบ Supabase Auth แล้วเปลี่ยนเงื่อนไขนี้เป็น `using (user_id = auth.uid()::text)`)
create policy "anon can read recipes"
  on public.saved_recipes
  for select
  to anon
  using (true);

-- ไม่สร้าง policy สำหรับ update/delete ให้ role anon โดยตั้งใจ
-- แปลว่า role anon (ฝั่ง browser) จะ "insert และ select ได้เท่านั้น"
-- แก้ไข/ลบแถวไม่ได้เลย แม้จะเป็นแถวของตัวเองก็ตาม (แอปตอนนี้ก็ไม่มีฟีเจอร์ลบ/แก้อยู่แล้ว)
