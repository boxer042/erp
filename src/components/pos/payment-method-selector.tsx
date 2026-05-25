"use client";

/**
 * POS·ERP 공용 결제수단 선택 그리드.
 *
 * - 5종: 카드 / 현금 / 현금영수증 / 계좌이체 / 외상
 * - 2-col grid (가변 행) · 카드 스타일 · jm 토큰
 * - 한쪽 디자인을 바꾸면 양쪽에 자동 적용됨 (POS 결제시트 + ERP 신규주문)
 *
 * 현금영수증: 손님 휴대폰/사업자번호로 국세청 영수증 발급된 현금 결제.
 * "현금" 과 구분 — 회계·매출 통계에서 별도 집계 가능.
 */
export type PaymentMethod =
  | "CASH"
  | "CASH_RECEIPT"
  | "CARD"
  | "TRANSFER"
  | "UNPAID";

const METHODS: { value: PaymentMethod; label: string; sub?: string }[] = [
  { value: "CARD", label: "카드", sub: "POS 결제" },
  { value: "CASH", label: "현금" },
  { value: "CASH_RECEIPT", label: "현금영수증", sub: "국세청 발급" },
  { value: "TRANSFER", label: "계좌이체" },
  { value: "UNPAID", label: "외상", sub: "고객 미수금" },
];

interface Props {
  value: PaymentMethod;
  onChange: (v: PaymentMethod) => void;
}

export function PaymentMethodSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {METHODS.map((m) => {
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            className={`flex flex-col gap-0.5 rounded-2xl border-2 p-4 text-left transition-colors ${
              active
                ? "border-[var(--jm-action)] bg-[var(--jm-bg)]"
                : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
            }`}
          >
            <span className="text-[16px] font-semibold text-[var(--jm-text)]">
              {m.label}
            </span>
            {m.sub && (
              <span className="text-[11px] text-[var(--jm-text-muted)]">
                {m.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
