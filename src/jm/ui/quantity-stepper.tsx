"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/jm/lib/cn";

export interface JmQuantityStepperProps {
  /** 현재 수량 (확정값) */
  value: number;
  /** 확정 수량 변경 시 호출 — clamp·반올림이 적용된 값이 전달됨 */
  onChange: (next: number) => void;
  /** 최소값 — 기본 1 */
  min?: number;
  /** 최대값 — 기본 무제한 */
  max?: number;
  /** ± 버튼 증감 단위 — 기본 1 */
  step?: number;
  /** 소수 입력 허용 (벌크 상품 등). 기본 false = 정수만 */
  decimal?: boolean;
  /** 읽기 전용/비활성 */
  disabled?: boolean;
  className?: string;
  /** 접근성 라벨 베이스 — "{label} 감소/증가" 로 사용. 기본 "수량" */
  label?: string;
}

const fmt = (v: number, decimal: boolean) =>
  decimal ? String(v) : String(Math.round(v));

const parse = (s: string, decimal: boolean) =>
  decimal ? parseFloat(s) : parseInt(s, 10);

// 입력 정규화 — 정수: 숫자만 / 소수: 숫자 + 소수점 1개까지만 ("1.2.3" → "1.23")
const sanitize = (s: string, decimal: boolean) => {
  if (!decimal) return s.replace(/\D/g, "");
  const cleaned = s.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  return dot === -1
    ? cleaned
    : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
};

/**
 * 수량 스테퍼 — 둥근 ± 버튼 + 직접 입력 가능한 중앙 인풋.
 * POS 카트 라인·수리 부속 등에서 공용. 정수/소수(벌크) 모두 지원.
 *
 * 동작 원칙:
 * - 중앙 인풋에 직접 타이핑 → blur 시 clamp·반올림 후 onChange 로 확정
 * - ± 버튼은 표시값(draft) 기준 step 단위로 증감 — 부모가 비동기로 value 를
 *   갱신해도(예: 수리 부속 react-query refetch) 연타 누적이 안전
 * - 외부에서 value 가 바뀌면 (편집 중이 아닐 때) 인풋 표시값 자동 동기화
 */
export const JmQuantityStepper = React.forwardRef<
  HTMLDivElement,
  JmQuantityStepperProps
>(
  (
    {
      value,
      onChange,
      min = 1,
      max = Infinity,
      step = 1,
      decimal = false,
      disabled = false,
      className,
      label = "수량",
    },
    ref,
  ) => {
    const clamp = (n: number) => Math.min(max, Math.max(min, n));
    const [draft, setDraft] = React.useState(() => fmt(value, decimal));
    const [focused, setFocused] = React.useState(false);
    const [prev, setPrev] = React.useState(value);

    // 외부에서 value 가 바뀌면 (편집 중이 아닐 때) draft 동기화 — effect 없이 렌더 중 비교
    if (value !== prev) {
      setPrev(value);
      if (!focused) setDraft(fmt(value, decimal));
    }

    // ± 버튼·blur 는 prop(value) 이 아니라 현재 표시값(draft) 기준으로 증감한다.
    // 부모가 비동기로 value 를 갱신하면(react-query refetch) prop 이 지연돼
    // 연타 시 stale 값으로 누적이 안 되는 문제가 생기므로 표시값을 기준으로 한다.
    const shown = parse(draft, decimal);
    const base = Number.isFinite(shown) ? shown : value;

    const commit = (raw: number) => {
      const n = clamp(decimal ? raw : Math.round(raw));
      setDraft(fmt(n, decimal));
      if (n !== value) onChange(n);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setDraft(sanitize(e.target.value, decimal));
    };

    const handleBlur = () => {
      setFocused(false);
      commit(Number.isFinite(shown) ? shown : min);
    };

    const btn =
      "flex size-9 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[var(--jm-text)] hover:bg-[var(--jm-border)] disabled:opacity-30";

    return (
      <div ref={ref} className={cn("flex items-center gap-1", className)}>
        <button
          type="button"
          disabled={disabled || base <= min}
          onClick={() => commit(base - step)}
          className={btn}
          aria-label={`${label} 감소`}
        >
          <Minus className="size-4" />
        </button>
        <input
          type="text"
          inputMode={decimal ? "decimal" : "numeric"}
          value={draft}
          onFocus={() => setFocused(true)}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          aria-label={label}
          className="h-9 w-12 rounded-md bg-transparent text-center text-jm-base font-semibold tabular-nums text-[var(--jm-text)] outline-none focus:bg-[var(--jm-bg)] disabled:cursor-not-allowed"
        />
        <button
          type="button"
          disabled={disabled || base >= max}
          onClick={() => commit(base + step)}
          className={btn}
          aria-label={`${label} 증가`}
        >
          <Plus className="size-4" />
        </button>
      </div>
    );
  },
);
JmQuantityStepper.displayName = "JmQuantityStepper";
