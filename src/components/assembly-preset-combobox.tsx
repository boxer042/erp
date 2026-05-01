"use client";

import { ResponsiveCombobox } from "@/components/ui/responsive-combobox";

export interface AssemblyPresetOption {
  id: string;
  name: string;
  description?: string | null;
}

interface AssemblyPresetComboboxProps {
  presets: AssemblyPresetOption[];
  value: string;
  onChange: (id: string, name: string) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
}

export function AssemblyPresetCombobox({
  presets,
  value,
  onChange,
  placeholder = "프리셋 선택 (선택)",
  clearable = true,
  disabled = false,
}: AssemblyPresetComboboxProps) {
  const selected = presets.find((p) => p.id === value);

  return (
    <ResponsiveCombobox<AssemblyPresetOption>
      items={presets}
      value={value}
      getItemId={(p) => p.id}
      matches={(p, q) => {
        const lower = q.toLowerCase();
        return (
          p.name.toLowerCase().includes(lower) ||
          (p.description?.toLowerCase().includes(lower) ?? false)
        );
      }}
      onSelect={(p) => onChange(p.id, p.name)}
      selectedLabel={selected?.name}
      placeholder={placeholder}
      searchPlaceholder="프리셋 검색..."
      mobileTitle="프리셋 선택"
      clearable={clearable}
      onClear={() => onChange("", "")}
      disabled={disabled}
      renderItem={(p) => (
        <>
          <span className="flex-1 truncate">{p.name}</span>
          {p.description && (
            <span className="ml-2 text-xs text-muted-foreground truncate max-w-[40%]">
              {p.description}
            </span>
          )}
        </>
      )}
    />
  );
}
