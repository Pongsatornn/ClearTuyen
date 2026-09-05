import { Image, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';

interface ImageUploadProps {
  // คืนจำนวนวัตถุดิบที่ถูกเพิ่มเข้าลิสต์จริงๆ (ของที่มีอยู่ในลิสต์แล้วไม่นับ)
  // ต้องรู้ตัวเลขนี้เพื่อแยก "สแกนแล้วได้ของใหม่" ออกจาก "สแกนแล้วซ้ำของเดิมหมด"
  // ซึ่งสองเคสนี้เดิมหน้าตาเหมือนกันเป๊ะบนจอคือไม่มีอะไรเกิดขึ้นเลย
  onIngredientsDetected: (ingredients: string[]) => number;
}

// เพดานของ "ไฟล์ที่ยอมรับมาถอดรหัส" ไม่ใช่เพดานของสิ่งที่ส่งขึ้น server
// (ไฟล์ที่ใหญ่กว่านี้คือรูป RAW/พาโนรามา ถอดรหัสในเบราว์เซอร์มือถือแล้วแท็บมีสิทธิ์ตาย)
const MAX_FILE_BYTES = 25 * 1024 * 1024;

// ด้านยาวสุดของภาพที่จะส่งขึ้นไป ไล่ลงทีละขั้นจนกว่า base64 จะเล็กกว่าเพดานของ API
// 1280 พอสำหรับให้โมเดลอ่านของในตู้เย็นออก และเล็กกว่ารูปจากมือถือ (3000-4000px) หลายเท่า
const TARGET_EDGES = [1280, 900, 640];

// เพดานฝั่ง /api/vision คือ 5MB ของ "สตริง base64" — เผื่อไว้ที่ 4MB เพราะ data URL
// มีส่วนหัวและ padding เพิ่มมาอีกเล็กน้อย
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function base64Bytes(dataUrl: string): number {
  return (dataUrl.length * 3) / 4;
}

/**
 * ย่อรูปและแปลงเป็น JPEG ก่อนส่งขึ้น /api/vision
 *
 * ทำไมต้องมี — เดิมส่งไฟล์ดิบตามที่ผู้ใช้เลือกมาเลย ซึ่งพังกับรูปจากมือถือจริง 2 ทาง:
 *   1. **เพดานสองฝั่งวัดคนละหน่วย** ฝั่งนี้เช็คขนาด "ไฟล์" ว่าต้องไม่เกิน 5MB แต่ /api/vision
 *      เช็คขนาด "สตริง base64" ซึ่งใหญ่กว่าไฟล์ราว 33% แปลว่ารูป 4MB ผ่านด่านนี้แล้วไปโดน
 *      HTTP 413 ที่ server ทั้งที่ผู้ใช้ทำถูกทุกอย่าง — รูปกล้องมือถือทุกวันนี้อยู่ในช่วงนี้พอดี
 *   2. รูป 4000px อัปโหลดผ่านเน็ตมือถือช้ามาก และกินโควตา TPM ของ Groq มากกว่าที่จำเป็น
 *      โดยไม่ได้ทำให้โมเดลอ่านของออกดีขึ้น
 *
 * ตั้ง imageOrientation: 'from-image' เพราะรูปจากมือถือมักเก็บการหมุนไว้ใน EXIF ถ้าไม่บอก
 * จะได้ภาพตะแคงส่งขึ้นไปให้โมเดลดู
 */
async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  try {
    let fallback = '';

    for (const maxEdge of TARGET_EDGES) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      ctx.drawImage(bitmap, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      fallback = dataUrl;
      if (base64Bytes(dataUrl) <= MAX_UPLOAD_BYTES) return dataUrl;
    }

    return fallback;
  } finally {
    bitmap.close();
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ImageUpload({ onIngredientsDetected }: ImageUploadProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // เก็บรูปที่เพิ่งสแกนไว้เพื่อให้กด "สแกนรูปเดิมอีกครั้ง" ได้โดยไม่ต้องเลือกไฟล์ใหม่
  // (จำเป็นเพราะบางครั้งโมเดลตอบว่าไม่เจอทั้งที่รูปใช้ได้ — ดูหมายเหตุใน /api/vision)
  const [lastImage, setLastImage] = useState('');
  const [canRetry, setCanRetry] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = ''; // เคลียร์ทันที เพื่อให้เลือกไฟล์เดิมซ้ำแล้ว onChange ยังทำงาน
    setErrorMessage('');
    setCanRetry(false);

    if (file.size > MAX_FILE_BYTES) {
      setErrorMessage('ไฟล์ภาพใหญ่เกินไป ลองถ่ายใหม่หรือเลือกรูปที่เล็กกว่านี้');
      return;
    }

    setIsAnalyzing(true);
    let image: string;
    try {
      image = await compressImage(file);
    } catch {
      // เบราว์เซอร์เก่าที่ createImageBitmap ใช้ไม่ได้ หรือไฟล์ที่ decode ไม่ออก (เช่น HEIC บนบางเครื่อง)
      // — ยังพยายามส่งไฟล์ดิบขึ้นไปให้ ดีกว่าปฏิเสธทันที
      try {
        image = await readAsDataUrl(file);
      } catch {
        setIsAnalyzing(false);
        setErrorMessage('เปิดไฟล์รูปนี้ไม่ได้ ลองเลือกรูปอื่นดูครับ');
        return;
      }
    }

    if (base64Bytes(image) > MAX_UPLOAD_BYTES) {
      setIsAnalyzing(false);
      setErrorMessage('รูปนี้ใหญ่เกินไป ลองถ่ายใหม่ที่ความละเอียดต่ำลงครับ');
      return;
    }

    setLastImage(image);
    await analyzeImage(image);
  };

  const analyzeImage = async (base64: string) => {
    setIsAnalyzing(true);
    setCanRetry(false);
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
        // ชนโควตา (429) คือรอแล้วกดใหม่ได้ผลเลย ไม่ต้องให้ผู้ใช้ไปเลือกไฟล์ใหม่
        setCanRetry(res.status === 429);
        return;
      }

      // ดูมาสองรอบแล้วยังไม่เจอของกิน (server ยิงซ้ำให้เองรอบหนึ่งแล้ว) — ข้อความต้องไม่ฟันธง
      // ว่าเป็นความผิดของรูป เพราะบางครั้งกดสแกนรูปเดิมอีกครั้งก็ได้ผล จึงมีปุ่มให้กดซ้ำตรงนี้เลย
      if (data.ingredients.length === 0) {
        setErrorMessage('ยังไม่เจอวัตถุดิบในรูปนี้ ลองกดสแกนอีกครั้ง หรือถ่ายใหม่ให้เห็นของชัดๆ และแสงสว่างพอ');
        setCanRetry(true);
        return;
      }

      // เจอของในรูป แต่ทุกอย่างมีอยู่ในลิสต์แล้ว — บนจอก็ยังไม่มีอะไรขยับเหมือนกัน ต้องบอกด้วย
      if (onIngredientsDetected(data.ingredients) === 0) {
        setErrorMessage('วัตถุดิบในรูปนี้มีอยู่ในรายการแล้วทั้งหมด');
      }
    } catch (error) {
      console.error(error);
      setErrorMessage('เกิดข้อผิดพลาดในการวิเคราะห์รูปภาพ');
      setCanRetry(true);
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
        <div className="mt-2 text-sm text-chili bg-chili/10 border border-chili/20 rounded-lg px-3 py-2 text-center">
          <p>{errorMessage}</p>
          {canRetry && lastImage && !isAnalyzing && (
            <button
              type="button"
              onClick={() => analyzeImage(lastImage)}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-chili/10 hover:bg-chili/20 font-medium transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              สแกนรูปเดิมอีกครั้ง
            </button>
          )}
        </div>
      )}
    </div>
  );
}
