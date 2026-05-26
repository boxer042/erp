"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { JmCombobox, JmComboboxDrawer, type JmComboboxItem } from "@/jm";
import { useIsCompactDevice } from "@/hooks/use-mobile";

interface Supplier {
  id: string;
  name: string;
  businessNumber?: string | null;
}

interface SupplierComboboxProps {
  suppliers: Supplier[];
  value: string;
  onChange: (id: string, name: string) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
  clearable?: boolean;
  /** 트리거 높이 — 기본 sm (h-9), 다른 jm input 과 통일 */
  size?: "sm" | "md" | "lg";
}

const HEIGHT_BY_SIZE: Record<NonNullable<SupplierComboboxProps["size"]>, string> = {
  sm: "h-9",
  md: "h-10",
  lg: "h-11",
};

/**
 * 거래처 선택 콤보박스.
 * - 데스크탑 (md+ 비터치): JmCombobox (popover)
 * - 모바일·태블릿·터치 기기: JmComboboxDrawer (바텀시트 — 가상 키보드 안 가림)
 */
export function SupplierCombobox({
  suppliers,
  value,
  onChange,
  onCreateNew,
  placeholder = "거래처 선택...",
  clearable = true,
  size = "sm",
}: SupplierComboboxProps) {
  const isCompactDevice = useIsCompactDevice();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = useMemo<JmComboboxItem[]>(
    () =>
      suppliers.map((s) => ({
        id: s.id,
        label: s.name,
        description: s.businessNumber ?? undefined,
      })),
    [suppliers],
  );

  if (isCompactDevice) {
    const selected = suppliers.find((s) => s.id === value);
    return (
      <>
        <div className={`relative ${HEIGHT_BY_SIZE[size]}`}>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={`flex w-full items-center gap-2 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] pl-3 pr-9 text-jm-sm hover:bg-[var(--jm-surface-muted)] ${HEIGHT_BY_SIZE[size]}`}
          >
            <span
              className={`truncate text-left ${
                selected ? "text-[var(--jm-text)]" : "text-[var(--jm-text-muted)]"
              }`}
            >
              {selected?.name ?? placeholder}
            </span>
            <span className="absolute inset-y-0 right-2 flex items-center gap-1">
              {clearable && selected && (
                <button
                  type="button"
                  aria-label="선택 해제"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange("", "");
                  }}
                  className="rounded p-0.5 text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]"
                >
                  <X className="size-3.5" />
                </button>
              )}
              <ChevronsUpDown className="size-3.5 text-[var(--jm-text-muted)]" />
            </span>
          </button>
        </div>
        <JmComboboxDrawer<Supplier>
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          items={suppliers}
          getKey={(s) => s.id}
          renderItem={(s) => (
            <div className="space-y-0.5">
              <div className="font-medium text-[var(--jm-text)]">{s.name}</div>
              {s.businessNumber && (
                <div className="text-jm-xs text-[var(--jm-text-muted)]">
                  {s.businessNumber}
                </div>
              )}
            </div>
          )}
          filterFn={(s, q) => {
            const lower = q.toLowerCase();
            return (
              s.name.toLowerCase().includes(lower) ||
              (s.businessNumber?.toLowerCase().includes(lower) ?? false)
            );
          }}
          onSelect={(s) => {
            onChange(s.id, s.name);
            setDrawerOpen(false);
          }}
          onCreate={(name) => {
            setDrawerOpen(false);
            onCreateNew(name);
          }}
          createLabel={(q) => (
            <span className="text-jm-sm">
              <span className="font-semibold">&ldquo;{q}&rdquo;</span>{" "}
              <span className="text-[var(--jm-text-muted)]">새 거래처 등록</span>
            </span>
          )}
          title="거래처 선택"
          placeholder="이름·사업자번호 검색"
          emptyText="거래처가 없습니다"
        />
      </>
    );
  }

  return (
    <JmCombobox
      items={items}
      value={value}
      size={size}
      onChange={(item) => onChange(item.id, item.label)}
      onCreateNew={onCreateNew}
      placeholder={placeholder}
      searchPlaceholder="거래처 검색..."
      emptyMessage="거래처가 없습니다"
      clearable={clearable}
      onClear={() => onChange("", "")}
      matches={(item, q) => {
        const lower = q.toLowerCase();
        return (
          item.label.toLowerCase().includes(lower) ||
          (item.description?.toLowerCase().includes(lower) ?? false)
        );
      }}
      renderItem={(item) => (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-[var(--jm-text)]">{item.label}</span>
          {item.description && (
            <span className="ml-auto shrink-0 text-jm-xs text-[var(--jm-text-muted)] tabular-nums">
              {item.description}
            </span>
          )}
        </span>
      )}
    />
  );
}
