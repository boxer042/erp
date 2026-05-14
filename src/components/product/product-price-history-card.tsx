"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

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

const fmt = (v: string | number) =>
  Math.round(Number(v)).toLocaleString("ko-KR");

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
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const rows = query.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        가격 변경 이력이 없습니다
      </p>
    );
  }

  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="bg-muted text-muted-foreground text-xs border-y border-border">
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
          const Icon =
            change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
          return (
            <tr key={h.id} className="border-b border-border hover:bg-muted/50">
              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                {new Date(h.createdAt).toLocaleString("ko-KR", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="px-3 py-2.5">
                <Badge variant="outline" className="font-normal">
                  {FIELD_LABEL[h.field] ?? h.field}
                </Badge>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                ₩{fmt(h.oldPrice)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                ₩{fmt(h.newPrice)}
              </td>
              <td
                className={`px-3 py-2.5 text-right tabular-nums ${
                  change > 0
                    ? "text-red-500"
                    : change < 0
                      ? "text-green-500"
                      : "text-muted-foreground"
                }`}
              >
                <span className="inline-flex items-center gap-0.5">
                  <Icon className="h-3 w-3" />
                  {change > 0 ? "+" : ""}₩{fmt(Math.abs(change))}
                </span>
              </td>
              <td
                className={`px-3 py-2.5 text-right tabular-nums ${
                  change > 0
                    ? "text-red-500"
                    : change < 0
                      ? "text-green-500"
                      : "text-muted-foreground"
                }`}
              >
                {change > 0 ? "+" : ""}
                {pct.toFixed(1)}%
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {h.reason || "-"}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {h.changedBy?.name ?? "-"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
