import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // มี package-lock.json อีกไฟล์อยู่นอกโฟลเดอร์นี้ (C:\Users\Asus) ทำให้ Next.js เดา
  // workspace root ผิดที่ทุกครั้งที่รัน dev server แล้วโชว์ warning + ป้าย "Issue" ค้างในหน้าเว็บ
  // ระบุ root ให้ตรงกับโฟลเดอร์โปรเจกต์นี้ตรงๆ เพื่อตัด warning นั้นทิ้ง
  turbopack: {
    root: path.join(__dirname),
  },
  // ปิดป้ายวงกลม "N" ของ Next.js ที่ลอยทับมุมจอตอน dev
  // ป้ายนี้ไม่เคยขึ้นใน production build อยู่แล้ว แต่ระหว่าง dev มันบังหน้าจอตอนทดสอบ/เก็บภาพ
  // และคนที่มาลองใช้แอปไม่รู้ว่ามันคืออะไร นึกว่าแอปมีปัญหา
  // (ปิดแค่ตัวป้าย — build/runtime error ยังขึ้นให้เห็นตามปกติ)
  devIndicators: false,
};

export default nextConfig;
