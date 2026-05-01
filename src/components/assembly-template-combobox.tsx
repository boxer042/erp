"use client";

import { ResponsiveCombobox } from "@/components/ui/responsive-combobox";

export interface AssemblyTemplateOption {
  id: string;
  name: string;
  description?: string | null;
}

interface AssemblyTemplateComboboxProps {
  templates: AssemblyTemplateOption[];
  value: string;
  onChange: (id: string, name: string) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
}

export function AssemblyTemplateCombobox({
  templates,
  value,
  onChange,
  placeholder = "템플릿 선택...",
  clearable = true,
  disabled = false,
}: AssemblyTemplateComboboxProps) {
  const selected = templates.find((t) => t.id === value);

  return (
    <ResponsiveCombobox<AssemblyTemplateOption>
      items={templates}
      value={value}
      getItemId={(t) => t.id}
      matches={(t, q) => {
        const lower = q.toLowerCase();
        return (
          t.name.toLowerCase().includes(lower) ||
          (t.description?.toLowerCase().includes(lower) ?? false)
        );
      }}
      onSelect={(t) => onChange(t.id, t.name)}
      selectedLabel={selected?.name}
      placeholder={placeholder}
      searchPlaceholder="템플릿 검색..."
      mobileTitle="템플릿 선택"
      clearable={clearable}
      onClear={() => onChange("", "")}
      disabled={disabled}
      renderItem={(t) => (
        <>
          <span className="flex-1 truncate">{t.name}</span>
          {t.description && (
            <span className="ml-2 text-xs text-muted-foreground truncate max-w-[40%]">
              {t.description}
            </span>
          )}
        </>
      )}
    />
  );
}
