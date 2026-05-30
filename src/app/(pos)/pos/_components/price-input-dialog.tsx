"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import { formatComma, parseComma } from "@/lib/utils";
import { focusCaretEnd } from "@/jm/lib/focus";

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
  /**
   * 정가(세전 공급가액) — 입력값과 비교하여 할인/인상 차이를 표시한다.
   * 미지정 시 비교 영역은 렌더링하지 않음. 0 이하도 무시.
   */
  originalPrice?: number;
  /** 초기 서비스 지급 상태 — 미지정 시 false */
  initialIsService?: boolean;
  /** 서비스 토글 노출 여부 — false 면 토글 자체 숨김 (수리/임대 라인 등) */
  allowService?: boolean;
  /** 저장 시 호출 — 공급가액(세전) + 서비스 지급 여부. isService 가 미사용 호출자는 net 만 받아도 됨 (구 시그니처 호환) */
  onSubmit: (net: number, isService?: boolean) => void;
  /** 다른 시트(JmDrawer 등) 위에 겹쳐 띄울 때 "elevated" (BottomSheet z-[60]/[70]) */
  z?: "base" | "elevated";
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
  originalPrice,
  initialIsService,
  allowService = true,
  onSubmit,
  z,
}: Props) {
  const taxApplies = taxType === "TAXABLE" && !isZeroRate;

  // 표시값은 string 유지 (콤마 포맷). 마지막으로 어느 필드를 편집했는지 ref 로 추적.
  const initial = Math.max(0, Math.round(initialNet || 0));
  const [net, setNet] = useState<string>(String(initial));
  const [gross, setGross] = useState<string>(
    String(taxApplies ? Math.round(initial * (1 + TAX_RATE)) : initial),
  );
  // 서비스로 지급 토글 — 켜지면 net/gross 모두 0 으로 고정, 비활성화.
  const [isService, setIsService] = useState<boolean>(!!initialIsService);

  const toggleService = (v: boolean) => {
    setIsService(v);
    if (v) {
      // 서비스 켜면 자동으로 0 원
      setNet("0");
      setGross("0");
    } else {
      // 서비스 끄면 원래 정가(있으면) 또는 빈 상태로 복원
      const restore = originalPrice && originalPrice > 0 ? originalPrice : initial;
      setNet(String(restore));
      setGross(String(taxApplies ? Math.round(restore * (1 + TAX_RATE)) : restore));
    }
  };

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

  // 정가 비교 — originalPrice(listPrice) 가 있을 때만. 없으면 비교 영역 안 보여줌.
  const hasOriginal = !!originalPrice && originalPrice > 0;
  const diff = hasOriginal ? finalNet - (originalPrice as number) : 0;
  const diffPercent = hasOriginal && originalPrice
    ? Math.round((diff / originalPrice) * 1000) / 10
    : 0;
  const canResetToOriginal = hasOriginal && finalNet !== originalPrice;

  const resetToOriginal = () => {
    if (!hasOriginal) return;
    const orig = originalPrice as number;
    setNet(String(orig));
    setGross(String(taxApplies ? Math.round(orig * (1 + TAX_RATE)) : orig));
  };

  return (
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title={title}
      z={z}
      footer={
        <button
          type="button"
          onClick={() => {
            // 서비스 켜진 상태는 항상 net=0 으로 강제 — 사용자가 직접 0 입력한 케이스도 동일하게 처리 안 함 (의도 명시)
            onSubmit(isService ? 0 : finalNet, isService);
            onOpenChange(false);
          }}
          className="h-14 w-full rounded-2xl bg-[var(--jm-action)] text-jm-lg font-semibold text-white transition-transform active:scale-[0.99]"
        >
          저장
        </button>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        {/* 서비스로 지급 토글 — 켜면 가격 입력 비활성, net/gross 모두 0. 정가는 보존 (영수증에서 strike). */}
        {allowService && (
          <button
            type="button"
            onClick={() => toggleService(!isService)}
            className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left transition-colors ${
              isService
                ? "bg-[var(--jm-success-bg)] ring-1 ring-[var(--jm-success-border)]"
                : "bg-[var(--jm-bg)] hover:bg-[var(--jm-surface-muted)]"
            }`}
          >
            <div className="flex flex-col">
              <span className="text-jm-base font-semibold text-[var(--jm-text)]">
                서비스로 지급
              </span>
              <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                {isService
                  ? "₩0 청구 · 영수증·명세표에 \"서비스\" 표기 + 정가 strike"
                  : "무상 제공으로 표시 (정가는 보존됨)"}
              </span>
            </div>
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                isService
                  ? "border-[var(--jm-success-fg)] bg-[var(--jm-success-fg)] text-white"
                  : "border-[var(--jm-border-strong)] bg-[var(--jm-surface)]"
              }`}
            >
              {isService && <Check className="size-3.5" strokeWidth={2} />}
            </span>
          </button>
        )}

        {/* 세 필드 — 세액은 자동 (read-only) */}
        <Field label="공급가액 (세전)" hint="원가·매입 기준" disabled={isService}>
          <input
            type="text"
            inputMode="numeric"
            value={formatComma(net)}
            onChange={(e) => setNetAndSync(e.target.value)}
            onFocus={focusCaretEnd}
            disabled={isService}
            className="h-14 w-full rounded-2xl border-2 border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 text-right text-jm-2xl font-semibold tabular-nums outline-none focus:border-[var(--jm-action)] disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </Field>

        <Field label="세액 (VAT)" hint="자동 계산" disabled={!taxApplies}>
          <div className="flex h-14 items-center justify-end rounded-2xl bg-[var(--jm-surface-muted)] px-4 text-jm-xl font-semibold tabular-nums text-[var(--jm-text)]">
            {taxApplies ? formatComma(String(tax)) : "0"}
          </div>
          {!taxApplies && (
            <p className="mt-1 text-jm-2xs text-[var(--jm-text-muted)]">
              {taxType === "TAX_FREE" ? "면세 상품" : "영세율 적용"} — 세액 0
            </p>
          )}
        </Field>

        <Field label="판매가 (VAT 포함)" hint="고객 청구 금액" disabled={isService}>
          <input
            type="text"
            inputMode="numeric"
            value={formatComma(gross)}
            onChange={(e) => setGrossAndSync(e.target.value)}
            onFocus={focusCaretEnd}
            disabled={isService}
            className="h-14 w-full rounded-2xl border-2 border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 text-right text-jm-2xl font-semibold tabular-nums outline-none focus:border-[var(--jm-action)] disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </Field>

        {/* 정가 비교 — 할인(정가보다 싸게)·동일일 때만 표시 + 정가복원 버튼.
            인상(정가보다 비싸게)은 POS 에서 손님과 함께 보는 화면이라 숨김 (더 받는 건 운영상 문제 아님). */}
        {hasOriginal && diff <= 0 && (
          <div className="flex flex-col gap-2">
            <div
              className={`flex items-center justify-between rounded-2xl px-4 py-3 ${
                diff < 0 ? "bg-[var(--jm-success-bg)]" : "bg-[var(--jm-bg)]"
              }`}
            >
              <div className="flex flex-col">
                <span className="text-jm-3xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                  정가 (세전)
                </span>
                <span className="text-jm-base font-semibold tabular-nums text-[var(--jm-text)]">
                  ₩{(originalPrice as number).toLocaleString("ko-KR")}
                </span>
              </div>
              {diff === 0 ? (
                <span className="text-jm-xs font-medium text-[var(--jm-text-muted)]">
                  정가와 동일
                </span>
              ) : (
                <div className="flex flex-col items-end">
                  <span className="text-jm-base font-bold tabular-nums text-[var(--jm-success-fg)]">
                    −₩{Math.abs(diff).toLocaleString("ko-KR")}
                  </span>
                  <span className="text-jm-2xs font-medium tabular-nums text-[var(--jm-success-fg)]">
                    {Math.abs(diffPercent).toFixed(1)}% 할인
                  </span>
                </div>
              )}
            </div>

            {canResetToOriginal && (
              <button
                type="button"
                onClick={resetToOriginal}
                className="h-10 rounded-xl bg-[var(--jm-surface-muted)] text-jm-xs font-semibold text-[var(--jm-text)] transition-colors active:bg-[var(--jm-border)]"
              >
                정가로 초기화
              </button>
            )}
          </div>
        )}
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
        <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
          {label}
        </span>
        {hint && <span className="text-jm-3xs text-[var(--jm-text-subtle)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
