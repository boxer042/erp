"use client";

import { ResponsiveCombobox } from "@/components/ui/responsive-combobox";

export interface SlotLabelOption {
  id: string;
  name: string;
}

interface Props {
  labels: SlotLabelOption[];
  value: string;
  onChange: (id: string, name: string) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
  clearable?: boolean;
}

export function AssemblySlotLabelCombobox({
  labels,
  value,
  onChange,
  onCreateNew,
  placeholder = "라벨 선택...",
  clearable = true,
}: Props) {
  const selected = labels.find((l) => l.id === value);

  return (
    <ResponsiveCombobox<SlotLabelOption>
      items={labels}
      value={value}
      getItemId={(l) => l.id}
      matches={(l, q) => l.name.toLowerCase().includes(q.toLowerCase())}
      onSelect={(l) => onChange(l.id, l.name)}
      onCreateNew={onCreateNew}
      selectedLabel={selected?.name}
      placeholder={placeholder}
      searchPlaceholder="라벨 검색..."
      mobileTitle="라벨 선택"
      clearable={clearable}
      onClear={() => onChange("", "")}
      renderItem={(l) => <span>{l.name}</span>}
    />
  );
}
