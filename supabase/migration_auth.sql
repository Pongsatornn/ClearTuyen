-- migration_auth.sql
-- รันไฟล์นี้ "หลัง" migration.sql ในหน้า Supabase Dashboard > SQL Editor ของโปรเจกต์คุณ
-- (Claude ไม่มีสิทธิ์เข้าถึงฐานข้อมูล Supabase จริงของคุณ จึงรันให้อัตโนมัติไม่ได้
--  ต้อง copy ทั้งไฟล์นี้ไปวางแล้วกด Run เอง)
--
-- ไฟล์นี้ทำอะไร: เปลี่ยนจาก "user_id ที่สุ่มเก็บใน localStorage" (ของปลอม DB ตรวจสอบไม่ได้)
-- มาเป็น "user_id ที่มาจาก Supabase Auth จริง" (auth.uid()) เพื่อให้ RLS ป้องกันได้จริง
--
-- ⚠️ อ่านข้อ 1 ให้จบก่อนกด Run — มีคำสั่งลบข้อมูลเก่าอยู่

-- ============================================================
-- 1) ลบเมนูเก่าที่บันทึกไว้สมัยยังไม่มีระบบล็อกอิน
-- ============================================================
-- แถวเก่าทุกแถวมี user_id เป็น UUID ที่สุ่มขึ้นมาเองในเบราว์เซอร์ ไม่มีตัวตนอยู่ใน auth.users
-- จึงไม่มีทางรู้ว่าแถวไหนเป็นของบัญชี Google ของใคร และจะผูก foreign key ในข้อ 2 ไม่ผ่าน
-- ถ้าข้อมูลเก่าสำคัญ ให้ back up ก่อน (Dashboard > Table Editor > saved_recipes > Export CSV)
-- แล้วค่อยกลับมารันไฟล์นี้
delete from public.saved_recipes
where user_id not in (select id::text from auth.users);

-- ============================================================
-- 2) เปลี่ยน user_id ให้ผูกกับบัญชีผู้ใช้จริง
-- ============================================================
-- text -> uuid เพื่อให้เทียบกับ auth.uid() (ซึ่งเป็น uuid) ได้ตรงๆ ไม่ต้อง cast ทุกครั้ง
alter table public.saved_recipes
  alter column user_id type uuid using user_id::uuid;

-- ผูกกับตารางผู้ใช้จริงของ Supabase Auth
-- on delete cascade = ถ้าผู้ใช้ลบบัญชีทิ้ง เมนูที่เขาบันทึกไว้จะถูกลบตามไปด้วย (ไม่เหลือขยะกำพร้า)
alter table public.saved_recipes
  drop constraint if exists saved_recipes_user_id_fkey;

alter table public.saved_recipes
  add constraint saved_recipes_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

-- ============================================================
-- 3) เปลี่ยน RLS policy จาก anon -> authenticated
-- ============================================================
-- policy ชุดเดิมใน migration.sql เปิดให้ role anon อ่านได้ "ทุกแถว" (using (true))
-- แปลว่าใครก็ตามที่เปิดเว็บ (anon key ฝังอยู่ใน JS bundle อยู่แล้ว) query เมนูของคนอื่นได้หมด
-- ต้องลบทิ้งก่อน ไม่งั้นมันจะยังทำงานคู่ขนานกับ policy ใหม่ (RLS เป็นแบบ OR กัน — มีอันไหนผ่านก็ผ่าน)
drop policy if exists "anon can insert recipes" on public.saved_recipes;
drop policy if exists "anon can read recipes" on public.saved_recipes;

-- อ่านได้เฉพาะเมนูของตัวเอง
-- (ใช้ (select auth.uid()) แทน auth.uid() เฉยๆ ตามที่ Supabase แนะนำ
--  เพราะ Postgres จะเรียกฟังก์ชันครั้งเดียวต่อ query แทนที่จะเรียกซ้ำทุกแถว)
create policy "users can read own recipes"
  on public.saved_recipes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- บันทึกได้เฉพาะในนามตัวเอง (กันไม่ให้ยัด user_id ของคนอื่นเข้ามา)
create policy "users can insert own recipes"
  on public.saved_recipes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- 4) สิทธิ์ลบเมนูของตัวเอง
-- ============================================================
-- ตอนเขียนหัวข้อ 3 ครั้งแรก แอปยังไม่มีปุ่มลบ จึงจงใจไม่สร้าง policy นี้
-- แต่ตอนนี้ปุ่มลบมีจริงแล้วใน `components/SavedRecipes.tsx` ถ้าไม่สร้างไว้ด้วย
-- ปุ่มนั้นจะกดแล้วขึ้น error ทันทีหลังรันไฟล์นี้ (RLS ปล่อยผ่านแต่ลบ 0 แถว
-- ซึ่ง `deleteSavedRecipe()` ดักไว้แล้วโยน DeleteNotAllowedError ออกมา)
--
-- ลบ policy รุ่น anon ทิ้งก่อน (มีอยู่ถ้าเคยรัน migration_delete.sql กรณีที่ 1)
-- ไม่งั้นมันจะยังเปิดให้ role anon ลบแถวของใครก็ได้อยู่เหมือนเดิม
drop policy if exists "anon can delete recipes" on public.saved_recipes;

create policy "users can delete own recipes"
  on public.saved_recipes
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ยังไม่สร้าง policy สำหรับ update เพราะแอปยังไม่มีฟีเจอร์แก้ไขเมนูที่บันทึกไว้
-- ถ้าวันหลังทำ ก็เพิ่มแบบเดียวกันนี้ (for update ... using ... with check ...)
