"use client";

import { useQuery } from "@tanstack/react-query";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { JmBadge, JmSkeleton } from "@/jm";

type Row = {
  id: string;
  field: "LIST" | "SELLING" | string;
  oldPrice: string;
  newPrice: string;
  changeAmount: string;
  changePercent: string;
  reason: string | null;
  createdAt: string;
  changedBy: { name: string; email: string } | null;
};

const fmt = (v: string | number) => Math.round(Number(v)).toLocaleString("ko-KR");

const FIELD_LABEL: Record<string, string> = {
  LIST: "정가",
  SELLING: "판매가",
};

export function ProductPriceHistoryCard({ productId }: { productId: string }) {
  const query = useQuery<Row[]>({
    queryKey: queryKeys.products.priceHistory(productId),
    queryFn: () => apiGet<Row[]>(`/api/products/${productId}/price-history`),
  });

  if (query.isPending) {
    return (
      <div className="px-4 py-4 space-y-2">
        <JmSkeleton className="h-4 w-32" />
        <JmSkeleton className="h-4 w-full" />
        <JmSkeleton className="h-4 w-full" />
      </div>
    );
  }

  const rows = query.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-jm-sm text-[var(--jm-text-muted)] py-8 text-center">
        가격 변경 이력이 없습니다
      </p>
    );
  }

  return (
    <table className="w-full text-jm-sm">
      <thead>
        <tr className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-jm-xs border-y border-[var(--jm-border)]">
          <th className="py-2 px-3 text-left font-medium">날짜</th>
          <th className="py-2 px-3 text-left font-medium">필드</th>
          <th className="py-2 px-3 text-right font-medium">이전</th>
          <th className="py-2 px-3 text-right font-medium">변경</th>
          <th className="py-2 px-3 text-right font-medium">변동액</th>
          <th className="py-2 px-3 text-right font-medium">변동률</th>
          <th className="py-2 px-3 text-left font-medium">사유</th>
          <th className="py-2 px-3 text-left font-medium">변경자</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => {
          const change = Number(h.changeAmount);
          const pct = Number(h.changePercent);
          const Icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
          const changeColor =
            change > 0
              ? "text-[var(--jm-danger-fg)]"
              : change < 0
                ? "text-[var(--jm-success-fg)]"
                : "text-[var(--jm-text-muted)]";
          return (
            <tr
              key={h.id}
              className="border-b border-[var(--jm-border)] hover:bg-[var(--jm-surface-muted)]/50"
            >
              <td className="px-3 py-2 text-[var(--jm-text-muted)] whitespace-nowrap">
                {new Date(h.createdAt).toLocaleString("ko-KR", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="px-3 py-2">
                <JmBadge
                  variant="outline"
                  size="sm"
                  shape="square"
                  className="font-normal"
                >
                  {FIELD_LABEL[h.field] ?? h.field}
                </JmBadge>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--jm-text-muted)]">
                ₩{fmt(h.oldPrice)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-[var(--jm-text)]">
                ₩{fmt(h.newPrice)}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${changeColor}`}>
                <span className="inline-flex items-center gap-0.5">
                  <Icon className="size-3" />
                  {change > 0 ? "+" : ""}₩{fmt(Math.abs(change))}
                </span>
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${changeColor}`}>
                {change > 0 ? "+" : ""}
                {pct.toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-[var(--jm-text-muted)]">{h.reason || "-"}</td>
              <td className="px-3 py-2 text-[var(--jm-text-muted)]">
                {h.changedBy?.name ?? "-"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
