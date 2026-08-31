'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceInputStatus = 'idle' | 'listening' | 'transcribing';

/** ระดับความดังที่ถือว่า "มีคนพูด" อย่างน้อยที่สุด — กันเคสห้องเงียบสนิทจนฐานเสียงเป็น 0 */
const MIN_SPEECH_RMS = 0.012;
/** ตัวคูณเหนือระดับเสียงรบกวนพื้นหลังที่วัดได้จริง */
const NOISE_MULTIPLIER = 2.2;
/** ใช้เวลาช่วงต้นนี้วัดว่าครัวนี้เสียงพื้นหลังดังแค่ไหน ก่อนเริ่มตัดสินว่าใครพูด */
const CALIBRATION_MS = 400;
/** เงียบต่อเนื่องเท่านี้หลังเริ่มพูดแล้ว = พูดจบ ตัดส่งเลย */
const SILENCE_AFTER_SPEECH_MS = 1100;
/** กดไมค์แล้วไม่พูดอะไรเลยภายในเวลานี้ = ยกเลิกให้ ไม่ปล่อยให้อัดเสียงกระทะทิ้งไว้ */
const NO_SPEECH_TIMEOUT_MS = 7000;
/** เพดานความยาวคลิปหนึ่งครั้ง — กันไมค์ค้างเปิดทิ้งไว้ทั้งมื้อ */
const MAX_RECORDING_MS = 25000;

/**
 * อัดเสียงคำถามจากไมค์ แล้วส่งไปถอดที่ `/api/transcribe`
 *
 * ทำไมต้องอัดเองแทนที่จะใช้ `SpeechRecognition` ของเบราว์เซอร์ซึ่งง่ายกว่ามาก:
 *
 * 1. **ความแม่น** — เส้นทางนี้ส่งชื่อเมนูและวัตถุดิบไปเป็นคำใบ้ให้ Whisper ล่วงหน้าได้
 *    (ดู buildBiasPrompt ใน `app/api/transcribe/route.ts`) ซึ่งเป็นตัวชี้ขาดกับศัพท์ครัวไทย
 *    ที่เสียงใกล้กัน ส่วน `SpeechRecognition` ใส่คำใบ้ไม่ได้เลย
 * 2. **ครอบคลุมเบราว์เซอร์** — `SpeechRecognition` ไม่มีใน Firefox และเคยหายๆ มาๆ
 *    ใน WebView ของแอปอื่น ส่วน `MediaRecorder` มีครบทุกที่ที่แอปนี้รันได้
 *
 * ราคาที่จ่ายคือต้องตัดสินเองว่า "พูดจบหรือยัง" ซึ่งเป็นงานหลักของ hook นี้ —
 * คนมือเปื้อนกดปุ่มปิดไมค์เองไม่ได้ ถ้าต้องกดสองครั้งต่อคำถามก็เสียเหตุผลของโหมดเสียงไปหมด
 *
 * เกณฑ์ "เงียบ" ต้องวัดจากเสียงพื้นหลังจริงของครัวนั้น ไม่ใช่ค่าคงที่ — ครัวที่เปิด
 * พัดลมดูดควันมีฐานเสียงสูงกว่าห้องเงียบมาก ถ้าใช้ค่าตายตัวจะได้อย่างใดอย่างหนึ่ง
 * ระหว่าง "ไม่ยอมตัดจบเลยเพราะเสียงพัดลมดังกว่าเกณฑ์ตลอด" กับ "ตัดจบกลางประโยค"
 */
export function useVoiceInput(options: {
  /** ได้ข้อความที่ถอดแล้ว — เรียกเมื่อถอดสำเร็จและมีข้อความจริงเท่านั้น */
  onTranscript: (text: string) => void;
  /** ชื่อเมนู + ศัพท์ในครัวตอนนี้ ส่งไปเป็นคำใบ้ให้ Whisper (ดูเหตุผลด้านบน) */
  getBiasContext?: () => { recipeName?: string; terms: string[] };
}) {
  const { onTranscript, getBiasContext } = options;

  const [status, setStatus] = useState<VoiceInputStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  // ความดัง 0-1 สำหรับวงแหวนที่เต้นตามเสียง — ผู้ใช้ต้องเห็นว่าไมค์ได้ยินตัวเองจริง
  // ไม่งั้นจะพูดใส่ปุ่มที่ตายไปแล้วโดยไม่รู้ตัว (บทเรียนเดียวกับปุ่มหัวใจในรีวิว 30 ก.ค.)
  const [level, setLevel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // ยกเลิกแล้ว = ทิ้งคลิปนี้ ไม่ต้องส่งไปถอด (ผู้ใช้กดยกเลิก หรือ component ถูก unmount)
  const discardRef = useRef(false);
  // อ่าน callback ล่าสุดโดยไม่ต้องผูกเข้า dependency ของ useCallback ทุกตัว
  const onTranscriptRef = useRef(onTranscript);
  const getBiasContextRef = useRef(getBiasContext);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    getBiasContextRef.current = getBiasContext;
  });

  /** ปล่อยไมค์และตัวจับความดังทั้งหมด — ต้องเรียกทุกเส้นทางที่จบการอัด */
  const releaseAudio = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // ปล่อย track ให้ไฟไมค์บนเครื่องดับจริง — ถ้าค้างไว้ ผู้ใช้จะเห็นจุดสีแดงบนจอ
    // ตลอดเวลาที่ทำอาหารแล้วคิดว่าแอปแอบฟังอยู่
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  const stop = useCallback(() => {
    // สั่งหยุดได้อย่างเดียว ที่เหลือรอ onstop ของ MediaRecorder จัดการต่อ
    // (ห้ามปล่อย stream ตรงนี้ ไม่งั้นคลิปท่อนสุดท้ายจะหายไป)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    discardRef.current = true;
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    } else {
      releaseAudio();
      setStatus('idle');
    }
  }, [releaseAudio]);

  const start = useCallback(async () => {
    if (recorderRef.current?.state === 'recording') return;
    setError(null);
    discardRef.current = false;
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // สามตัวนี้สำคัญมากในโหมดคุยต่อเนื่อง: echoCancellation คือสิ่งที่กัน
          // ไม่ให้ไมค์ได้ยินเสียงเชฟที่ลำโพงเพิ่งพูดจบ แล้วเอาไปถอดเป็นคำถามใหม่วนไม่จบ
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน เปิดสิทธิ์ไมค์ให้เว็บนี้ในตั้งค่าเบราว์เซอร์ก่อนนะครับ'
          : name === 'NotFoundError'
            ? 'ไม่พบไมโครโฟนในเครื่องนี้'
            : 'เปิดไมโครโฟนไม่สำเร็จ'
      );
      setStatus('idle');
      return;
    }

    streamRef.current = stream;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      releaseAudio();
      setError('เบราว์เซอร์นี้อัดเสียงไม่ได้');
      setStatus('idle');
      return;
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      const chunks = chunksRef.current;
      chunksRef.current = [];
      const discarded = discardRef.current;
      // ต้องอ่าน mimeType จาก recorder ก่อนปล่อยของทิ้ง — แต่ละเบราว์เซอร์อัดคนละชนิด
      // และ route ฝั่งเซิร์ฟเวอร์ตั้งนามสกุลไฟล์ตามค่านี้
      const mimeType = recorder.mimeType || 'audio/webm';
      recorderRef.current = null;
      releaseAudio();

      if (discarded || chunks.length === 0) {
        setStatus('idle');
        return;
      }

      const blob = new Blob(chunks, { type: mimeType });
      // คลิปสั้นมากแปลว่ากดโดนแล้วปล่อย ไม่ใช่คำถาม — ส่งไปถอดก็ได้แต่ข้อความว่าง
      // เปลืองเวลารอฟรีๆ ตัดจบเงียบๆ ตรงนี้เลยดีกว่า
      if (blob.size < 2000) {
        setStatus('idle');
        return;
      }

      setStatus('transcribing');
      try {
        const bias = getBiasContextRef.current?.();
        const form = new FormData();
        form.append('audio', blob);
        if (bias?.recipeName) form.append('recipeName', bias.recipeName);
        if (bias?.terms?.length) form.append('terms', JSON.stringify(bias.terms));

        const res = await fetch('/api/transcribe', { method: 'POST', body: form });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data) {
          setError(data?.error ?? 'ถอดเสียงไม่สำเร็จ ลองพูดใหม่อีกครั้งนะครับ');
        } else if (!data.text) {
          setError('ไม่ได้ยินเสียงพูดเลย ลองพูดใกล้ไมค์อีกนิดนะครับ');
        } else {
          onTranscriptRef.current(data.text);
        }
      } catch {
        setError('เชื่อมต่อไม่ได้ ลองพูดใหม่อีกครั้งนะครับ');
      } finally {
        setStatus('idle');
      }
    };

    recorder.start();
    setStatus('listening');

    // ---- ตัวตัดสินว่า "พูดจบหรือยัง" ----
    let analyser: AnalyserNode;
    try {
      const AudioCtx: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
    } catch {
      // วัดความดังไม่ได้ = ตัดจบให้เองไม่ได้ แต่ยังอัดได้ปกติ
      // ปล่อยให้ผู้ใช้กดหยุดเอง ดีกว่าล้มทั้งฟีเจอร์เพราะส่วนอำนวยความสะดวกพัง
      return;
    }

    const samples = new Uint8Array(analyser.fftSize);
    const startedAt = performance.now();
    let noiseFloorSum = 0;
    let calibrationFrames = 0;
    let speechStartedAt: number | null = null;
    let lastLoudAt = 0;
    let lastLevelPaint = 0;

    function tick() {
      if (recorderRef.current?.state !== 'recording') return;
      rafRef.current = requestAnimationFrame(tick);

      analyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (let i = 0; i < samples.length; i++) {
        const deviation = (samples[i] - 128) / 128;
        sumSquares += deviation * deviation;
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      const now = performance.now();
      const elapsed = now - startedAt;

      // วาดวงแหวนแค่ประมาณ 15 ครั้งต่อวินาที พอให้ตาเห็นว่าขยับ แต่ไม่ทำให้ React
      // rerender ทุกเฟรมจนกล่องแชททั้งกล่องกระตุก
      if (now - lastLevelPaint > 66) {
        lastLevelPaint = now;
        setLevel(Math.min(1, rms * 8));
      }

      // ช่วงต้น: ฟังเฉยๆ เพื่อวัดว่าครัวนี้เสียงพื้นหลังดังเท่าไหร่
      if (elapsed < CALIBRATION_MS) {
        noiseFloorSum += rms;
        calibrationFrames++;
        return;
      }
      const floor = calibrationFrames ? noiseFloorSum / calibrationFrames : 0;
      const threshold = Math.max(MIN_SPEECH_RMS, floor * NOISE_MULTIPLIER);

      if (rms > threshold) {
        if (speechStartedAt === null) speechStartedAt = now;
        lastLoudAt = now;
      }

      if (speechStartedAt === null) {
        // กดไมค์แล้วเงียบไปเลย — ปิดให้เอง ไม่ต้องให้ผู้ใช้มือเปื้อนมากดปิด
        if (elapsed > NO_SPEECH_TIMEOUT_MS) stop();
        return;
      }

      if (now - lastLoudAt > SILENCE_AFTER_SPEECH_MS) stop();
      else if (elapsed > MAX_RECORDING_MS) stop();
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [releaseAudio, stop]);

  // ออกจากหน้า/ปิดโหมดทำอาหารระหว่างไมค์ยังเปิดอยู่ — ต้องปล่อยไมค์ให้ไฟดับจริง
  useEffect(() => {
    return () => {
      discardRef.current = true;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      releaseAudio();
    };
  }, [releaseAudio]);

  const clearError = useCallback(() => setError(null), []);

  return { status, error, level, start, stop, cancel, clearError };
}
