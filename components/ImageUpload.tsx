import { Image, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface ImageUploadProps {
  // คืนจำนวนวัตถุดิบที่ถูกเพิ่มเข้าลิสต์จริงๆ (ของที่มีอยู่ในลิสต์แล้วไม่นับ)
  // ต้องรู้ตัวเลขนี้เพื่อแยก "สแกนแล้วได้ของใหม่" ออกจาก "สแกนแล้วซ้ำของเดิมหมด"
  // ซึ่งสองเคสนี้เดิมหน้าตาเหมือนกันเป๊ะบนจอคือไม่มีอะไรเกิดขึ้นเลย
  onIngredientsDetected: (ingredients: string[]) => number;
}

export function ImageUpload({ onIngredientsDetected }: ImageUploadProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side size check (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('ไฟล์ภาพมีขนาดใหญ่เกินไป (ไม่ควรเกิน 5MB)');
      e.target.value = ''; // Reset input
      return;
    }

    setErrorMessage('');

    // Convert file to base64
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      await analyzeImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async (base64: string) => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      });
      const data = await res.json();

      // เดิมเช็คแค่ `if (data.ingredients)` ซึ่ง [] เป็น truthy เลยผ่านเข้าไปส่งลิสต์ว่างต่อ
      // แล้วจบเงียบๆ — ตัวหมุนหาย แต่ไม่มีวัตถุดิบเพิ่ม ไม่มีข้อความ ผู้ใช้ไม่รู้ว่าเกิดอะไรขึ้น
      if (!res.ok || !Array.isArray(data.ingredients)) {
        setErrorMessage(data.error || 'ไม่สามารถวิเคราะห์รูปภาพได้');
        return;
      }

      // ยิงสำเร็จแต่ในรูปไม่มีของกิน (API ตอบ 200 พร้อมลิสต์ว่าง) — ต้องบอกว่าให้ถ่ายใหม่ยังไง
      if (data.ingredients.length === 0) {
        setErrorMessage('ไม่เจอวัตถุดิบในรูปนี้ ลองถ่ายใหม่ให้เห็นของชัดๆ และแสงสว่างพอ');
        return;
      }

      // เจอของในรูป แต่ทุกอย่างมีอยู่ในลิสต์แล้ว — บนจอก็ยังไม่มีอะไรขยับเหมือนกัน ต้องบอกด้วย
      if (onIngredientsDetected(data.ingredients) === 0) {
        setErrorMessage('วัตถุดิบในรูปนี้มีอยู่ในรายการแล้วทั้งหมด');
      }
    } catch (error) {
      console.error(error);
      setErrorMessage('เกิดข้อผิดพลาดในการวิเคราะห์รูปภาพ');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="relative">
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        id="image-upload"
        disabled={isAnalyzing}
      />
      <label
        htmlFor="image-upload"
        className={`flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          isAnalyzing 
            ? 'bg-muted border-muted-foreground/20 cursor-not-allowed' 
            : 'bg-basil-soft border-basil/25 hover:bg-basil/20 text-basil'
        }`}
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>กำลังสแกนวัตถุดิบ...</span>
          </>
        ) : (
          <>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- lucide-react icon, not an <img> */}
            <Image className="w-4 h-4" />
            <span className="text-sm font-medium">อัปโหลดรูปภาพเพื่อสแกน</span>
          </>
        )}
      </label>

      {errorMessage && (
        <p className="mt-2 text-sm text-chili bg-chili/10 border border-chili/20 rounded-lg px-3 py-2 text-center">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
