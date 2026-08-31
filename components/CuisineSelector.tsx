const CUISINE_TYPES = [
  { label: 'ทั่วไป', value: 'ทั่วไป' },
  { label: 'อาหารไทย', value: 'อาหารไทย' },
  { label: 'อาหารญี่ปุ่น', value: 'อาหารญี่ปุ่น' },
  { label: 'เพื่อสุขภาพ', value: 'เพื่อสุขภาพ' },
  { label: 'ทำเร็ว', value: 'ทำเร็ว (ไม่เกิน 15 นาที)' },
];

interface CuisineSelectorProps {
  selected: string;
  onSelect: (value: string) => void;
}

export function CuisineSelector({ selected, onSelect }: CuisineSelectorProps) {
  return (
    <div>
      <label className="eyebrow mb-2 block">ประเภทอาหาร</label>
      <div className="flex flex-wrap gap-2">
        {CUISINE_TYPES.map(c => (
          <button
            key={c.value}
            onClick={() => onSelect(c.value)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
              selected === c.value
                ? 'border-basil bg-basil text-white'
                : 'border-line bg-steam text-ash hover:border-basil/50 hover:text-deep'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
