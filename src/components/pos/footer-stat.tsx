// 결제 footer 내역 칸 — 라이트 배경. POS 결제시트 · 주문 등록 공용 (다크 카드 대체).
export function FooterStat({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "warn";
}) {
  return (
    <div className="flex flex-col rounded-xl bg-[var(--jm-surface-muted)] px-2.5 py-1.5">
      <span className="text-jm-3xs uppercase tracking-wider text-[var(--jm-text-muted)]">
        {label}
      </span>
      <span
        className={`mt-0.5 text-jm-sm font-semibold tabular-nums ${
          tone === "warn" ? "text-[var(--jm-danger-fg)]" : "text-[var(--jm-text)]"
        }`}
      >
        {suffix
          ? `${value.toLocaleString("ko-KR")}${suffix}`
          : `${value < 0 ? "−" : ""}₩${Math.abs(value).toLocaleString("ko-KR")}`}
      </span>
    </div>
  );
}
