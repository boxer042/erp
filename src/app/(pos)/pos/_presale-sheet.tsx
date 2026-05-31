"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Package, Recycle } from "lucide-react";

import { BottomSheet } from "./_components/bottom-sheet";
import { PriceInputDialog } from "./_components/price-input-dialog";

/** 선판매 라인 페이로드 — POS·ERP 양쪽이 각자 카트 모델로 변환 */
export interface PresaleLine {
  name: string;
  /** 공급가액 (세전, 정수). 항상 과세 (TAXABLE) */
  unitPrice: number;
  /** 미리 구별된 종류 — 현재는 "used" 만 생성 가능 */
  presaleKind: "used" | "catalog";
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * 라인 추가 콜백 — POS 는 `useSessions().add`, ERP /orders/new 는 로컬 setItems 호출.
   * 호출자에게 카트 모델 변환을 위임해 컴포넌트 자체는 context-free.
   */
  onAdd: (line: PresaleLine) => void;
}

/**
 * 선판매 시트 — 아직 시스템에 등록 안 된 항목을 이름+가격 자유 입력으로 먼저 판매.
 * 모달에서 [내상품] / [중고상품] 종류를 먼저 고른 뒤(행을 미리 구별 → 사후 lot 처리 혼동 방지),
 * 이름·금액을 입력해 itemType="service" + presaleKind 라인으로 카트에 추가한다.
 *
 * - 중고상품: 활성. 나중에 사후 정리(선판매)로 UsedItem 연결 (마진 원가 보정).
 * - 내상품: 확장 대비 자리만 — 현재 비활성 (선판매→카탈로그 등록 흐름 미개발).
 *
 * 공용 (POS 카트 시트 + ERP 신규 주문) — onAdd 콜백으로 카트 추가 위임.
 */
export function PresaleSheet(props: Props) {
  if (!props.open) return null;
  return <Body {...props} />;
}

function Body({ onOpenChange, onAdd }: Props) {
  // 선택한 종류 — 현재 "used" 만 가능. null 이면 종류 선택 화면.
  const [kind, setKind] = useState<"used" | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);
  const [priceOpen, setPriceOpen] = useState(false);

  const canAdd = kind !== null && name.trim().length > 0 && amount > 0;

  const submit = () => {
    if (!canAdd || !kind) return;
    onAdd({ name: name.trim(), unitPrice: Math.max(0, Math.round(amount)), presaleKind: kind });
    toast.success(`${name.trim()} 추가`, { duration: 1500 });
    onOpenChange(false);
  };

  return (
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title="선판매 — 미등록 항목 추가"
      footer={
        kind ? (
          <button
            type="button"
            disabled={!canAdd}
            onClick={submit}
            className="h-14 w-full rounded-2xl bg-[var(--jm-action)] text-jm-lg font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
          >
            선판매 추가
          </button>
        ) : undefined
      }
    >
      {kind === null ? (
        // 1단계 — 종류 선택 (행을 미리 구별)
        <div className="flex flex-col gap-3 pt-2">
          <p className="text-jm-sm text-[var(--jm-text-muted)]">
            등록 전 항목을 먼저 판매합니다. 종류를 선택하면 나중에 사후 정리 시 처리 방식이 구별됩니다.
          </p>
          <button
            type="button"
            onClick={() => setKind("used")}
            className="flex items-center gap-3 rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 py-4 text-left active:bg-[var(--jm-surface-muted)]"
          >
            <Recycle className="size-6 shrink-0 text-[var(--jm-success-fg)]" />
            <span className="flex flex-col">
              <span className="text-jm-base font-semibold text-[var(--jm-text)]">중고상품</span>
              <span className="text-jm-xs text-[var(--jm-text-muted)]">
                미등록 중고를 자유 입력 → 사후 정리에서 중고품 등록·연결
              </span>
            </span>
          </button>
          <button
            type="button"
            disabled
            className="flex cursor-not-allowed items-center gap-3 rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-4 py-4 text-left opacity-50"
          >
            <Package className="size-6 shrink-0 text-[var(--jm-text-muted)]" />
            <span className="flex flex-col">
              <span className="flex items-center gap-2 text-jm-base font-semibold text-[var(--jm-text)]">
                내상품
                <span className="rounded-full bg-[var(--jm-surface)] px-2 py-0.5 text-jm-3xs font-medium text-[var(--jm-text-muted)] border border-[var(--jm-border)]">
                  준비 중
                </span>
              </span>
              <span className="text-jm-xs text-[var(--jm-text-muted)]">
                선판매 → 카탈로그 등록 흐름은 아직 미개발
              </span>
            </span>
          </button>
        </div>
      ) : (
        // 2단계 — 이름 + 금액 자유 입력
        <div className="flex flex-col gap-5 pt-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--jm-success-bg)] px-2.5 py-1 text-jm-xs font-semibold text-[var(--jm-success-fg)]">
              <Recycle className="size-3.5" /> 중고상품 선판매
            </span>
            <button
              type="button"
              onClick={() => setKind(null)}
              className="text-jm-xs text-[var(--jm-text-muted)] underline underline-offset-2 active:text-[var(--jm-text)]"
            >
              종류 변경
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-jm-xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
              품명
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 센다이 엔진 SD225R (중고)"
              className="h-12 w-full rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 text-jm-md outline-none focus:border-[var(--jm-border-strong)] focus:bg-[var(--jm-surface)]"
            />
            <button
              type="button"
              onClick={() => setPriceOpen(true)}
              className="flex h-12 items-center justify-between rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 active:bg-[var(--jm-surface-muted)]"
            >
              <span className="text-jm-sm text-[var(--jm-text-muted)]">금액 (공급가액)</span>
              <span className="text-jm-md font-semibold tabular-nums text-[var(--jm-text)]">
                ₩{amount.toLocaleString("ko-KR")}
              </span>
            </button>
            <p className="text-jm-2xs text-[var(--jm-text-muted)]">
              입력은 공급가액(세전) 기준 — 항상 과세(VAT 10%). 결제 후 [사후 정리]에서 중고품으로 등록하면 원가가 보정됩니다.
            </p>
          </div>

          <PriceInputDialog
            open={priceOpen}
            onOpenChange={setPriceOpen}
            title="선판매 금액"
            initialNet={amount}
            taxType="TAXABLE"
            onSubmit={(net) => setAmount(net)}
          />
        </div>
      )}
    </BottomSheet>
  );
}
