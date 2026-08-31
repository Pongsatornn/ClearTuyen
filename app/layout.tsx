import type { Metadata } from "next";
import { Bai_Jamjuree, IBM_Plex_Mono, IBM_Plex_Sans_Thai_Looped } from "next/font/google";
import "./globals.css";
import { AuthDialog } from "@/components/AuthDialog";

/**
 * ⚠️ ฟอนต์ทุกตัวที่นี่ต้องมี subset "thai" เสมอ
 *
 * เดิมโปรเจกต์นี้ใช้ Geist (ฟอนต์ default ของ create-next-app) ซึ่ง **ไม่มีตัวอักษรไทยเลย**
 * ทั้งที่แอปเป็นภาษาไทยล้วน ผลคือตัวหนังสือไทยทุกตัวตกไปใช้ฟอนต์สำรองของระบบปฏิบัติการ
 * (Tahoma/Leelawadee บน Windows, Thonburi บน Mac) = หน้าตาเปลี่ยนไปตามเครื่องผู้ใช้
 * และการออกแบบตัวอักษรไม่มีผลอะไรเลย ถ้าใครจะเปลี่ยนฟอนต์ในอนาคต เช็ค subset ก่อนเสมอ
 */

// หัวเรื่อง: ไทย "ไม่มีหัว" ทรงเหลี่ยม ให้ความรู้สึกเป็นป้าย/เครื่องมือ ไม่ใช่นิตยสาร
const display = Bai_Jamjuree({
  variable: "--font-display",
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
});

// เนื้อความ: ไทย "มีหัว" แบบตัวพิมพ์ที่คนไทยอ่านทุกวัน อ่านง่ายกว่าตอนตัวเล็ก
// การจับคู่ไม่มีหัว(หัวเรื่อง) + มีหัว(เนื้อความ) เป็นเรื่องเฉพาะของงานภาษาไทย
const body = IBM_Plex_Sans_Thai_Looped({
  variable: "--font-body",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
});

// ตัวเลขล้วน: นาฬิกาจับเวลา ปริมาณ แคลอรี่ — ต้องความกว้างเท่ากันทุกตัวเลข
// ไม่งั้นเลขบนนาฬิกาจะขยับซ้ายขวาทุกวินาที
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "ล้างตู้เย็น | AI แนะนำเมนูจากวัตถุดิบที่มี",
  description: "ใส่วัตถุดิบที่มีในตู้เย็น แล้วให้ AI เชฟแนะนำเมนูให้ทันที",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* กล่องเข้าสู่ระบบอยู่ที่นี่ตัวเดียวทั้งแอป — ต้องอยู่นอก `children` เพราะ
            `app/page.tsx` มี early return เข้าโหมดทำอาหาร ถ้าไปวางในนั้นกล่องจะหาย
            ตอนผู้ใช้กดบันทึกจากหน้าทำอาหาร ซึ่งเป็นจุดหนึ่งที่ต้องชวนล็อกอินพอดี */}
        <AuthDialog />
      </body>
    </html>
  );
}
