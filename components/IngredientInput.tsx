import { Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface IngredientInputProps {
  value: string;
  onChange: (val: string) => void;
  onAdd: () => void;
  error?: string;
}

export function IngredientInput({ value, onChange, onAdd, error }: IngredientInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onAdd();
    }
  };

  return (
    <div>
      <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
        เพิ่มวัตถุดิบ
      </label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="เช่น หมู, ไข่, กะเพรา..."
          className={error ? 'border-chili focus-visible:ring-chili/40' : ''}
        />
        <Button onClick={onAdd} variant="default">
          <Plus className="w-4 h-4 mr-1" /> เพิ่ม
        </Button>
      </div>
      {error && (
        <p className="text-xs text-chili mt-1.5">{error}</p>
      )}
    </div>
  );
}
