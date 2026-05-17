"use client";

import { useMemo } from "react";
import { JmCombobox, type JmComboboxItem } from "@/jm";

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
  size?: "sm" | "md" | "lg";
}

export function AssemblyTemplateCombobox({
  templates,
  value,
  onChange,
  placeholder = "템플릿 선택...",
  clearable = true,
  disabled = false,
  size = "sm",
}: AssemblyTemplateComboboxProps) {
  const items = useMemo<JmComboboxItem[]>(
    () =>
      templates.map((t) => ({
        id: t.id,
        label: t.name,
        description: t.description ?? undefined,
      })),
    [templates],
  );

  return (
    <JmCombobox
      items={items}
      value={value}
      size={size}
      onChange={(item) => onChange(item.id, item.label)}
      placeholder={placeholder}
      searchPlaceholder="템플릿 검색..."
      emptyMessage="템플릿이 없습니다"
      clearable={clearable}
      onClear={() => onChange("", "")}
      disabled={disabled}
      matches={(item, q) => {
        const lower = q.toLowerCase();
        return (
          item.label.toLowerCase().includes(lower) ||
          (item.description?.toLowerCase().includes(lower) ?? false)
        );
      }}
      renderItem={(item) => (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex-1 truncate text-[var(--jm-text)]">{item.label}</span>
          {item.description && (
            <span className="ml-2 text-jm-xs text-[var(--jm-text-muted)] truncate max-w-[40%]">
              {item.description}
            </span>
          )}
        </span>
      )}
    />
  );
}
