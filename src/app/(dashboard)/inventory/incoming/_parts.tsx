"use client";

import { useState } from "react";
import { format, parse } from "date-fns";
import { ko } from "date-fns/locale";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { CalendarIcon, Truck } from "lucide-react";
import {
  JmButton,
  JmCalendar,
  JmCheckbox,
  JmInput,
} from "@/jm";
import { focusCaretEnd } from "@/jm/lib/focus";
import { formatComma, parseComma } from "@/lib/utils";

export { InlineCellProductSearch } from "@/components/inline-cell-product-search";

// ─── 품목별 배송비 입력 popover ─────────────────────────────────────────────
// 입고 작성 폼에서 행 단위 배송비 override 입력에 사용.
// value=빈문자열 → 분배 적용, 값 입력 → 그 품목 한정 운임 (분배 무시)
export function ItemShippingPopover({
  value,
  isTaxable,
  onChange,
  onTaxableChange,
  disabled,
}: {
  value: string;
  isTaxable: boolean;
  onChange: (v: string) => void;
  onTaxableChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [draftTaxable, setDraftTaxable] = useState(isTaxable);
  const has = value.trim() !== "" && value.trim() !== "0";

  const handleOpen = (next: boolean) => {
    if (next) {
      setDraft(value);
      setDraftTaxable(isTaxable);
    }
    setOpen(next);
  };

  const apply = () => {
    onChange(draft.trim());
    onTaxableChange(draftTaxable);
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    onTaxableChange(true);
    setOpen(false);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpen}>
      <PopoverPrimitive.Trigger
        disabled={disabled}
        className={`p-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
          has
            ? "text-[var(--jm-action)] hover:bg-[var(--jm-surface-muted)]"
            : "text-[var(--jm-text-subtle)] hover:text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]"
        }`}
        title={
          has
            ? `이 품목 운임: ₩${formatComma(value)}`
            : "이 품목만 다른 운임 입력"
        }
      >
        <Truck className="size-3.5" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner align="end" sideOffset={6} className="isolate z-50">
          <PopoverPrimitive.Popup
            data-jm-scope
            className="w-72 p-3 rounded-xl bg-[var(--jm-surface)] ring-1 ring-[var(--jm-border)] shadow-[var(--jm-shadow-lg)] text-[var(--jm-text)] outline-none font-[family-name:var(--jm-font-sans)]"
          >
            <div className="space-y-3">
          <div className="text-jm-sm font-medium text-[var(--jm-text)]">
            이 품목만 다른 배송비
          </div>
          <div className="text-jm-xs text-[var(--jm-text-muted)]">
            입력하면 전표 운임 분배에서 빠지고 이 값(VAT포함 합계)이 적용됩니다.
          </div>
          <div className="space-y-1.5">
            <label className="text-jm-xs text-[var(--jm-text-muted)]">
              운임 (₩, VAT포함)
            </label>
            <JmInput
              type="text"
              inputMode="numeric"
              value={formatComma(draft)}
              onChange={(e) => setDraft(parseComma(e.target.value))}
              onFocus={focusCaretEnd}
              placeholder="비우면 분배 적용"
            />
          </div>
          <label className="flex items-center gap-2 text-jm-sm cursor-pointer select-none text-[var(--jm-text)]">
            <JmCheckbox
              checked={draftTaxable}
              onCheckedChange={(c) => setDraftTaxable(c === true)}
            />
            <span>과세</span>
          </label>
          <div className="flex justify-between gap-2 pt-1">
            <JmButton variant="ghost" size="sm" onClick={clear}>
              비우기
            </JmButton>
            <JmButton variant="cta" size="sm" onClick={apply}>
              적용
            </JmButton>
          </div>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ─── 날짜 입력 (캘린더 + 직접 입력 YYYYMMDD) ────────────────────────────────
export function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);

  const display = value
    ? format(parse(value, "yyyy-MM-dd", new Date()), "yyyy년 M월 d일", {
        locale: ko,
      })
    : "";

  const tryParse = (input: string) => {
    const digits = input.replace(/\D/g, "");
    if (digits.length === 8) {
      const y = digits.slice(0, 4);
      const m = digits.slice(4, 6);
      const d = digits.slice(6, 8);
      const date = new Date(`${y}-${m}-${d}`);
      if (!isNaN(date.getTime())) {
        onChange(`${y}-${m}-${d}`);
        setEditing(false);
        return;
      }
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2">
      {label ? (
        <span className="text-jm-xs text-[var(--jm-text-muted)] w-12 shrink-0">
          {label}
        </span>
      ) : null}
      <div className="flex-1 flex items-center gap-1">
        {editing ? (
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => tryParse(text)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing)
                tryParse(text);
            }}
            placeholder="20260329"
            className="h-9 flex-1 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm text-[var(--jm-text)] placeholder:text-[var(--jm-text-subtle)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setText("");
              setEditing(true);
            }}
            className="h-9 flex-1 text-left rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm text-[var(--jm-text)] hover:border-[var(--jm-border-strong)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]"
          >
            {display || (
              <span className="text-[var(--jm-text-subtle)]">날짜 입력...</span>
            )}
          </button>
        )}
        <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
          <PopoverPrimitive.Trigger className="h-9 w-9 flex items-center justify-center rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] hover:bg-[var(--jm-surface-muted)] shrink-0">
            <CalendarIcon className="size-3.5 text-[var(--jm-text-muted)]" />
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Positioner align="end" sideOffset={6} className="isolate z-50">
              <PopoverPrimitive.Popup
                data-jm-scope
                className="rounded-xl bg-[var(--jm-surface)] ring-1 ring-[var(--jm-border)] shadow-[var(--jm-shadow-lg)] outline-none font-[family-name:var(--jm-font-sans)]"
              >
                <JmCalendar
                  value={value ? parse(value, "yyyy-MM-dd", new Date()) : undefined}
                  onChange={(date) => {
                    if (date) {
                      onChange(format(date, "yyyy-MM-dd"));
                      setOpen(false);
                      setEditing(false);
                    }
                  }}
                />
              </PopoverPrimitive.Popup>
            </PopoverPrimitive.Positioner>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      </div>
    </div>
  );
}

