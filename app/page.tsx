'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Loader2, LogIn, ArrowLeft, ChefHat, ListChecks, ShieldAlert, Sparkles } from 'lucide-react';
import {
  saveRecipe as saveToSupabase,
  NotLoggedInError,
} from '@/lib/supabase';
import { startSignIn } from '@/lib/authDialog';
import { signInButtonLabel } from '@/lib/mockAuth';
import { DEFAULT_SERVINGS, clampServings, scaleAmountText, servingsFactor } from '@/lib/utils';
import { DIET_PRESETS, findDietViolations } from '@/lib/diet';
import { DietSelector } from '@/components/DietSelector';
import { useUser } from '@/lib/useUser';
import { loadSession, saveSession } from '@/lib/sessionState';
import type { RecipeSource } from '@/lib/types';
import { AuthButton } from '@/components/AuthButton';
import { StepRail } from '@/components/StepRail';

// New Sub-components
import { IngredientInput } from '@/components/IngredientInput';
import { IngredientList } from '@/components/IngredientList';
import { CuisineSelector } from '@/components/CuisineSelector';
import { RecipeCard } from '@/components/RecipeCard';
import { ImageUpload } from '@/components/ImageUpload';
import { SavedRecipes } from '@/components/SavedRecipes';
import { MenuList } from '@/components/MenuList';
import { CookingMode } from '@/components/CookingMode';
import type { ChatMessage, MenuSuggestion, Recipe, SaveResult } from '@/lib/types';

// สาม key นี้เคยใช้จำสถานะข้ามการรีเฟรช ตอนนี้เลิกใช้หมดแล้ว — เปิดแอปมาต้องเริ่มจากศูนย์เสมอ
// ยังต้องรู้จักชื่อไว้เพื่อล้างของเก่าที่ค้างอยู่ใน browser ของคนที่เคยใช้เวอร์ชันก่อนหน้า
const LEGACY_STORAGE_KEYS = [
  'fridge-menu-ingredients',
  'fridge-menu-cuisine',
  'fridge-menu-recipe',
];

// ขั้นของ flow: กรอกวัตถุดิบ → เลือกเมนูจากลิสต์ → อ่านสูตรเต็ม → ลงมือทำ
type View = 'input' | 'list' | 'detail' | 'cooking';

// --- TypeScript Interfaces ---
interface PageState {
  view: View;
  inputValue: string;
  ingredientList: string[];
  errorMessage: string;
  apiErrorMessage: string;
  isLoadingMenus: boolean;
  // แยกจาก isLoadingMenus เพราะ "ขอเมนูอื่นอีก" ต้องหมุน spinner ที่ปุ่มท้ายลิสต์
  // โดยที่ลิสต์เดิมยังอยู่ให้อ่านต่อได้ ไม่ใช่ล้างจอเป็นหน้าโหลดทั้งหน้าเหมือนตอนหาครั้งแรก
  isLoadingMoreMenus: boolean;
  // ชื่อเมนูที่กำลังรอสูตรเต็ม (null = ไม่ได้รอ) — เก็บเป็นชื่อไม่ใช่ boolean
  // จะได้รู้ว่าต้องหมุน spinner ที่การ์ดใบไหนในลิสต์
  loadingMenuName: string | null;
  menus: MenuSuggestion[];
  // วัตถุดิบ/สไตล์อาหารที่ "ใช้ตอนหาลิสต์นี้มา" — เก็บไว้เทียบกับของปัจจุบัน
  // เพื่อบอกว่าลิสต์เก่าไปแล้วหรือยัง แทนที่จะทิ้งลิสต์เงียบๆ ทุกครั้งที่แตะวัตถุดิบ
  // (รอบรีวิว 30 ก.ค. ข้อ 5: ลบของ 1 อย่างจาก 3 อย่าง แล้วเสียผลลัพธ์ทั้งหมดที่รอมา)
  menusIngredients: string[];
  menusCuisine: string;
  recipe: Recipe | null;
  // สูตรบนจอมาจากไหน — ของที่กู้จากเมนูที่บันทึกไว้ข้อมูลไม่ครบ ห้ามพาไปหน้าสูตรเต็ม
  // (ดู lib/savedRecipe.ts และ RecipeSource ใน lib/types.ts)
  recipeSource: RecipeSource;
  // จำนวนคนกินที่ผู้ใช้เลือก เก็บไว้ที่นี่ที่เดียวเพราะทั้งหน้าสูตร โหมดทำอาหาร
  // แชทกับเชฟ และตอนบันทึกเมนู ต้องเห็นปริมาณชุดเดียวกันหมด
  // ตั้งต้นจาก recipe.servings ทุกครั้งที่เปิดสูตรใหม่
  servings: number;
  isSaved: boolean;
  cuisineType: string;
  // ข้อจำกัดด้านอาหาร: preset ที่กดเลือก (id จาก DIET_PRESETS) + ของที่แพ้ที่พิมพ์เอง
  dietRestrictions: string[];
  allergies: string[];
  allergyInput: string;
  // ของที่ผู้ใช้ติดธงว่า "ใกล้เสีย ใช้ก่อน" — แอปไม่มีทางรู้วันหมดอายุจริง
  // การให้กรอกวันที่ทุกชิ้นคือภาระที่คนไม่ทำ ธงง่ายๆ ได้คุณค่าเดียวกันคือ "จัดลำดับให้"
  priorityIngredients: string[];
  needsLoginToSave: boolean;
  // บทสนทนากับเชฟของสูตรที่เปิดอยู่ — เก็บที่นี่ ไม่ใช่ใน ChefChat
  // กล่องแชทอยู่ในโหมดทำอาหารที่เดียว แต่ ChefChat unmount ทุกครั้งที่ออกจากโหมด
  // (กดออกไปดูสูตรแล้วกลับเข้ามาใหม่) ถ้าปล่อยให้มันถือ state เอง บทสนทนาจะหายทั้งชุด
  // ทั้งที่ยังเป็นเมนูเดียวกัน
  chatMessages: ChatMessage[];
  // เคยเข้าโหมดทำอาหารของสูตรนี้ไปแล้วหรือยัง — ใช้ตัดสินว่าจะแทรกคำทักของโหมดทำอาหาร
  // หรือไม่ ถ้าไม่มีตัวนี้ กดเข้าออกโหมดหลายรอบจะได้คำทักซ้ำกันเรียงกันเป็นพืด
  hasEnteredCooking: boolean;
}

/** คำทักตอนเพิ่งเปิดสูตร — เริ่มบทสนทนาใหม่ทุกครั้งที่เลือกเมนูใหม่ */
function buildGreeting(recipeName: string): ChatMessage {
  return {
    role: 'assistant',
    content: `สวัสดีครับ! ผมเป็นเชฟ AI พร้อมช่วยแนะนำเรื่อง ${recipeName} มีคำถามอะไรไหมครับ?`,
  };
}

export default function Home() {
  const [state, setState] = useState<PageState>({
    view: 'input',
    inputValue: '',
    ingredientList: [],
    errorMessage: '',
    apiErrorMessage: '',
    isLoadingMenus: false,
    isLoadingMoreMenus: false,
    loadingMenuName: null,
    menus: [],
    menusIngredients: [],
    menusCuisine: '',
    recipe: null,
    recipeSource: 'ai' as RecipeSource,
    servings: DEFAULT_SERVINGS,
    isSaved: false,
    cuisineType: 'ทั่วไป',
    dietRestrictions: [],
    allergies: [],
    allergyInput: '',
    priorityIngredients: [],
    needsLoginToSave: false,
    chatMessages: [],
    hasEnteredCooking: false,
  });
  const { user, isLoading: isAuthLoading } = useUser();
  // กันไม่ให้ effect ที่เขียน/ล้างข้อมูลทำงานก่อนที่จะอ่านของเก่าขึ้นมาเสร็จ
  const [isRestored, setIsRestored] = useState(false);
  // เปลี่ยนค่านี้ทุกครั้งที่บันทึกเมนูสำเร็จ เพื่อบังคับให้ SavedRecipes รีเฟรชรายการใหม่
  const [savedRecipesVersion, setSavedRecipesVersion] = useState(0);
  // เปลี่ยนค่านี้ทุกครั้งที่ได้เมนูใหม่ ใช้เป็น key ของ ChefChat เพื่อบังคับให้ mount ใหม่
  // (เคลียร์ประวัติแชทเก่าที่อาจอ้างอิงเมนูก่อนหน้า)
  const [recipeVersion, setRecipeVersion] = useState(0);

  // กู้งานที่ค้างไว้กลับมาหลังรีเฟรช (เก็บใน sessionStorage — ตายเองตอนปิดแท็บ ดู lib/sessionState.ts)
  // และล้าง localStorage ชุดเก่าที่ยังค้างในเครื่องของคนที่เคยใช้เวอร์ชันก่อนหน้าทิ้งไปพร้อมกัน
  // (ต้องทำใน useEffect ไม่ใช่ตอน useState init เพราะ storage เข้าถึงได้แค่ฝั่ง browser)
  useEffect(() => {
    LEGACY_STORAGE_KEYS.forEach(key => window.localStorage.removeItem(key));

    const saved = loadSession();
    if (saved) {
      // sessionStorage อ่านได้เฉพาะฝั่ง browser จึงอ่านตอน useState init ไม่ได้ —
      // component นี้ถูก pre-render ฝั่ง server ด้วย ถ้า init ต่างกัน hydration จะพัง
      // การอ่านหลัง mount แล้ว setState จึงเป็นทางเดียวที่ถูกต้องสำหรับเคสนี้
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(prev => ({
        ...prev,
        view: saved.view,
        inputValue: saved.inputValue,
        ingredientList: saved.ingredientList,
        cuisineType: saved.cuisineType,
        dietRestrictions: saved.dietRestrictions,
        allergies: saved.allergies,
        allergyInput: saved.allergyInput,
        priorityIngredients: saved.priorityIngredients,
        menus: saved.menus,
        menusIngredients: saved.menusIngredients,
        menusCuisine: saved.menusCuisine,
        recipe: saved.recipe,
        recipeSource: saved.recipeSource,
        servings: saved.servings,
        isSaved: saved.isSaved,
        chatMessages: saved.chatMessages,
        hasEnteredCooking: saved.hasEnteredCooking,
      }));
    }
    setIsRestored(true);
  }, []);

  // เขียนสถานะลง sessionStorage ทุกครั้งที่มีอะไรเปลี่ยน
  // ต้องรอ isRestored ก่อน ไม่งั้น render แรก (state ว่างเปล่า) จะทับของที่กำลังจะอ่านขึ้นมา
  useEffect(() => {
    if (!isRestored) return;
    saveSession({
      // โหมดทำอาหารเก็บ stepIndex ไว้ใน CookingMode เอง ถ้ากู้กลับมาเป็น 'cooking'
      // ผู้ใช้จะเด้งกลับไปขั้นที่ 1 โดยไม่มีอะไรบอก ซึ่งน่างงกว่าการพากลับมาหน้าสูตร
      //
      // ยกเว้นสูตรที่กู้มาจากเมนูที่บันทึกไว้ — มันไม่มีหน้าสูตรเต็มให้กลับไป
      // (ความยาก/เวลา/โภชนาการ/เคล็ดลับ ไม่เคยถูกบันทึกลงตาราง) พากลับหน้าแรกแทน
      view:
        state.view === 'cooking'
          ? state.recipeSource === 'saved'
            ? 'input'
            : 'detail'
          : state.view,
      inputValue: state.inputValue,
      ingredientList: state.ingredientList,
      cuisineType: state.cuisineType,
      dietRestrictions: state.dietRestrictions,
      allergies: state.allergies,
      allergyInput: state.allergyInput,
      priorityIngredients: state.priorityIngredients,
      menus: state.menus,
      menusIngredients: state.menusIngredients,
      menusCuisine: state.menusCuisine,
      recipe: state.recipe,
      recipeSource: state.recipeSource,
      servings: state.servings,
      isSaved: state.isSaved,
      chatMessages: state.chatMessages,
      hasEnteredCooking: state.hasEnteredCooking,
    });
  }, [isRestored, state]);

  // แก้ "ข้อจำกัดด้านอาหาร" เมื่อไหร่ ต้องทิ้งลิสต์เมนูทันที ไม่มีทางเลือกอื่น
  // เพราะลิสต์เดิมคิดมาจากเงื่อนไขชุดเก่า — เลือก "มังสวิรัติ" ทีหลังแล้วยังกดเลือกเมนูหมู
  // จากลิสต์เดิมได้ = อันตรายกว่าไม่มีฟีเจอร์นี้เลย
  //
  // ต่างจากการแก้ "วัตถุดิบ/สไตล์อาหาร" ที่แค่ทำให้ลิสต์เก่าไม่ตรงกับของที่มี ซึ่งไม่อันตราย
  // กรณีนั้นเก็บลิสต์ไว้แล้วขึ้นป้ายเตือนแทน (ดู menusAreStale ด้านล่าง)
  const dietSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isRestored) return;

    const signature = JSON.stringify([state.dietRestrictions, state.allergies]);
    // รอบแรกหลังกู้ข้อมูลเสร็จเป็นแค่การจดค่าตั้งต้นไว้เทียบ ไม่ใช่การเปลี่ยนแปลงของผู้ใช้
    if (dietSignatureRef.current === null) {
      dietSignatureRef.current = signature;
      return;
    }
    if (dietSignatureRef.current === signature) return;

    dietSignatureRef.current = signature;
    updateState({ menus: [], menusIngredients: [], menusCuisine: '', apiErrorMessage: '' });
  }, [isRestored, state.dietRestrictions, state.allergies]);

  // ปุ่ม Back ของเบราว์เซอร์ต้องถอยทีละขั้นในแอป ไม่ใช่พาออกจากเว็บไปเลย
  // (รอบรีวิว 30 ก.ค. ข้อ 6 — คนกด Back โดยสัญชาตญาณ ไม่มีใครคิดว่ามันจะลบงานตัวเอง)
  //
  // ใช้ history.pushState ตรงๆ แทน router ของ Next เพราะนี่เป็น state ของ UI ล้วนๆ
  // ไม่ได้เปลี่ยนหน้าจริง ไม่ควรไปกระตุ้นให้ Next re-render ทั้งต้นไม้หรือยิงหา server
  const isPopstateRef = useRef(false);
  const viewInitializedRef = useRef(false);

  useEffect(() => {
    if (!isRestored) return;

    // การเปลี่ยน view ที่เกิดจากการกด Back เอง ไม่ต้อง push ซ้ำ ไม่งั้นจะกดถอยออกไม่ได้เลย
    if (isPopstateRef.current) {
      isPopstateRef.current = false;
      return;
    }

    const url = `#${state.view}`;
    if (!viewInitializedRef.current) {
      viewInitializedRef.current = true;
      window.history.replaceState({ fridgeView: state.view }, '', url);
      return;
    }
    window.history.pushState({ fridgeView: state.view }, '', url);
  }, [isRestored, state.view]);

  useEffect(() => {
    function handlePopstate(event: PopStateEvent) {
      const target = (event.state as { fridgeView?: View } | null)?.fridgeView ?? 'input';
      isPopstateRef.current = true;

      // ถอยกลับไปขั้นที่ไม่มีข้อมูลรองรับแล้ว (เช่นสูตรถูกล้างไป) ให้ตกกลับหน้าแรก
      // ดีกว่าโชว์หน้าเปล่าที่กดอะไรไม่ได้
      setState(prev => {
        const canShow =
          target === 'input' ||
          (target === 'list' && prev.menus.length > 0) ||
          // หน้าสูตรเต็มแสดงได้เฉพาะสูตรที่ AI เขียนมาครบ — ของที่กู้จากเมนูที่บันทึกไว้
          // ขาดหลายช่อง ถอยมาถึงตรงนี้แล้วให้ตกกลับหน้าแรกแทนการโชว์ข้อมูลที่ไม่มีจริง
          (target === 'detail' && prev.recipe !== null && prev.recipeSource === 'ai') ||
          (target === 'cooking' && prev.recipe !== null);
        return { ...prev, view: canShow ? target : 'input' };
      });
    }

    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, []);

  // เปลี่ยนขั้นของ flow แล้วต้องเริ่มอ่านจากหัวหน้าใหม่เสมอ
  // (เดิมกดเมนูจากท้ายลิสต์แล้วหน้าสูตรจะเปิดมาค้างกลางเรื่องตรงตำแหน่งที่เลื่อนค้างไว้)
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.view]);

  // ยังไม่ล็อกอิน = เป็นไปไม่ได้ที่จะมีเมนูบันทึกไว้ (การบันทึกต้องล็อกอินก่อนเสมอ)
  // เพิ่งกดออกจากระบบ ให้รีเซ็ตหัวใจกลับเป็น "ยังไม่บันทึก"
  useEffect(() => {
    if (isAuthLoading || user) return;
    updateState({ isSaved: false });
  }, [user, isAuthLoading]);

  function updateState(partial: Partial<PageState>) {
    setState(prev => ({ ...prev, ...partial }));
  }

  function handleAddIngredient() {
    // รองรับพิมพ์หลายอย่างพร้อมกันคั่นด้วยจุลภาค/ขึ้นบรรทัดใหม่ (เช่น "หมู, ไข่, กะเพรา")
    // ไม่ใช่แค่เพิ่มได้ทีละคำเหมือนเดิม
    const parts = state.inputValue.split(/[,，\n]/);

    const nextList = [...state.ingredientList];
    let addedCount = 0;
    let lastDuplicate = '';

    for (const part of parts) {
      // Input Sanitization: Remove special characters and limit length
      const sanitized = part
        .trim()
        .replace(/[<>{}[\]()"'\\]/g, '') // Basic XSS/Injection prevention
        .slice(0, 50); // Limit length

      if (!sanitized) continue;

      const isDuplicate = nextList.some(
        i => i.toLowerCase() === sanitized.toLowerCase()
      );
      if (isDuplicate) {
        lastDuplicate = sanitized;
        continue;
      }

      nextList.push(sanitized);
      addedCount++;
    }

    if (addedCount === 0) {
      updateState({
        errorMessage: lastDuplicate
          ? `"${lastDuplicate}" มีอยู่ในรายการแล้ว`
          : 'กรุณาระบุวัตถุดิบที่ถูกต้อง',
      });
      return;
    }

    updateState({
      ingredientList: nextList,
      inputValue: '',
      errorMessage: '',
    });
  }

  function handleRemoveIngredient(index: number) {
    const removed = state.ingredientList[index];
    updateState({
      ingredientList: state.ingredientList.filter((_, i) => i !== index),
      // ธงเก็บเป็นชื่อ ถ้าไม่เก็บกวาดตรงนี้จะเหลือธงค้างชี้ไปหาของที่ไม่อยู่ในลิสต์แล้ว
      // แล้วมันจะถูกส่งไปให้ AI ต่อเงียบๆ ทั้งที่ผู้ใช้ลบทิ้งไปแล้ว
      priorityIngredients: state.priorityIngredients.filter(i => i !== removed),
    });
  }

  function handleTogglePriority(ingredient: string) {
    updateState({
      priorityIngredients: state.priorityIngredients.includes(ingredient)
        ? state.priorityIngredients.filter(i => i !== ingredient)
        : [...state.priorityIngredients, ingredient],
    });
  }

  function handleToggleDiet(id: string) {
    updateState({
      dietRestrictions: state.dietRestrictions.includes(id)
        ? state.dietRestrictions.filter(d => d !== id)
        : [...state.dietRestrictions, id],
    });
  }

  // ของที่แพ้รับพิมพ์อิสระ (ลิสต์สำเร็จรูปครอบคลุมไม่หมด คนแพ้ของแปลกๆ มีจริง)
  // คั่นด้วยจุลภาคได้เหมือนช่องวัตถุดิบ เพราะคนที่แพ้หลายอย่างมักพิมพ์รวดเดียว
  function handleAddAllergy() {
    const parts = state.allergyInput.split(/[,，\n]/);
    const nextList = [...state.allergies];

    for (const part of parts) {
      const sanitized = part.trim().replace(/[<>{}[\]()"'\\]/g, '').slice(0, 30);
      if (!sanitized) continue;
      if (nextList.some(a => a.toLowerCase() === sanitized.toLowerCase())) continue;
      nextList.push(sanitized);
    }

    if (nextList.length === state.allergies.length) {
      updateState({ allergyInput: '' });
      return;
    }
    updateState({ allergies: nextList, allergyInput: '' });
  }

  function handleRemoveAllergy(index: number) {
    updateState({ allergies: state.allergies.filter((_, i) => i !== index) });
  }

  // คืนจำนวนที่เพิ่มเข้าลิสต์จริง ให้ ImageUpload เอาไปบอกผู้ใช้ได้ว่าสแกนแล้วได้อะไรมาบ้าง
  // (ถ้าคืน 0 แปลว่าของในรูปซ้ำกับที่มีอยู่แล้วทั้งหมด ซึ่งบนจอจะดูเหมือนไม่มีอะไรเกิดขึ้น)
  function handleDetectedIngredients(newIngredients: string[]): number {
    const currentList = [...state.ingredientList];
    let addedCount = 0;

    newIngredients.forEach(ing => {
      if (!currentList.some(i => i.toLowerCase() === ing.toLowerCase())) {
        currentList.push(ing);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      updateState({ ingredientList: currentList });
    }
    return addedCount;
  }

  // วัตถุดิบที่ผู้ใช้พิมพ์มาเองแต่ขัดกับเงื่อนไขที่เพิ่งเลือก (เช่น มีหมูสับอยู่ แล้วมากดฮาลาลทีหลัง)
  // ไม่ลบให้เงียบๆ เพราะของพวกนี้อาจอยู่ในตู้เย็นจริงเพื่อคนอื่นในบ้าน แต่ต้องไม่ถูกส่งไปให้ AI ใช้
  // และต้องบอกให้เห็นชัดว่าตัดอะไรออกไปบ้าง ไม่งั้นจะงงว่าทำไมเมนูที่ได้ไม่มีของชิ้นนี้เลย
  const blockedIngredients = state.ingredientList.filter(
    ing => findDietViolations(ing, state.dietRestrictions, state.allergies).length > 0
  );
  const usableIngredients = state.ingredientList.filter(ing => !blockedIngredients.includes(ing));

  // ธงที่ติดไว้บนของที่ถูกตัดออกเพราะขัดข้อจำกัด ต้องไม่ถูกส่งไปให้ AI ด้วย
  // (ติดธงหมูสับไว้ แล้วมากดฮาลาลทีหลัง = ห้ามไปบอก AI ว่า "เน้นเมนูที่ใช้หมูสับ")
  const usablePriorityIngredients = state.priorityIngredients.filter(ing =>
    usableIngredients.includes(ing)
  );

  // ลิสต์เมนูที่ยังอยู่ แต่คิดมาจากวัตถุดิบ/สไตล์อาหารชุดก่อนหน้า
  //
  // เดิมแตะวัตถุดิบนิดเดียวแล้วลิสต์ทั้งชุดหายไปเงียบๆ ต่อหน้าต่อตา ไม่มีเตือน ไม่มี undo
  // (รอบรีวิว 30 ก.ค. ข้อ 5) — ตอนนี้เก็บลิสต์ไว้ให้กดต่อได้ แล้วขึ้นป้ายบอกว่ามันเก่าแล้ว
  // ให้ผู้ใช้เลือกเองว่าจะหาใหม่ตอนไหน
  //
  // ⚠️ ใช้กับการเปลี่ยน "วัตถุดิบ/สไตล์อาหาร" เท่านั้น การเปลี่ยน "ข้อจำกัดด้านอาหาร"
  // ยังทิ้งลิสต์ทันทีเหมือนเดิม เพราะเป็นเรื่องความปลอดภัย ไม่ใช่แค่ความไม่ตรงกัน
  const menusAreStale =
    state.menus.length > 0 &&
    (state.menusCuisine !== state.cuisineType ||
      state.menusIngredients.join('|') !==
        [...usableIngredients, ...usablePriorityIngredients.map(i => `!${i}`)].join('|'));

  // ขั้นที่ 1 ของการหาเมนู: ขอแค่ "ตัวเลือก" หลายเมนูแบบย่อ ยังไม่ใช่สูตรเต็ม
  // (สูตรเต็มของทั้ง 10 เมนูจะรอนานเกินไป และส่วนใหญ่ผู้ใช้จะเลือกทำแค่เมนูเดียว)
  //
  // `append: true` = ผู้ใช้กด "ขอเมนูอื่นอีก" ที่ท้ายลิสต์ — ต่อท้ายของเดิม ไม่ใช่แทนที่
  // (คนที่กดปุ่มนี้มักมีเมนูที่ยังลังเลอยู่ 1-2 อันในลิสต์เดิม ถ้าล้างทิ้งเขาจะเสียตัวเลือกนั้นไป
  //  ซึ่งเป็นอาการ "แอปลืมงานของผู้ใช้" แบบเดียวกับที่รีวิวติมาแล้ว)
  async function fetchMenus({ append = false }: { append?: boolean } = {}) {
    if (append) {
      updateState({ isLoadingMoreMenus: true, apiErrorMessage: '' });
    } else {
      updateState({
        isLoadingMenus: true,
        menus: [],
        recipe: null,
        recipeSource: 'ai',
        isSaved: false,
        needsLoginToSave: false,
        errorMessage: '',
        apiErrorMessage: '',
      });
    }

    try {
      const res = await fetch('/api/suggest-menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients: usableIngredients,
          cuisineType: state.cuisineType,
          dietRestrictions: state.dietRestrictions,
          allergies: state.allergies,
          priorityIngredients: usablePriorityIngredients,
          // ส่งชื่อที่ผู้ใช้เห็นไปแล้วไปด้วย ไม่งั้นกดขอเพิ่มแล้วได้ของเดิมกลับมา
          excludeMenus: append ? state.menus.map(m => m.recipe_name) : [],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'API Error');
      }

      if (append) {
        // ใช้ prev ไม่ใช่ state.menus เพราะ state ในนี้เป็นค่า ณ ตอนเริ่มยิง request
        // และกันชื่อซ้ำอีกชั้นฝั่ง client เผื่อ AI เลี่ยงกฎด้วยการเปลี่ยนชื่อเล็กน้อย
        setState(prev => {
          const seen = new Set(prev.menus.map(m => m.recipe_name));
          const fresh = (data.menus as MenuSuggestion[]).filter(m => !seen.has(m.recipe_name));
          return { ...prev, menus: [...prev.menus, ...fresh] };
        });
      } else {
        updateState({
          menus: data.menus,
          view: 'list',
          // จดไว้ว่าลิสต์ชุดนี้คิดมาจากอะไร เอาไว้เทียบทีหลังว่ายังตรงกับของที่มีอยู่ไหม
          // รวมธง "ใช้ก่อน" เข้าไปใน signature ด้วย เพราะมันเปลี่ยนลำดับของลิสต์
          // ติดธงเพิ่มทีหลังแล้วลิสต์เดิมยังเรียงแบบไม่สนธง = ป้ายบอกว่าเก่าแล้วต้องขึ้น
          menusIngredients: [...usableIngredients, ...usablePriorityIngredients.map(i => `!${i}`)],
          menusCuisine: state.cuisineType,
        });
      }
    } catch (err) {
      updateState({
        apiErrorMessage: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      updateState(append ? { isLoadingMoreMenus: false } : { isLoadingMenus: false });
    }
  }

  // ขั้นที่ 2: ผู้ใช้เลือกเมนูจากลิสต์แล้ว ค่อยขอสูตรเต็มของเมนูนั้นเมนูเดียว
  async function handleSelectMenu(menu: MenuSuggestion) {
    updateState({ loadingMenuName: menu.recipe_name, apiErrorMessage: '' });
    try {
      const res = await fetch('/api/generate-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients: usableIngredients,
          cuisineType: state.cuisineType,
          dietRestrictions: state.dietRestrictions,
          allergies: state.allergies,
          priorityIngredients: usablePriorityIngredients,
          menuName: menu.recipe_name,
          // การ์ดบอกไปแล้วว่าจานนี้ใช้ของชิ้นไหนบ้าง ส่งไปให้สูตรเต็มยึดตามด้วย
          // ไม่งั้นสูตรจะลากของทั้งตู้เย็นมาใส่จานเดียว (ซุปมะเขือเทศใส่เบียร์กับลูกแพร์)
          menuIngredients: menu.uses_ingredients,
          // ส่งค่าที่การ์ดในลิสต์โชว์ไปแล้วกลับไปด้วย ให้สูตรเต็มใช้ตัวเลขเดียวกัน ไม่ใช่คิดใหม่แล้วขัดกันเอง
          estimatedTime: menu.estimated_time,
          difficulty: menu.difficulty,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'API Error');
      }

      updateState({
        recipe: data,
        recipeSource: 'ai',
        // เริ่มที่จำนวนคนที่สูตรเขียนมาให้เสมอ ตัวเลขที่โชว์จะได้ตรงกับที่ AI คิดไว้เป๊ะ
        // ก่อนที่ผู้ใช้จะเริ่มปรับเอง (ไม่งั้นเปิดสูตรมาก็เห็นปริมาณที่ถูกคูณไปแล้ว)
        servings: clampServings(data.servings),
        isSaved: false,
        needsLoginToSave: false,
        view: 'detail',
        // เมนูใหม่ = บทสนทนาใหม่ ของเก่าอ้างถึงสูตรคนละอันแล้ว
        chatMessages: [buildGreeting(data.recipe_name)],
        hasEnteredCooking: false,
      });
      setRecipeVersion(v => v + 1);
    } catch (err) {
      updateState({
        apiErrorMessage: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      updateState({ loadingMenuName: null });
    }
  }

  // คืนผลลัพธ์ออกไปด้วย เพราะโหมดทำอาหารกินพื้นที่ทั้งจอของตัวเอง มองไม่เห็นกล่องชวนล็อกอิน
  // กับแถบ error ที่อยู่ในหน้าสูตร ปุ่มบันทึกที่นั่นเลยต้องรู้ผลเองเพื่อขึ้นข้อความของตัวเอง
  async function handleSave(): Promise<SaveResult> {
    if (!state.recipe) return 'error';
    if (state.isSaved) return 'saved';

    // ยังไม่ล็อกอิน: ไม่เด้งออกไป Google ทันที เพราะผู้ใช้อาจแค่กดสำรวจดูว่าปุ่มนี้ทำอะไร
    // ขึ้นกล่องชวนล็อกอินให้เขาเลือกเองว่าจะไปต่อไหม
    if (!user) {
      updateState({ needsLoginToSave: true, apiErrorMessage: '' });
      return 'need-login';
    }

    // Optimistic Update
    updateState({ isSaved: true, apiErrorMessage: '', needsLoginToSave: false });

    try {
      // Mapping back to what Supabase expects if needed,
      // but let's keep it simple for now as per previous logic
      // บันทึกปริมาณตามจำนวนคนที่ผู้ใช้ตั้งไว้ตอนกดหัวใจ ไม่ใช่ปริมาณตั้งต้นของ AI
      // (ตาราง saved_recipes เก็บวัตถุดิบเป็นข้อความล้วน ไม่มีช่องเก็บจำนวนคนแยก
      //  จึงพ่วงไว้ในชื่อบรรทัดแรกให้เปิดดูย้อนหลังแล้วยังรู้ว่าเป็นสูตรของกี่คน)
      const factor = servingsFactor(state.servings, state.recipe.servings);
      await saveToSupabase({
        name: state.recipe.recipe_name,
        ingredients: [
          `(สูตรสำหรับ ${state.servings} คน)`,
          ...state.recipe.ingredients.map(i => `${i.item} (${scaleAmountText(i, factor)})`),
        ],
        steps: state.recipe.instructions
      });
      setSavedRecipesVersion(v => v + 1);
      return 'saved';
    } catch (error) {
      console.error('Failed to save:', error);
      // session หมดอายุระหว่างเปิดหน้าค้างไว้ก็มาลงที่นี่ได้ ให้ชวนล็อกอินใหม่แทนขึ้น error เฉยๆ
      if (error instanceof NotLoggedInError) {
        updateState({ isSaved: false, needsLoginToSave: true });
        return 'need-login';
      }
      updateState({ isSaved: false, apiErrorMessage: 'ไม่สามารถบันทึกเมนูได้' });
      return 'error';
    }
  }

  /**
   * "ทำซ้ำอีกรอบ" จากเมนูที่บันทึกไว้ — เข้าโหมดทำอาหารเลย ไม่แวะหน้าสูตร
   *
   * ไม่แวะหน้าสูตรเพราะสูตรที่กู้มามีแค่ชื่อ/วัตถุดิบ/ขั้นตอน ส่วนความยาก เวลา
   * โภชนาการ เคล็ดลับเชฟ ไม่เคยถูกบันทึกลงตาราง (ดู lib/savedRecipe.ts)
   * โหมดทำอาหารใช้แค่ 4 อย่างที่มีครบพอดี จึงเป็นปลายทางเดียวที่แสดงได้ตรงความจริง
   *
   * ตั้ง isSaved เป็น true เพราะมันถูกบันทึกไปแล้ว — ปุ่มหัวใจในหน้าจบจะได้ไม่ชวน
   * ให้กดบันทึกซ้ำจนได้แถวซ้ำในตาราง
   */
  function cookSavedRecipe(recipe: Recipe, servings: number) {
    updateState({
      recipe,
      recipeSource: 'saved',
      servings,
      isSaved: true,
      needsLoginToSave: false,
      apiErrorMessage: '',
      view: 'cooking',
      // คนละเมนูกับที่คุยค้างไว้ ต้องเริ่มบทสนทนาใหม่ ไม่ใช่ต่อของเดิม
      hasEnteredCooking: true,
      chatMessages: [
        buildGreeting(recipe.recipe_name),
        {
          role: 'assistant',
          content:
            'ลงมือทำแล้วนะครับ ติดตรงไหนถามได้เลย ผมดูขั้นตอนที่คุณทำอยู่ตามไปด้วย',
        },
      ],
    });
    // บังคับให้ ChefChat mount ใหม่ ไม่งั้นกล่องแชทจะยังถือประวัติของเมนูก่อนหน้า
    setRecipeVersion(v => v + 1);
  }

  // แยกเป็นฟังก์ชันเพราะการเข้าโหมดทำอาหารไม่ได้แค่เปลี่ยน view อย่างเดียวแล้ว
  // ต้องแทรกคำทักของโหมดนี้ต่อท้ายบทสนทนาเดิมด้วย (ไม่ใช่ล้างแล้วเริ่มใหม่)
  function enterCookingMode() {
    if (state.hasEnteredCooking) {
      updateState({ view: 'cooking' });
      return;
    }

    // กล่องถาม-ตอบโผล่ครั้งแรกตอนกดปุ่มนี้ ไม่ได้อยู่ที่หน้าสูตรแล้ว ถ้ายังไม่มีใครคุย
    // (มีแค่คำทักตอนเปิดสูตร) ก็ไม่ต้องเก็บคำทักนั้นไว้ ไม่งั้นเข้ามาเจอเชฟทักซ้อนสองฟองรวด
    const hasTalked = state.chatMessages.some(m => m.role === 'user');

    updateState({
      view: 'cooking',
      hasEnteredCooking: true,
      chatMessages: [
        ...(hasTalked ? state.chatMessages : []),
        {
          role: 'assistant',
          content:
            'ลงมือทำแล้วนะครับ ติดตรงไหนถามได้เลย ผมดูขั้นตอนที่คุณทำอยู่ตามไปด้วย',
        },
      ],
    });
  }

  function handleSignInToSave() {
    // ล็อกอินสำเร็จโดยไม่ออกนอกแอป (อีเมล/รหัสผ่าน หรือโหมดจำลอง) ต้องเก็บกล่องชวนล็อกอิน
    // เองตรงนี้ ไม่งั้นมันค้างทับปุ่มหัวใจทั้งที่ล็อกอินเรียบร้อยแล้ว
    // (ปิดแล้วกดหัวใจซ้ำได้เลย — ตอนนั้น user มีค่าแล้วจึงเซฟผ่าน)
    //
    // ทาง Google ไม่ผ่าน callback นี้เพราะเบราว์เซอร์เด้งออกไปแล้วโหลดหน้าใหม่ทั้งหน้า
    // แต่ไม่ต้องจัดการเพิ่ม — `needsLoginToSave` ไม่ได้ถูกเก็บลง sessionStorage
    // (ดู `SavedSession` ใน lib/sessionState.ts) กลับมาแล้วมันจึงเริ่มที่ false เอง
    //
    // ส่วน error ทั้งหมดไปแสดงในกล่องเข้าสู่ระบบแทน ที่นี่จึงไม่มี catch แล้ว
    startSignIn({ onSuccess: () => updateState({ needsLoginToSave: false }) });
  }

  // โหมดทำอาหารกินพื้นที่ทั้งจอของตัวเอง (ไม่มี header/ฟอร์มวัตถุดิบมากวน)
  // คนที่ยืนอยู่หน้าเตาควรเห็นแค่ขั้นตอนที่ต้องทำกับช่องถามเชฟเท่านั้น
  if (state.view === 'cooking' && state.recipe) {
    return (
      <CookingMode
        key={recipeVersion}
        recipe={state.recipe}
        ingredients={usableIngredients}
        servings={state.servings}
        dietRestrictions={state.dietRestrictions}
        allergies={state.allergies}
        isSaved={state.isSaved}
        onSave={handleSave}
        // ทำเสร็จแล้วมักอยากทำเมนูถัดไปต่อเลย ลิสต์เมนูชุดเดิมยังอยู่ครบ ไม่ต้องรอ AI คิดใหม่
        onPickAnotherMenu={
          state.menus.length > 0 ? () => updateState({ view: 'list' }) : undefined
        }
        onStartOver={() => updateState({ view: 'input', apiErrorMessage: '' })}
        // สูตรที่กู้มาจากเมนูที่บันทึกไว้ไม่มีหน้าสูตรเต็มให้กลับไป — พากลับหน้าแรกแทน
        // และเปลี่ยนป้ายปุ่มตามด้วย ไม่งั้นปุ่มจะสัญญาปลายทางที่ไม่ได้พาไป
        onExit={() =>
          updateState({ view: state.recipeSource === 'saved' ? 'input' : 'detail' })
        }
        exitLabel={state.recipeSource === 'saved' ? 'กลับไปหน้าแรก' : 'กลับไปหน้าสูตร'}
        chatMessages={state.chatMessages}
        onChatMessagesChange={updater =>
          setState(prev => ({ ...prev, chatMessages: updater(prev.chatMessages) }))
        }
      />
    );
  }

  // พื้นหลังอุ่นขึ้นทีละขั้น (ดูคำอธิบายระบบสีใน app/globals.css)
  const groundClass = {
    input: 'ground-fridge',
    list: 'ground-list',
    detail: 'ground-recipe',
    cooking: 'ground-stove',
  }[state.view];

  const stepNumber = { input: 1, list: 2, detail: 3, cooking: 4 }[state.view];

  return (
    <main className={`ground ${groundClass} min-h-screen`}>
      {/* แถบบนติดหนึบ: ชื่อแอป + แถบอุณหภูมิบอกขั้น + ปุ่มบัญชี
          จำเป็นตั้งแต่ปุ่ม Back ใช้ถอยทีละขั้นได้ — ก่อนหน้านี้ทุกหน้าหน้าตาเหมือนกันหมด
          ถอยไปแล้วไม่รู้ว่ามาอยู่ตรงไหน */}
      <div className="sticky top-0 z-30 border-b border-line/60 bg-steam/85 backdrop-blur-sm">
        <div className="mx-auto max-w-xl px-4 py-2.5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-[family-name:var(--font-display-family)] text-sm font-semibold tracking-tight text-basil">
              ล้างตู้เย็น
            </span>
            <AuthButton />
          </div>
          <StepRail step={stepNumber} />
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">

        {/* ---------- ขั้นที่ 1: กรอกวัตถุดิบ ---------- */}
        {state.view === 'input' && (
          <>
            {/* หัวเรื่องคือคำถาม ช่องพิมพ์ข้างล่างคือคำตอบ — ไม่ต้องมีคำอธิบายคั่นกลาง */}
            <div className="space-y-2 pt-2">
              <p className="eyebrow">เปิดตู้เย็นดูก่อน</p>
              <h1 className="text-[2rem] font-semibold leading-[1.15] text-deep">
                วันนี้เหลืออะไร<br />อยู่ในตู้เย็นบ้าง
              </h1>
              <p className="max-w-sm text-sm leading-relaxed text-ash">
                พิมพ์ของที่เหลือลงไป แล้วเลือกเมนูที่ทำได้จริงจากของชุดนั้น
                ไม่ต้องออกไปซื้อเพิ่ม
              </p>
            </div>

            <SavedRecipes key={savedRecipesVersion} onCookAgain={cookSavedRecipe} />

            {/* หาเมนูไว้แล้วแต่ย้อนกลับมาดูวัตถุดิบ — ให้กลับไปลิสต์เดิมได้โดยไม่ต้องรอ AI ใหม่ */}
            {state.menus.length > 0 && (
              <button
                onClick={() => updateState({ view: 'list' })}
                className="flex items-center gap-1.5 text-sm text-basil hover:text-basil transition-colors mx-auto"
              >
                <ListChecks className="w-3.5 h-3.5" />
                กลับไปดูเมนูที่หาไว้ ({state.menus.length} เมนู)
                {menusAreStale && (
                  <span className="text-xs text-[#8a5a12]">— จากของชุดก่อนหน้า</span>
                )}
              </button>
            )}

            {/* Input Card */}
            <Card>
              <CardContent className="pt-5 space-y-6">
                <ImageUpload onIngredientsDetected={handleDetectedIngredients} />

                <IngredientInput
                  value={state.inputValue}
                  onChange={(val) => updateState({ inputValue: val, errorMessage: '' })}
                  onAdd={handleAddIngredient}
                  error={state.errorMessage}
                />

                <IngredientList
                  ingredients={state.ingredientList}
                  onRemove={handleRemoveIngredient}
                  onClearAll={() => updateState({ ingredientList: [], priorityIngredients: [] })}
                  priorityIngredients={usablePriorityIngredients}
                  onTogglePriority={handleTogglePriority}
                />

                <CuisineSelector
                  selected={state.cuisineType}
                  onSelect={(val) => updateState({ cuisineType: val })}
                />

                <DietSelector
                  selected={state.dietRestrictions}
                  onToggle={handleToggleDiet}
                  allergies={state.allergies}
                  allergyInput={state.allergyInput}
                  onAllergyInputChange={val => updateState({ allergyInput: val })}
                  onAddAllergy={handleAddAllergy}
                  onRemoveAllergy={handleRemoveAllergy}
                />

                {/* ของในลิสต์ที่ขัดกับเงื่อนไข — ต้องบอกก่อนกดหา ไม่ใช่ให้ไปงงเอาตอนเห็นผลลัพธ์ */}
                {blockedIngredients.length > 0 && (
                  <div className="flex gap-2 px-3 py-2.5 rounded-lg bg-yolk/10 border border-yolk/35">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[#8a5a12]" />
                    <p className="text-xs leading-relaxed text-[#8a5a12]">
                      <strong>{blockedIngredients.join(', ')}</strong> ขัดกับข้อจำกัดที่เลือกไว้
                      เลยจะไม่ถูกเอาไปคิดเมนูให้ (ยังอยู่ในลิสต์ ถ้าไม่ต้องการให้กด × ลบออกได้)
                      {usableIngredients.length === 0 && (
                        <> — ตอนนี้ไม่เหลือวัตถุดิบที่ใช้ได้เลย ต้องเพิ่มของอย่างอื่นก่อนถึงจะหาเมนูได้</>
                      )}
                    </p>
                  </div>
                )}

                <hr className="border-border" />

                <Button
                  className="w-full h-12 text-base font-semibold"
                  onClick={() => fetchMenus()}
                  disabled={usableIngredients.length === 0 || state.isLoadingMenus}
                >
                  {state.isLoadingMenus ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> กำลังหาเมนูให้เลือก...</>
                  ) : (
                    <><Search className="w-4 h-4 mr-2" /> หาเมนูล้างตู้เย็น</>
                  )}
                </Button>

                {state.apiErrorMessage && (
                  <p className="text-sm text-chili bg-chili/10 border border-chili/20 rounded-lg px-3 py-2 text-center">
                    {state.apiErrorMessage}
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ---------- ขั้นที่ 2: เลือกเมนูจากลิสต์ ---------- */}
        {state.view === 'list' && (
          <>
            <div className="space-y-3">
              <button
                onClick={() => updateState({ view: 'input', apiErrorMessage: '' })}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> แก้วัตถุดิบ
              </button>

              <div className="space-y-1">
                <p className="eyebrow">ทำได้จากของที่มี</p>
                <h1 className="text-[1.75rem] font-semibold leading-tight text-deep">
                  เลือกเมนูที่อยากทำ
                </h1>
                {/* บอกจำนวนที่ได้เสมอ ไม่ใช่แค่ตอนได้น้อย — รอบรีวิวติว่าเลือก "ทำเร็ว" แล้วเหลือ 4 เมนู
                    โดยหัวข้อเขียนเหมือนเดิมทุกอย่าง จนแยกไม่ออกว่าเป็นผลลัพธ์ปกติหรือระบบพังกลางทาง
                    ตอนนี้ยิ่งต้องบอก เพราะ API เลิกบังคับตัวเองให้ตอบครบ 10 เมนูแล้ว (ดู suggest-menus กฎข้อ 2) */}
                <p className="text-sm text-muted-foreground">
                  จากวัตถุดิบ {usableIngredients.length} อย่างที่มี หาได้ {state.menus.length} เมนู
                  — กดเมนูเพื่อดูสูตรเต็ม
                </p>
                {state.menus.length < 5 && (
                  <p className="text-xs text-muted-foreground">
                    ได้ไม่เยอะเพราะเลือกมาเฉพาะจานที่เป็นอาหารมีอยู่จริง
                    ไม่เอาชื่อที่แต่งขึ้นมาจากวัตถุดิบที่พิมพ์ไว้มาปนให้ครบจำนวน
                  </p>
                )}

                {/* ย้ำเงื่อนไขที่กรองไว้ให้เห็นในหน้าที่ต้องตัดสินใจเลือกเมนูด้วย
                    คนที่แพ้อาหารต้องเห็นว่าลิสต์นี้กรองมาแล้วจริง ไม่ใช่ต้องเชื่อใจลอยๆ */}
                {(state.dietRestrictions.length > 0 || state.allergies.length > 0) && (
                  <p className="text-xs text-basil bg-basil-soft border border-basil/20 rounded-lg px-3 py-2 inline-block">
                    กรองตามเงื่อนไขแล้ว:{' '}
                    {[
                      ...state.dietRestrictions.map(id => DIET_PRESETS.find(p => p.id === id)?.shortLabel ?? id),
                      ...state.allergies.map(a => `แพ้${a}`),
                    ].join(' · ')}
                  </p>
                )}
              </div>
            </div>

            {state.apiErrorMessage && (
              <p className="text-sm text-chili bg-chili/10 border border-chili/20 rounded-lg px-3 py-2 text-center">
                {state.apiErrorMessage}
              </p>
            )}

            {menusAreStale && (
              <div className="flex flex-col gap-2 rounded-lg border border-yolk/35 bg-yolk/10 px-3 py-2.5">
                <p className="text-xs leading-relaxed text-[#8a5a12]">
                  วัตถุดิบเปลี่ยนไปจากตอนที่หาลิสต์นี้มา — เมนูข้างล่างยังกดดูสูตรได้ตามปกติ
                  แต่คิดมาจากของชุดก่อนหน้า
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 self-start bg-white text-xs"
                  onClick={() => fetchMenus()}
                  disabled={state.isLoadingMenus || usableIngredients.length === 0}
                >
                  {state.isLoadingMenus ? (
                    <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> กำลังหาใหม่...</>
                  ) : (
                    <><Search className="mr-1.5 h-3 w-3" /> หาเมนูใหม่จากของชุดปัจจุบัน</>
                  )}
                </Button>
              </div>
            )}

            <MenuList
              menus={state.menus}
              onSelect={handleSelectMenu}
              loadingMenuName={state.loadingMenuName}
            />

            {state.loadingMenuName && (
              <p className="text-center text-xs text-muted-foreground">
                กำลังเขียนสูตรเต็มของ &ldquo;{state.loadingMenuName}&rdquo; ให้อยู่...
              </p>
            )}

            {/* ไม่ถูกใจสักอันก็ขอเพิ่มได้ โดยไม่ต้องทิ้งลิสต์เดิมแล้วหาใหม่ทั้งชุด
                เมนูใหม่ต่อท้ายลิสต์เดิม (ไม่เรียงรวมใหม่) ให้เห็นชัดว่าอันไหนคือของที่เพิ่งขอมา */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fetchMenus({ append: true })}
              disabled={state.isLoadingMoreMenus || state.loadingMenuName !== null}
            >
              {state.isLoadingMoreMenus ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> กำลังคิดเมนูอื่นให้...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> ขอเมนูอื่นอีก</>
              )}
            </Button>
          </>
        )}

        {/* ---------- ขั้นที่ 3: อ่านสูตรเต็ม แล้วตัดสินใจว่าจะทำไหม ---------- */}
        {state.view === 'detail' && state.recipe && (
          <>
            <button
              onClick={() => updateState({ view: 'list', apiErrorMessage: '' })}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> กลับไปเลือกเมนูอื่น
            </button>

            {/* ผลของการกดหัวใจต้องอยู่เหนือการ์ด ไม่ใช่ใต้การ์ด
                ปุ่มหัวใจอยู่มุมบนของการ์ดซึ่งสูงกว่าหนึ่งจอเต็ม ถ้าวางผลลัพธ์ไว้ท้ายการ์ด
                คนกดจะไม่เห็นอะไรขยับเลยแล้วสรุปว่าปุ่มเสีย (กดซ้ำหลายทีก่อนจะเลิกกด) */}
            {state.apiErrorMessage && (
              <p className="text-sm text-chili bg-chili/10 border border-chili/20 rounded-lg px-3 py-2 text-center">
                {state.apiErrorMessage}
              </p>
            )}

            {/* ชวนล็อกอินตอนกดหัวใจทั้งที่ยังไม่ได้ล็อกอิน */}
            {state.needsLoginToSave && (
              <div className="flex flex-col items-center gap-3 px-6 py-5 bg-white rounded-xl border text-center">
                <p className="text-sm text-muted-foreground">
                  เข้าสู่ระบบก่อนถึงจะเก็บเมนูนี้ไว้ดูทีหลังได้
                  <br />
                  <span className="text-xs">
                    เมนูที่บันทึกจะตามไปด้วยทุกเครื่องที่ล็อกอินบัญชีเดียวกัน
                  </span>
                </p>
                <Button size="sm" onClick={handleSignInToSave}>
                  <LogIn className="w-4 h-4 mr-2" /> {signInButtonLabel}
                </Button>
                <button
                  onClick={() => updateState({ needsLoginToSave: false })}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ไว้ทีหลัง
                </button>
              </div>
            )}

            <RecipeCard
              recipe={state.recipe}
              servings={state.servings}
              onServingsChange={value => updateState({ servings: clampServings(value) })}
              isSaved={state.isSaved}
              onSave={handleSave}
            />

            {/* ปุ่มเข้าโหมดทำอาหาร — sticky ไว้เพราะสูตรยาว จะได้กดได้โดยไม่ต้องเลื่อนหาปลายหน้า */}
            <div className="sticky bottom-4 z-10">
              <Button
                className="w-full h-12 text-base font-semibold shadow-lg"
                onClick={enterCookingMode}
              >
                <ChefHat className="w-4 h-4 mr-2" /> เริ่มทำเมนูนี้
              </Button>
            </div>
          </>
        )}

        {/* คำเตือนความปลอดภัย — ต้องอ่านออกแต่ต้องไม่แย่งความสนใจจากงานหลัก
            เลยทำเป็นบรรทัดเงียบๆ ท้ายหน้า ไม่ใช่กล่องสีเหลืองที่ตะโกนอยู่ตลอดเวลา */}
        <div className="flex gap-2.5 border-t border-line/70 pt-4">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yolk" />
          <p className="text-[11px] leading-relaxed text-ash">
            สูตรทั้งหมดเขียนโดย AI — ตรวจความสดของวัตถุดิบก่อนปรุง
            และปรุงให้สุกทั่วถึงทุกครั้ง ตัวกรองแพ้อาหารช่วยได้มาก แต่ไม่ใช่การรับประกัน
          </p>
        </div>
      </div>
    </main>
  );
}
