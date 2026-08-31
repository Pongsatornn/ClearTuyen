'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { audioExtensionFor } from './voice';

export type CallPhase = 'idle' | 'connecting' | 'listening' | 'transcribing' | 'working' | 'ended';

/** ใช้ช่วงต้นสายวัดว่าครัวนี้เสียงพื้นหลังดังแค่ไหน ก่อนเริ่มตัดสินว่าใครพูด */
const CALIBRATION_MS = 600;
/** ระดับความดังต่ำสุดที่ยอมนับว่าเป็นเสียงพูด — กันห้องเงียบสนิทจนฐานเสียงเป็นศูนย์ */
const MIN_SPEECH_RMS = 0.012;
/** ตัวคูณเหนือเสียงรบกวนพื้นหลังที่วัดได้จริง */
const NOISE_MULTIPLIER = 2.2;
/** เงียบต่อเนื่องเท่านี้หลังเริ่มพูดแล้ว = จบประโยค ส่งไปถอดได้ */
const SILENCE_END_MS = 1000;
/**
 * ถ้าท่อนนี้ยังไม่ได้ยินใครพูดเลยภายในเวลานี้ ให้ทิ้งแล้วเริ่มอัดท่อนใหม่
 *
 * ไม่ใช่การวางสาย แต่เป็นการรีไซเคิลไฟล์ที่กำลังอัดอยู่ — ในสายที่คุยกันยาวๆ ผู้ใช้เงียบ
 * เป็นนาทีได้สบาย (กำลังหั่นผักอยู่) ถ้าปล่อยให้อัดสะสมไปเรื่อยๆ ไฟล์จะบวมกินหน่วยความจำ
 * ฟรีๆ ทั้งที่ข้างในไม่มีเสียงพูดสักคำ ผู้ใช้ไม่รู้สึกอะไรเพราะไมค์ไม่เคยถูกปิดจริง
 */
const SEGMENT_WAIT_MS = 15000;
/** เพดานความยาวของประโยคเดียว — กันเคสเสียงดังต่อเนื่อง (เครื่องดูดควัน) ที่ไม่มีวันเงียบ */
const MAX_UTTERANCE_MS = 30000;
/**
 * เงียบติดกันเท่านี้ท่อน (ประมาณ 5 นาที) ให้วางสายเอง
 *
 * มีไว้กันกรณีผู้ใช้เดินหนีไปเลยหรือลืมว่าเปิดสายค้างไว้ ไม่งั้นไมค์กับจอจะเปิดค้าง
 * กินแบตทั้งเย็น จอไม่ดับด้วยเพราะโหมดนี้จับ wake lock ไว้
 */
const IDLE_SEGMENTS_BEFORE_HANGUP = 20;

/**
 * สายสนทนากับเชฟที่เปิดค้างไว้ได้ยาวๆ — ฟัง ตอบ แล้วกลับไปฟังต่อเอง ไม่มีวันหยุดกลางทาง
 *
 * ต่างจาก `useVoiceInput` (ที่ปุ่มไมค์ในกล่องแชทใช้) ตรงเจตนาคนละเรื่องกันเลย:
 * ตัวนั้นคือ "อัดหนึ่งคำถามแล้วจบ" ส่วนตัวนี้คือ "สายที่ไม่วางจนกว่าจะกดวาง"
 * ความต่างนี้เปลี่ยนกฎเกือบทุกข้อ:
 *
 * 1. **ไม่มี timeout ที่ทำให้หลุดจากสถานะฟัง** — เงียบนานแค่ไหนก็ยังฟังอยู่ ถ้า
 *    `useVoiceInput` เจอความเงียบ 7 วินาทีมันจะปิดไมค์แล้วรอให้กดใหม่ ซึ่งในสายจริง
 *    คือการบังคับให้คนมือเปื้อนไปแตะจอทุกครั้งที่หยุดคิดนานไปหน่อย
 * 2. **ถอดเสียงไม่สำเร็จ = กลับไปฟังเงียบๆ ไม่ใช่ขึ้น error แล้วหยุด** — ในสายจริง
 *    ประโยคที่ฟังไม่ออกคือเรื่องปกติ คนก็แค่พูดซ้ำ การเด้ง error ขวางแล้วบังคับให้กดต่อ
 *    ทำลายความรู้สึกของการ "คุยอยู่" ทั้งหมด
 * 3. **ขอไมค์ครั้งเดียวตอนรับสาย แล้วถือไว้ทั้งสาย** — `MediaRecorder` ถูกสร้างใหม่
 *    ทุกท่อนบน stream เดิม การขอ `getUserMedia` ใหม่ทุกประโยคทำให้ไฟไมค์กะพริบถี่ๆ
 *    และมีช่องว่างที่คำแรกของประโยคหายไป
 * 4. **เกณฑ์เสียงปรับตามครัวตลอดสาย** — ไม่ได้วัดครั้งเดียวตอนต้นแล้วจบ เพราะคนเปิด
 *    เครื่องดูดควันกลางสายได้ ถ้าเกณฑ์ไม่ขยับตาม มันจะคิดว่ามีคนพูดอยู่ตลอดเวลา
 *    แล้วไม่ยอมตัดจบประโยคอีกเลย
 */
export function useVoiceCall(options: {
  /**
   * ได้ยินผู้ใช้พูดจบหนึ่งประโยคแล้ว — คืน Promise ที่ resolve **เมื่อเชฟตอบและพูดจบแล้ว**
   *
   * ต้องรอให้ resolve ก่อนถึงจะกลับไปฟังต่อ ไม่งั้นไมค์จะเปิดทับตอนลำโพงยังพูดอยู่
   * แล้วได้ยินเสียงเชฟเองไปถอดเป็นคำถามใหม่ วนไม่จบ
   */
  onUtterance: (text: string) => Promise<void>;
  /** ชื่อเมนู + ศัพท์ในครัว ส่งไปเป็นคำใบ้ให้ Whisper ทุกท่อน */
  getBiasContext?: () => { recipeName?: string; terms: string[] };
}) {
  const { onUtterance, getBiasContext } = options;

  const [phase, setPhase] = useState<CallPhase>('idle');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** ประโยคล่าสุดที่ถอดออกมาได้ — เอาไปขึ้นเป็นซับไตเติลระหว่างสาย */
  const [heardText, setHeardText] = useState('');

  // สายยังเปิดอยู่ไหม — ทุกจุดใน loop ต้องเช็คตัวนี้ก่อนทำงานต่อ เพราะผู้ใช้กดวางสาย
  // ได้ทุกจังหวะ รวมถึงระหว่างที่ await ค้างอยู่กลาง network request
  const activeRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const rafRef = useRef<number | null>(null);
  // ระดับเสียงพื้นหลังที่ปรับตัวไปเรื่อยๆ ตลอดสาย (ดูเหตุผลข้อ 4 ด้านบน)
  const noiseFloorRef = useRef(0);

  /**
   * หมายเลขรอบของสาย — กันสายซ้อนกันสองสายบนไมค์เดียว
   *
   * จำเป็นเพราะ `startCall` ต้อง `await getUserMedia` ก่อนถึงจะตั้งค่า `activeRef` ได้
   * ช่องว่างตรงนั้นเปิดโอกาสให้มีการรับสายรอบสองแทรกเข้ามาระหว่างที่รอบแรกยังรออยู่
   * แล้วจะได้ MediaStream สองอันที่ไม่มีใครปล่อย (ไฟไมค์ค้างแม้วางสายแล้ว)
   *
   * เกิดขึ้นจริงทุกครั้งใน dev เพราะ React StrictMode สั่ง effect ทำงานสองรอบเสมอ
   * และเกิดได้ในของจริงถ้าผู้ใช้กดปุ่มโทรรัวๆ ตอนเน็ตหน่วง
   *
   * ทุกจุดที่ยุติสาย (วางสาย, unmount) จะเดินเลขนี้ขึ้นหนึ่ง — รอบที่ตื่นมาแล้วพบว่า
   * เลขไม่ใช่ของตัวเองจะเก็บของของตัวเองทิ้งแล้วถอยออกไปเงียบๆ
   */
  const runIdRef = useRef(0);
  // กันการกดรับสายซ้ำระหว่างที่รอบก่อนหน้ายังขอไมค์ค้างอยู่ (ยังไม่ทันตั้ง activeRef)
  const startingRef = useRef(false);

  const onUtteranceRef = useRef(onUtterance);
  const getBiasContextRef = useRef(getBiasContext);
  useEffect(() => {
    onUtteranceRef.current = onUtterance;
    getBiasContextRef.current = getBiasContext;
  });

  const releaseAudio = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (recorderRef.current?.state === 'recording') {
      try {
        recorderRef.current.stop();
      } catch {
        // recorder ตายไปก่อนแล้ว ไม่มีอะไรต้องทำต่อ
      }
    }
    recorderRef.current = null;
    // ปล่อย track ให้ไฟไมค์บนเครื่องดับจริงหลังวางสาย
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    setLevel(0);
  }, []);

  /**
   * ทิ้งรอบสายปัจจุบันแล้วปล่อยอุปกรณ์ทั้งหมด — ส่วนที่ใช้ร่วมกันระหว่างการวางสายกับการ unmount
   *
   * แยกเป็นฟังก์ชันของตัวเองเพื่อให้ effect ตอน unmount คืนมันไปตรงๆ ได้เลย
   * (`useEffect(() => abandonRun, ...)`) แทนที่จะเขียน cleanup ที่แตะ `.current` ของ ref
   * ซึ่ง eslint เตือนเสมอว่าค่าอาจเปลี่ยนไปแล้วตอน cleanup ทำงาน — รูปแบบเดียวกับที่
   * `useSpeech` ใช้กับ `stop`
   */
  const abandonRun = useCallback(() => {
    activeRef.current = false;
    startingRef.current = false;
    runIdRef.current++;
    releaseAudio();
  }, [releaseAudio]);

  const endCall = useCallback(() => {
    abandonRun();
    setPhase('ended');
    setHeardText('');
  }, [abandonRun]);

  /**
   * อ่านความดัง ณ ขณะนี้เป็นค่า 0-1 (RMS ของคลื่นเสียงดิบ)
   *
   * ต้องระบุ `Uint8Array<ArrayBuffer>` ให้ชัด ไม่ใช่ `Uint8Array` เฉยๆ — TypeScript รุ่นใหม่
   * ทำ TypedArray เป็น generic แล้ว และ `getByteTimeDomainData` ไม่รับตัวที่อิงกับ
   * SharedArrayBuffer ซึ่งเป็นค่าเริ่มต้นที่ TS อนุมานให้เมื่อเขียนแบบไม่ระบุ
   */
  const readLevel = useCallback((samples: Uint8Array<ArrayBuffer>) => {
    const analyser = analyserRef.current;
    if (!analyser) return 0;
    analyser.getByteTimeDomainData(samples);
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      const deviation = (samples[i] - 128) / 128;
      sumSquares += deviation * deviation;
    }
    return Math.sqrt(sumSquares / samples.length);
  }, []);

  /**
   * อัดหนึ่งท่อนจนกว่าจะได้ยินคนพูดจบประโยค
   *
   * คืน `null` เมื่อท่อนนี้ไม่มีเสียงพูด (หมดเวลารอ หรือถูกสั่งวางสาย) ซึ่งเป็นเรื่องปกติ
   * ที่เกิดบ่อยมาก ไม่ใช่ข้อผิดพลาด — ตัวเรียกจะวนไปอัดท่อนใหม่ต่อโดยไม่บอกผู้ใช้
   */
  const recordUtterance = useCallback(
    () =>
      new Promise<Blob | null>(resolve => {
        const stream = streamRef.current;
        const analyser = analyserRef.current;
        if (!stream || !analyser || !activeRef.current) {
          resolve(null);
          return;
        }

        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(stream);
        } catch {
          resolve(null);
          return;
        }
        recorderRef.current = recorder;

        const chunks: Blob[] = [];
        let heardSpeech = false;

        recorder.ondataavailable = e => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          recorderRef.current = null;
          if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          if (!heardSpeech || !chunks.length || !activeRef.current) {
            resolve(null);
            return;
          }
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          // สั้นเกินกว่าจะเป็นประโยค — น่าจะเป็นเสียงของตกหรือประตูตู้เย็น
          resolve(blob.size < 2000 ? null : blob);
        };

        recorder.start();

        const samples = new Uint8Array(analyser.fftSize);
        const startedAt = performance.now();
        let lastLoudAt = 0;
        let lastPaint = 0;

        function tick() {
          if (recorder.state !== 'recording') return;
          rafRef.current = requestAnimationFrame(tick);

          // วางสายกลางท่อน — หยุดทันที ที่เหลือ onstop จัดการ
          if (!activeRef.current) {
            recorder.stop();
            return;
          }

          const rms = readLevel(samples);
          const now = performance.now();
          const elapsed = now - startedAt;

          if (now - lastPaint > 66) {
            lastPaint = now;
            setLevel(Math.min(1, rms * 8));
          }

          const threshold = Math.max(MIN_SPEECH_RMS, noiseFloorRef.current * NOISE_MULTIPLIER);

          if (rms > threshold) {
            heardSpeech = true;
            lastLoudAt = now;
          } else {
            // ปรับฐานเสียงพื้นหลังเฉพาะตอนที่ไม่มีใครพูด — ค่อยๆ ขยับ ไม่กระโดดตามเสียงจาน
            noiseFloorRef.current = noiseFloorRef.current * 0.98 + rms * 0.02;
          }

          if (!heardSpeech) {
            // ยังไม่มีใครพูดในท่อนนี้ — รีไซเคิลไฟล์ที่อัดค้างไว้ แล้วเริ่มท่อนใหม่
            if (elapsed > SEGMENT_WAIT_MS) recorder.stop();
            return;
          }

          if (now - lastLoudAt > SILENCE_END_MS || elapsed > MAX_UTTERANCE_MS) recorder.stop();
        }

        rafRef.current = requestAnimationFrame(tick);
      }),
    [readLevel]
  );

  /** ส่งท่อนเสียงไปถอด — คืนสตริงว่างเมื่อถอดไม่ได้ ซึ่งตัวเรียกถือว่าเป็นเรื่องปกติ */
  const transcribe = useCallback(async (blob: Blob): Promise<string> => {
    try {
      const bias = getBiasContextRef.current?.();
      const form = new FormData();
      const mimeType = blob.type || 'audio/webm';
      form.append('audio', blob, `speech.${audioExtensionFor(mimeType)}`);
      if (bias?.recipeName) form.append('recipeName', bias.recipeName);
      if (bias?.terms?.length) form.append('terms', JSON.stringify(bias.terms));

      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      if (!res.ok) return '';
      const data = await res.json();
      return typeof data.text === 'string' ? data.text : '';
    } catch {
      // เน็ตสะดุดหนึ่งจังหวะ — ไม่ใช่เหตุให้สายหลุด วนไปฟังประโยคถัดไปต่อ
      return '';
    }
  }, []);

  const startCall = useCallback(async () => {
    if (activeRef.current || startingRef.current) return;
    startingRef.current = true;
    const myRun = ++runIdRef.current;
    /** รอบนี้ยังเป็นรอบปัจจุบันอยู่ไหม — ต้องเช็คหลังทุก await ที่ยอมให้คนอื่นแทรกได้ */
    const isCurrentRun = () => runIdRef.current === myRun;
    setError(null);
    setHeardText('');
    setPhase('connecting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // echoCancellation คือด่านแรกที่กันไม่ให้ไมค์ได้ยินเสียงเชฟจากลำโพงตัวเอง
          // (ด่านที่สองคือการไม่เปิดไมค์เลยระหว่างที่เชฟพูด — ดู onUtterance)
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
      setPhase('idle');
      if (isCurrentRun()) startingRef.current = false;
      return;
    }

    // ระหว่างรอสิทธิ์ไมค์ อาจมีการวางสายหรือรับสายรอบใหม่แทรกเข้ามาแล้ว
    // stream ก้อนนี้จึงกลายเป็นของกำพร้าที่ต้องปล่อยเอง ไม่งั้นไฟไมค์ค้างทั้งที่ไม่มีสาย
    if (!isCurrentRun()) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }

    streamRef.current = stream;

    try {
      const AudioCtx: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      // หน้าจอโทรคุยถูกเปิดขึ้นมาหลังการแตะจอไปแล้วหนึ่งจังหวะ บน iOS/Safari
      // AudioContext ที่เกิดนอกจังหวะแตะจะอยู่ในสถานะ suspended และไม่ส่งข้อมูลเสียงออกมาเลย
      // ผลคือเกณฑ์ความดังอ่านได้ 0 ตลอด แล้วสายจะค้างอยู่ที่ "กำลังฟัง" โดยไม่มีอะไรเกิดขึ้น
      await ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
    } catch {
      releaseAudio();
      setError('เบราว์เซอร์นี้วิเคราะห์เสียงไม่ได้ จึงใช้โหมดโทรคุยไม่ได้');
      setPhase('idle');
      if (isCurrentRun()) startingRef.current = false;
      return;
    }

    if (!isCurrentRun()) {
      releaseAudio();
      return;
    }

    activeRef.current = true;
    startingRef.current = false;

    // วัดเสียงพื้นหลังของครัวก่อนเริ่มฟังจริง ถ้าข้ามขั้นนี้ท่อนแรกจะตัดสินผิดเสมอ
    // เพราะฐานเสียงยังเป็น 0 อยู่ (ทุกอย่างดูเหมือนเสียงพูดไปหมด)
    await new Promise<void>(resolve => {
      const analyser = analyserRef.current;
      if (!analyser) {
        resolve();
        return;
      }
      const samples = new Uint8Array(analyser.fftSize);
      const startedAt = performance.now();
      let total = 0;
      let frames = 0;
      function measure() {
        if (!activeRef.current || performance.now() - startedAt > CALIBRATION_MS) {
          noiseFloorRef.current = frames ? total / frames : 0;
          resolve();
          return;
        }
        total += readLevel(samples);
        frames++;
        rafRef.current = requestAnimationFrame(measure);
      }
      rafRef.current = requestAnimationFrame(measure);
    });

    // ---- วงจรของสาย: ฟัง → ถอด → ให้เชฟตอบ → ฟังต่อ วนจนกว่าจะกดวาง ----
    let idleSegments = 0;
    while (activeRef.current && isCurrentRun()) {
      setPhase('listening');
      const blob = await recordUtterance();
      if (!activeRef.current) break;

      if (!blob) {
        // ท่อนนี้ไม่มีเสียงพูด — วนไปฟังต่อเงียบๆ ผู้ใช้ไม่ต้องรู้ว่าเกิดอะไรขึ้น
        idleSegments++;
        if (idleSegments >= IDLE_SEGMENTS_BEFORE_HANGUP) {
          setError('วางสายอัตโนมัติเพราะเงียบไปนาน กดโทรใหม่ได้เลยครับ');
          break;
        }
        continue;
      }
      idleSegments = 0;

      setPhase('transcribing');
      const text = (await transcribe(blob)).trim();
      if (!activeRef.current) break;
      if (!text) continue; // ฟังไม่ออก — ไม่ขัดจังหวะ ปล่อยให้พูดซ้ำเอง

      setHeardText(text);
      setPhase('working');
      try {
        await onUtteranceRef.current(text);
      } catch {
        // เชฟตอบไม่ได้รอบนี้ — สายยังอยู่ ไปฟังประโยคถัดไปต่อ
      }
    }

    // ออกจาก loop เพราะมีรอบใหม่มาแทน = ของถูกเก็บโดยรอบนั้นแล้ว ห้ามไปปิดซ้ำ
    if (!isCurrentRun()) return;
    activeRef.current = false;
    releaseAudio();
    setPhase('ended');
  }, [readLevel, recordUtterance, releaseAudio, transcribe]);

  // ปิดหน้าไปทั้งที่สายยังเปิด — ต้องปล่อยไมค์ ไม่งั้นไฟไมค์ค้างทั้งที่ไม่มีใครฟังแล้ว
  useEffect(() => abandonRun, [abandonRun]);

  return { phase, level, error, heardText, startCall, endCall };
}
