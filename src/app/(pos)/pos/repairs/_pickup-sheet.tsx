"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  JmButton,
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
  JmSectionLabel,
} from "@/jm";
import { fmtKRWInc } from "./_helpers";

type PaymentMethod = "CASH" | "CASH_RECEIPT" | "CARD" | "TRANSFER" | "UNPAID";
const PAYMENTS: { value: PaymentMethod; label: string; sub?: string }[] = [
  { value: "CARD", label: "카드", sub: "POS 결제" },
  { value: "CASH", label: "현금" },
  { value: "CASH_RECEIPT", label: "현금영수증", sub: "국세청 발급" },
  { value: "TRANSFER", label: "계좌이체" },
  { value: "UNPAID", label: "외상", sub: "고객 미수금" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  finalAmount: number;
  warrantyMonths: number | null;
  onConfirm: (paymentMethod: PaymentMethod) => void;
  loading?: boolean;
}

export function PickupSheet({
  open,
  onOpenChange,
  finalAmount,
  warrantyMonths,
  onConfirm,
  loading,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>("CARD");

  return (
    <JmDrawer
      open={open}
      onOpenChange={(v) => !loading && onOpenChange(v)}
    >
      <JmDrawerContent side="bottom" size="lg" dragHandle>
        <JmDrawerHeader>
          <JmDrawerTitle>픽업 / 결제</JmDrawerTitle>
        </JmDrawerHeader>

        <JmDrawerBody>
          {/* 금액 강조 */}
          <div className="rounded-2xl bg-[var(--jm-action)] p-5 text-white">
            <div className="text-jm-2xs font-semibold uppercase tracking-wider text-white/60">
              청구 금액
            </div>
            <div className="mt-1 text-[40px] font-bold tabular-nums leading-none">
              {fmtKRWInc(finalAmount)}
            </div>
          </div>

          {/* 결제수단 — 큰 버튼 */}
          <div className="mt-5 flex flex-col gap-1.5">
            <JmSectionLabel>결제수단</JmSectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENTS.map((p) => {
                const active = method === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setMethod(p.value)}
                    className={`flex flex-col gap-0.5 rounded-2xl border-2 p-4 text-left transition-colors ${
                      active
                        ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
                        : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                    }`}
                  >
                    <span className="text-jm-base font-semibold text-[var(--jm-text)]">
                      {p.label}
                    </span>
                    {p.sub && (
                      <span className="text-jm-2xs text-[var(--jm-text-muted)]">{p.sub}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {warrantyMonths != null && warrantyMonths > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--jm-success-bg)] px-3 py-2.5 text-jm-2xs text-[var(--jm-success-fg)]">
              <Check className="size-3.5" />
              수리 보증 {warrantyMonths}개월 자동 적용
            </div>
          )}
        </JmDrawerBody>

        <JmDrawerFooter>
          <JmButton
            variant="cta"
            size="lg"
            onClick={() => onConfirm(method)}
            disabled={loading}
            className="w-full"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {fmtKRWInc(finalAmount)} 결제 완료
          </JmButton>
        </JmDrawerFooter>
      </JmDrawerContent>
    </JmDrawer>
  );
}
