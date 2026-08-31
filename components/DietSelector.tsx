'use client';

import { Plus, ShieldAlert, X } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { DIET_PRESETS } from '@/lib/diet';

interface DietSelectorProps {
  selected: string[];
  onToggle: (id: string) => void;
  allergies: string[];
  allergyInput: string;
  onAllergyInputChange: (value: string) => void;
  onAddAllergy: () => void;
  onRemoveAllergy: (index: number) => void;
}

export function DietSelector({
  selected,
  onToggle,
  allergies,
  allergyInput,
  onAllergyInputChange,
  onAddAllergy,
  onRemoveAllergy,
}: DietSelectorProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium mb-2 block text-muted-foreground">
          ข้อจำกัดด้านอาหาร <span className="text-xs">(เลือกได้หลายข้อ)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {DIET_PRESETS.map(preset => {
            const isOn = selected.includes(preset.id);
            return (
              <button
                key={preset.id}
                onClick={() => onToggle(preset.id)}
                aria-pressed={isOn}
                className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                  isOn
                    ? 'bg-basil text-white border-basil'
                    : 'bg-background text-muted-foreground border-border hover:border-basil/50'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
          แพ้อาหารอะไรไหม
        </label>
        <div className="flex gap-2">
          <Input
            value={allergyInput}
            onChange={e => onAllergyInputChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAddAllergy();
              }
            }}
            placeholder="เช่น ถั่วลิสง, นมวัว, กุ้ง"
          />
          <Button onClick={onAddAllergy} variant="outline">
            <Plus className="w-4 h-4 mr-1" /> เพิ่ม
          </Button>
        </div>

        {allergies.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {allergies.map((allergy, i) => (
              <Badge
                key={allergy}
                className="gap-1.5 pl-3 pr-2 py-1 bg-chili/20 text-chili border-chili/25 hover:bg-chili/20"
              >
                <ShieldAlert className="w-3 h-3" />
                {allergy}
                <button
                  onClick={() => onRemoveAllergy(i)}
                  aria-label={`ลบ ${allergy}`}
                  className="rounded-full hover:text-chili transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
