"use client";

import { useState } from "react";
import { fmtKRW } from "./_helpers";

type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "UNPAID";
const PAYMENTS: { value: PaymentMethod; label: string; sub?: string }[] = [
  { value: "CARD", label: "카드", sub: "POS 결제" },
  { value: "CASH", label: "현금" },
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

export function PickupSheet(props: Props) {
  // open=false 일 땐 컴포넌트 자체가 언마운트 → useState 초기화 자동
  if (!props.open) return null;
  return <PickupSheetBody {...props} />;
}

function PickupSheetBody({
  onOpenChange,
  finalAmount,
  warrantyMonths,
  onConfirm,
  loading,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>("CARD");

  return (
    <>
      <button
        type="button"
        onClick={() => !loading && onOpenChange(false)}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        aria-label="닫기"
      />
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 justify-center pt-3">
          <div className="h-1 w-10 rounded-full bg-zinc-300" />
        </div>
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-[18px] font-bold text-zinc-900">픽업 / 결제</h2>
          <button
            type="button"
            onClick={() => !loading && onOpenChange(false)}
            disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 disabled:opacity-50"
            aria-label="닫기"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 5l10 10M15 5l-10 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {/* 금액 강조 */}
          <div className="rounded-2xl bg-zinc-900 p-5 text-white">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-white/60">
              청구 금액
            </div>
            <div className="mt-1 text-[40px] font-bold tabular-nums leading-none">
              {fmtKRW(finalAmount)}
            </div>
          </div>

          {/* 결제수단 — 큰 버튼 */}
          <div className="mt-5 flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
              결제수단
            </span>
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
                        ? "border-zinc-900 bg-zinc-50"
                        : "border-zinc-200 bg-white hover:border-zinc-300"
                    }`}
                  >
                    <span
                      className={`text-[16px] font-semibold ${
                        active ? "text-zinc-900" : "text-zinc-700"
                      }`}
                    >
                      {p.label}
                    </span>
                    {p.sub && (
                      <span className="text-[11px] text-zinc-500">{p.sub}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {warrantyMonths != null && warrantyMonths > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[12px] text-emerald-900">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 7l3 3 5-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              수리 보증 {warrantyMonths}개월 자동 적용
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-100 bg-white px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">
          <button
            type="button"
            onClick={() => onConfirm(method)}
            disabled={loading}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 text-[16px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
          >
            {loading && (
              <svg
                className="size-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  opacity="0.25"
                />
                <path
                  d="M12 2a10 10 0 0 1 10 10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            )}
            {fmtKRW(finalAmount)} 결제 완료
          </button>
        </div>
      </div>
    </>
  );
}
