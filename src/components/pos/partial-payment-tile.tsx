"use client";

import { useState } from "react";
import { JmDialog, JmDialogBody, JmDialogContent, JmDialogFooter, JmDialogHeader, JmDialogTitle, JmButton } from "@/jm";
import { formatComma, parseComma } from "@/lib/utils";
import { focusCaretEnd } from "@/jm/lib/focus";

export type PartialPaymentKind = "DEPOSIT" | "PARTIAL";

export interface PartialPayment {
  /** 즉시 결제 금액 (VAT 포함, 정수). totalAmount 와 같거나 null 이면 전액 결제. */
  paidAmount: number | null;
  /** 부분 결제 구분 — paidAmount<totalAmount 일 때만 의미. */
  kind: PartialPaymentKind | null;
}

interface TileProps {
  /** 주문 총액 (VAT 포함, 정수) */
  totalAmount: number;
  /** 현재 설정값 */
  value: PartialPayment;
  /** 결제수단이 UNPAID(전액 외상) 또는 미선택이면 부분결제 의미 없음 → tile 자체 비활성 */
  disabled?: boolean;
  onChange: (next: PartialPayment) => void;
}

/**
 * POS·ERP 공용 "결제 금액" 타일 + 부분결제 다이얼로그.
 *
 * 동작:
 *  - 기본: 전액 결제 (paidAmount=null 또는 =totalAmount)
 *  - 클릭 → 결제 금액 다이얼로그:
 *    - 금액 입력 < total → "부분 결제" 활성. DEPOSIT(계약금) / PARTIAL(부분결제) 토글 노출
 *    - 금액 = total → 전액 결제 (kind 무관)
 *    - 금액 = 0 → 전액 외상 안내 (UNPAID 결제수단 사용 권장)
 *  - 잔금 = totalAmount - paidAmount → customerLedger SALE 로 등록 (backend)
 *
 * 영수증·증명서 출력 시 kind=DEPOSIT 이면 "계약금 영수증" 으로 라벨 분기 가능.
 */
export function PartialPaymentTile({
  totalAmount,
  value,
  disabled,
  onChange,
}: TileProps) {
  const [open, setOpen] = useState(false);

  const effectivePaid = value.paidAmount ?? totalAmount;
  const isPartial = !disabled && effectivePaid > 0 && effectivePaid < totalAmount;
  const outstanding = Math.max(0, totalAmount - effectivePaid);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={`flex w-full flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          isPartial
            ? "border-[var(--jm-warning-fg)] bg-[var(--jm-warning-bg)]"
            : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
        }`}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            결제 금액
          </span>
          {isPartial && (
            <span className="rounded-full bg-[var(--jm-warning-fg)] px-2 py-0.5 text-jm-3xs font-semibold text-white">
              {value.kind === "DEPOSIT" ? "계약금" : "부분결제"}
            </span>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`text-jm-lg font-bold tabular-nums ${
              isPartial
                ? "text-[var(--jm-warning-fg)]"
                : "text-[var(--jm-text)]"
            }`}
          >
            ₩{effectivePaid.toLocaleString("ko-KR")}
          </span>
          {isPartial && (
            <span className="text-jm-2xs tabular-nums text-[var(--jm-warning-fg)]">
              잔금 ₩{outstanding.toLocaleString("ko-KR")} 미수
            </span>
          )}
        </div>
      </button>

      {open && (
        <PartialPaymentDialog
          totalAmount={totalAmount}
          initial={value}
          onSubmit={(next) => {
            onChange(next);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PartialPaymentDialog({
  totalAmount,
  initial,
  onSubmit,
  onClose,
}: {
  totalAmount: number;
  initial: PartialPayment;
  onSubmit: (next: PartialPayment) => void;
  onClose: () => void;
}) {
  const [amountStr, setAmountStr] = useState(
    String(initial.paidAmount ?? totalAmount),
  );
  const [kind, setKind] = useState<PartialPaymentKind>(initial.kind ?? "PARTIAL");

  const amount = Math.max(0, parseFloat(parseComma(amountStr) || "0") || 0);
  const clamped = Math.min(totalAmount, amount);
  const outstanding = Math.max(0, totalAmount - clamped);
  const isPartial = clamped > 0 && clamped < totalAmount;
  const isZero = clamped === 0;

  return (
    <JmDialog open onOpenChange={(o) => !o && onClose()}>
      <JmDialogContent size="md">
        <JmDialogHeader>
          <JmDialogTitle>결제 금액</JmDialogTitle>
        </JmDialogHeader>
        <JmDialogBody>
          <div className="flex flex-col gap-4">
            {/* 총액 */}
            <div className="flex items-baseline justify-between rounded-xl bg-[var(--jm-surface-muted)] px-4 py-3">
              <span className="text-jm-xs text-[var(--jm-text-muted)]">총액</span>
              <span className="text-jm-xl font-bold tabular-nums text-[var(--jm-text)]">
                ₩{totalAmount.toLocaleString("ko-KR")}
              </span>
            </div>

            {/* 즉시 결제 금액 입력 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                즉시 결제
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={formatComma(amountStr)}
                onChange={(e) => setAmountStr(parseComma(e.target.value))}
                onFocus={focusCaretEnd}
                className="h-12 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 text-right text-jm-xl font-bold tabular-nums text-[var(--jm-text)] outline-none focus:border-[var(--jm-border-strong)]"
              />
              <div className="flex gap-1.5">
                <QuickAmount label="전액" value={totalAmount} onClick={(v) => setAmountStr(String(v))} />
                <QuickAmount label="50%" value={Math.round(totalAmount / 2)} onClick={(v) => setAmountStr(String(v))} />
                <QuickAmount label="30%" value={Math.round(totalAmount * 0.3)} onClick={(v) => setAmountStr(String(v))} />
                <QuickAmount label="0원" value={0} onClick={(v) => setAmountStr(String(v))} />
              </div>
            </div>

            {/* 잔금 안내 */}
            {isPartial && (
              <div className="flex items-baseline justify-between rounded-xl bg-[var(--jm-warning-bg)] px-4 py-3">
                <span className="text-jm-xs text-[var(--jm-warning-fg)]">
                  잔금 (고객 미수금)
                </span>
                <span className="text-jm-lg font-bold tabular-nums text-[var(--jm-warning-fg)]">
                  ₩{outstanding.toLocaleString("ko-KR")}
                </span>
              </div>
            )}

            {/* 0원 안내 — UNPAID 결제수단 권장 */}
            {isZero && (
              <div className="rounded-xl bg-[var(--jm-warning-bg)] px-4 py-3 text-jm-xs text-[var(--jm-warning-fg)]">
                전액 외상 — 결제수단을 <strong>외상</strong> 으로 선택하는 것을 권장합니다.
              </div>
            )}

            {/* DEPOSIT/PARTIAL 토글 — 부분결제일 때만 노출 */}
            {isPartial && (
              <div className="flex flex-col gap-1.5">
                <span className="text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
                  잔금 종류
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <KindButton
                    label="계약금"
                    sub="계약 시 일부 선결제"
                    active={kind === "DEPOSIT"}
                    onClick={() => setKind("DEPOSIT")}
                  />
                  <KindButton
                    label="부분결제"
                    sub="일부 즉시 + 잔금 미수"
                    active={kind === "PARTIAL"}
                    onClick={() => setKind("PARTIAL")}
                  />
                </div>
                <span className="px-1 text-jm-3xs text-[var(--jm-text-subtle)]">
                  계약금은 영수증·증명서 출력 시 &ldquo;계약금 영수증&rdquo; 으로 라벨됨
                </span>
              </div>
            )}
          </div>
        </JmDialogBody>
        <JmDialogFooter>
          <JmButton variant="outline" onClick={onClose}>
            취소
          </JmButton>
          <JmButton
            onClick={() =>
              onSubmit({
                paidAmount: clamped >= totalAmount ? null : clamped,
                kind: isPartial ? kind : null,
              })
            }
          >
            적용
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}

function QuickAmount({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick: (v: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className="flex-1 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-2 py-1.5 text-jm-xs font-medium text-[var(--jm-text)] active:bg-[var(--jm-bg)]"
    >
      {label}
    </button>
  );
}

function KindButton({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-0.5 rounded-xl border-2 p-3 text-left transition-colors ${
        active
          ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
          : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
      }`}
    >
      <span className="text-jm-base font-semibold text-[var(--jm-text)]">{label}</span>
      <span className="text-jm-2xs text-[var(--jm-text-muted)]">{sub}</span>
    </button>
  );
}
