"use client";

import { useMemo } from "react";
import { JmCombobox, type JmComboboxItem } from "@/jm";

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
  size?: "sm" | "md" | "lg";
}

export function AssemblySlotLabelCombobox({
  labels,
  value,
  onChange,
  onCreateNew,
  placeholder = "라벨 선택...",
  clearable = true,
  size = "sm",
}: Props) {
  const items = useMemo<JmComboboxItem[]>(
    () => labels.map((l) => ({ id: l.id, label: l.name })),
    [labels],
  );

  return (
    <JmCombobox
      items={items}
      value={value}
      size={size}
      onChange={(item) => onChange(item.id, item.label)}
      onCreateNew={onCreateNew}
      placeholder={placeholder}
      searchPlaceholder="라벨 검색..."
      emptyMessage="라벨이 없습니다"
      clearable={clearable}
      onClear={() => onChange("", "")}
      matches={(item, q) => item.label.toLowerCase().includes(q.toLowerCase())}
    />
  );
}
