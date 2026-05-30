"use client";

/**
 * 카트 액션 그리드 버튼 — POS 카트 시트 · 주문 등록 공용.
 * - active=true: success bg + ring (할인/배송비 적용 상태 등)
 * - pending=true: sub 자리에 "진행중…" 표시
 */
export function CartActionButton({
  label,
  sub,
  active,
  disabled,
  pending,
  onClick,
}: {
  label: string;
  sub?: string;
  active?: boolean;
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-center transition-colors ${
        active
          ? "bg-[var(--jm-success-bg)] ring-1 ring-[var(--jm-success-solid)]"
          : "bg-[var(--jm-surface)] border border-[var(--jm-border)] active:bg-[var(--jm-bg)]"
      } disabled:opacity-40`}
    >
      <span
        className={`text-jm-2xs font-semibold ${
          active ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-text)]"
        }`}
      >
        {label}
      </span>
      <span
        className={`max-w-full truncate px-1 text-jm-3xs tabular-nums ${
          active ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-text-muted)]"
        }`}
      >
        {pending ? "진행중…" : sub}
      </span>
    </button>
  );
}
