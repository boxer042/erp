"use client";

import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

// 날짜 포맷 — "2025년 3월 15일".
export function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 보증 잔여 시각화 — 원형 progress ring.
export function WarrantyRing({
  daysLeft,
  totalDays,
  warrantyEnds,
}: {
  daysLeft: number | null;
  totalDays: number | null;
  warrantyEnds: string | null;
}) {
  const size = 168;
  const stroke = 13;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  const noWarranty = daysLeft == null;
  const expired = daysLeft != null && daysLeft <= 0;
  const pct =
    daysLeft != null && totalDays && totalDays > 0
      ? Math.max(0, Math.min(1, daysLeft / totalDays))
      : 0;

  const color = expired
    ? "var(--jm-danger-solid)"
    : daysLeft != null && daysLeft < 90
      ? "var(--jm-warning-solid)"
      : "var(--jm-success-solid)";

  const Icon = noWarranty || expired ? ShieldX : daysLeft! < 90 ? ShieldAlert : ShieldCheck;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--jm-border)"
            strokeWidth={stroke}
          />
          {!noWarranty && !expired && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct)}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <Icon className="size-5" style={{ color }} />
          {noWarranty ? (
            <span className="text-jm-sm font-medium text-[var(--jm-text-muted)]">
              보증 정보 없음
            </span>
          ) : expired ? (
            <>
              <span className="text-jm-xl font-bold text-[var(--jm-text)]">
                보증 만료
              </span>
              <span className="text-jm-xs text-[var(--jm-text-muted)]">
                {formatDate(warrantyEnds)}
              </span>
            </>
          ) : (
            <>
              <span className="text-[28px] font-bold leading-none text-[var(--jm-text)]">
                {daysLeft}
              </span>
              <span className="text-jm-xs text-[var(--jm-text-muted)]">일 남음</span>
            </>
          )}
        </div>
      </div>
      {!noWarranty && !expired && (
        <span className="text-jm-xs text-[var(--jm-text-muted)]">
          {formatDate(warrantyEnds)} 까지
        </span>
      )}
    </div>
  );
}

// bento grid 카드 — 아이콘 + 라벨 + 값/액션.
export function BentoCard({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`flex flex-col gap-1.5 rounded-[var(--jm-radius-lg)] border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3.5 text-left ${
        onClick ? "transition-colors active:bg-[var(--jm-surface-muted)]" : ""
      }`}
    >
      <span className="flex items-center gap-1.5 text-jm-xs text-[var(--jm-text-muted)]">
        {icon}
        {label}
      </span>
      <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
        {value}
      </span>
    </Tag>
  );
}
