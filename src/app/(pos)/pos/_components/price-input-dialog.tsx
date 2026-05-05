"use client";

import { useState } from "react";
import { BottomSheet } from "./bottom-sheet";
import { formatComma, parseComma } from "@/lib/utils";

const TAX_RATE = 0.1;

export type TaxType = "TAXABLE" | "TAX_FREE";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 초기 공급가액 (세전) */
  initialNet: number;
  taxType: TaxType;
  /** 영세율 적용 여부 (taxType=TAXABLE 일 때만 의미) */
  isZeroRate?: boolean;
  title?: string;
  /** 저장 시 호출 — 항상 공급가액(세전) 으로 반환 */
  onSubmit: (net: number) => void;
}

/**
 * 가격 입력 다이얼로그 — 공급가액 ↔ 판매가 두 입력 자유.
 * 어디 입력해도 나머지는 자동 계산.
 * 세액(VAT) 은 항상 자동 (직접 입력 X).
 *
 * - TAXABLE + isZeroRate=false: 세액 = 공급가액 × 10%
 * - TAXABLE + isZeroRate=true : 세액 = 0
 * - TAX_FREE                    : 세액 = 0
 */
export function PriceInputDialog(props: Props) {
  if (!props.open) return null;
  return <Body {...props} />;
}

function Body({
  onOpenChange,
  initialNet,
  taxType,
  isZeroRate,
  title = "가격 입력",
  onSubmit,
}: Props) {
  const taxApplies = taxType === "TAXABLE" && !isZeroRate;

  // 표시값은 string 유지 (콤마 포맷). 마지막으로 어느 필드를 편집했는지 ref 로 추적.
  const initial = Math.max(0, Math.round(initialNet || 0));
  const [net, setNet] = useState<string>(String(initial));
  const [gross, setGross] = useState<string>(
    String(taxApplies ? Math.round(initial * (1 + TAX_RATE)) : initial),
  );

  const tax = taxApplies
    ? Math.max(0, Math.round((parseInt(net.replace(/,/g, ""), 10) || 0) * TAX_RATE))
    : 0;

  const setNetAndSync = (raw: string) => {
    const cleaned = parseComma(raw);
    setNet(cleaned);
    const n = parseInt(cleaned, 10) || 0;
    setGross(String(taxApplies ? Math.round(n * (1 + TAX_RATE)) : n));
  };

  const setGrossAndSync = (raw: string) => {
    const cleaned = parseComma(raw);
    setGross(cleaned);
    const g = parseInt(cleaned, 10) || 0;
    // 판매가 → 공급가액: gross / 1.1 (반올림)
    setNet(String(taxApplies ? Math.round(g / (1 + TAX_RATE)) : g));
  };

  const finalNet = parseInt(net.replace(/,/g, ""), 10) || 0;

  return (
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <button
          type="button"
          onClick={() => {
            onSubmit(finalNet);
            onOpenChange(false);
          }}
          className="h-14 w-full rounded-2xl bg-zinc-900 text-[16px] font-semibold text-white transition-transform active:scale-[0.99]"
        >
          저장
        </button>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        {/* 세 필드 — 세액은 자동 (read-only) */}
        <Field label="공급가액 (세전)" hint="원가·매입 기준">
          <input
            type="text"
            inputMode="numeric"
            value={formatComma(net)}
            onChange={(e) => setNetAndSync(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="h-14 w-full rounded-2xl border-2 border-zinc-200 bg-white px-4 text-right text-[20px] font-semibold tabular-nums outline-none focus:border-zinc-900"
          />
        </Field>

        <Field label="세액 (VAT)" hint="자동 계산" disabled={!taxApplies}>
          <div className="flex h-14 items-center justify-end rounded-2xl bg-zinc-100 px-4 text-[18px] font-semibold tabular-nums text-zinc-700">
            {taxApplies ? formatComma(String(tax)) : "0"}
          </div>
          {!taxApplies && (
            <p className="mt-1 text-[11px] text-zinc-500">
              {taxType === "TAX_FREE" ? "면세 상품" : "영세율 적용"} — 세액 0
            </p>
          )}
        </Field>

        <Field label="판매가 (VAT 포함)" hint="고객 청구 금액">
          <input
            type="text"
            inputMode="numeric"
            value={formatComma(gross)}
            onChange={(e) => setGrossAndSync(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="h-14 w-full rounded-2xl border-2 border-zinc-200 bg-white px-4 text-right text-[20px] font-semibold tabular-nums outline-none focus:border-zinc-900"
          />
        </Field>
      </div>
    </BottomSheet>
  );
}

function Field({
  label,
  hint,
  disabled,
  children,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${disabled ? "opacity-70" : ""}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        {hint && <span className="text-[10px] text-zinc-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
