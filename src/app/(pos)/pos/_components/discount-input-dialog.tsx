"use client";

import { useState } from "react";
import { BottomSheet } from "./bottom-sheet";
import { formatComma, parseComma } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 적용 대상 금액(세전) — % 입력 시 환산 미리보기에 사용. 0 이면 미리보기 안 보여줌. */
  baseAmount?: number;
  /** 초기 할인 — "1000" 또는 "10%" */
  initialDiscount: string;
  title?: string;
  /** 저장 시 호출 — 빈 값이면 "0", 비율이면 "N%", 정액이면 raw digits */
  onSubmit: (discount: string) => void;
}

type Mode = "flat" | "percent";

/**
 * 할인 입력 다이얼로그 — 상단 정액/% 세그먼트 토글로 모드 전환.
 * 기존 한 input 에 % 직접 타이핑 패턴은 모바일 numeric 키패드에서 % 입력이 막혀 사용 불가.
 *
 * 모드별 동작:
 * - 정액(flat)   : 천 단위 콤마 정수, inputMode=numeric, 저장 = 콤마 제거 raw digits
 * - 비율(percent): 0~100 정수/소수, inputMode=decimal, 저장 = "N%"
 */
export function DiscountInputDialog(props: Props) {
  if (!props.open) return null;
  return <Body {...props} />;
}

function deriveInitialMode(d: string): Mode {
  return d.trim().endsWith("%") ? "percent" : "flat";
}

function deriveInitialRaw(d: string): string {
  if (!d || d === "0") return "";
  return d.trim().endsWith("%") ? d.trim().slice(0, -1) : d;
}

function Body({
  onOpenChange,
  baseAmount,
  initialDiscount,
  title = "할인 입력",
  onSubmit,
}: Props) {
  const [mode, setMode] = useState<Mode>(() => deriveInitialMode(initialDiscount));
  const [raw, setRaw] = useState<string>(() => deriveInitialRaw(initialDiscount));

  const numeric = mode === "flat"
    ? parseInt(parseComma(raw), 10) || 0
    : Math.min(100, Math.max(0, parseFloat(raw) || 0));

  const previewAmount =
    mode === "percent" && baseAmount && baseAmount > 0 && numeric > 0
      ? Math.round((baseAmount * numeric) / 100)
      : 0;

  const handleSubmit = () => {
    if (numeric <= 0) {
      onSubmit("0");
    } else if (mode === "percent") {
      onSubmit(`${numeric}%`);
    } else {
      onSubmit(String(numeric));
    }
    onOpenChange(false);
  };

  return (
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <button
          type="button"
          onClick={handleSubmit}
          className="h-14 w-full rounded-2xl bg-[var(--jm-action)] text-[16px] font-semibold text-white transition-transform active:scale-[0.99]"
        >
          저장
        </button>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        {/* 모드 토글 — 정액 / % */}
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-[var(--jm-surface-muted)] p-1">
          {(["flat", "percent"] as Mode[]).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  // 모드 변경 시 입력값 초기화 (정액↔비율 의미가 다르므로 헷갈림 방지)
                  if (m !== mode) setRaw("");
                  setMode(m);
                }}
                className={`h-11 rounded-xl text-[14px] font-semibold transition-colors ${
                  active ? "bg-[var(--jm-surface)] text-[var(--jm-text)] shadow-sm" : "text-[var(--jm-text-muted)]"
                }`}
              >
                {m === "flat" ? "정액 (₩)" : "비율 (%)"}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              {mode === "flat" ? "할인 금액" : "할인 비율"}
            </span>
            <span className="text-[10px] text-[var(--jm-text-subtle)]">
              {mode === "flat" ? "예: 5,000" : "0~100 (예: 10)"}
            </span>
          </div>
          <div className="relative">
            <input
              type="text"
              inputMode={mode === "flat" ? "numeric" : "decimal"}
              value={mode === "flat" ? formatComma(raw) : raw}
              onChange={(e) => {
                if (mode === "flat") {
                  setRaw(parseComma(e.target.value));
                } else {
                  // 비율: 숫자/소수점만 허용, 100 초과 입력은 그대로 받지만 numeric 계산 시 캡
                  const v = e.target.value.replace(/[^\d.]/g, "");
                  setRaw(v);
                }
              }}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="0"
              className="h-14 w-full rounded-2xl border-2 border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 pr-12 text-right text-[20px] font-semibold tabular-nums outline-none focus:border-[var(--jm-action)]"
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[18px] font-semibold text-[var(--jm-text-subtle)]">
              {mode === "flat" ? "₩" : "%"}
            </span>
          </div>
          {mode === "percent" && parseFloat(raw) > 100 && (
            <p className="px-1 text-[11px] text-[var(--jm-warning-fg)]">
              100% 로 캡됩니다
            </p>
          )}
        </div>

        {/* 환산 미리보기 — % 입력일 때 */}
        {mode === "percent" && baseAmount && baseAmount > 0 && previewAmount > 0 && (
          <div className="flex items-center justify-between rounded-2xl bg-[var(--jm-success-bg)] px-4 py-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                적용 대상
              </span>
              <span className="text-[14px] font-semibold tabular-nums text-[var(--jm-text)]">
                ₩{baseAmount.toLocaleString("ko-KR")}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                환산 할인액
              </span>
              <span className="text-[16px] font-bold tabular-nums text-[var(--jm-success-fg)]">
                −₩{previewAmount.toLocaleString("ko-KR")}
              </span>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
