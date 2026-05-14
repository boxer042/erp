"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

type SalesItem = {
  id: string;
  quantity: string;
  listPrice: string | null;
  discountAmount: string | null;
  unitPrice: string;
  totalPrice: string;
  order: {
    id: string;
    orderNo: string;
    orderDate: string;
    status: string;
    paymentStatus: string;
    channel: { name: string; code: string } | null;
    customerName: string | null;
  };
};

type SalesStats = {
  items: SalesItem[];
  stats: {
    lineCount: number;
    totalQty: number;
    avgUnitPrice: number;
    avgListPrice: number;
    avgDiscountPercent: number;
    minUnitPrice: number;
    maxUnitPrice: number;
    discountedLineCount: number;
  };
};

const fmt = (v: string | number) =>
  Math.round(Number(v)).toLocaleString("ko-KR");

export function ProductSalesPriceHistoryCard({ productId }: { productId: string }) {
  const query = useQuery<SalesStats>({
    queryKey: queryKeys.products.salesStats(productId),
    queryFn: () => apiGet<SalesStats>(`/api/products/${productId}/sales-stats`),
  });

  if (query.isPending) {
    return (
      <div className="px-4 py-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const data = query.data;
  if (!data || data.items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        실판매 단가 이력이 없습니다 (신규 주문부터 누적)
      </p>
    );
  }

  const { items, stats } = data;

  return (
    <div className="space-y-3">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-2 px-4 pt-3 md:grid-cols-4">
        <Kpi
          label="평균 정가"
          value={stats.avgListPrice > 0 ? `₩${fmt(stats.avgListPrice)}` : "-"}
          sub={`${stats.lineCount}건 평균`}
        />
        <Kpi
          label="평균 실판매가"
          value={`₩${fmt(stats.avgUnitPrice)}`}
          sub={
            stats.avgDiscountPercent > 0
              ? `평균 ${stats.avgDiscountPercent.toFixed(1)}% 할인`
              : "정가 동일"
          }
          tone={stats.avgDiscountPercent > 0 ? "discount" : undefined}
        />
        <Kpi
          label="최저 / 최고"
          value={`₩${fmt(stats.minUnitPrice)} ~ ₩${fmt(stats.maxUnitPrice)}`}
          sub={`${stats.discountedLineCount}건 할인 적용`}
        />
        <Kpi
          label="총 판매수량"
          value={stats.totalQty.toLocaleString("ko-KR")}
          sub={`${stats.lineCount} 라인`}
        />
      </div>

      {/* 라인별 표 */}
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-muted text-muted-foreground text-xs border-y border-border">
            <th className="py-2 px-3 text-left font-medium">날짜</th>
            <th className="py-2 px-3 text-left font-medium">주문</th>
            <th className="py-2 px-3 text-left font-medium">고객</th>
            <th className="py-2 px-3 text-left font-medium">채널</th>
            <th className="py-2 px-3 text-right font-medium">수량</th>
            <th className="py-2 px-3 text-right font-medium">정가</th>
            <th className="py-2 px-3 text-right font-medium">실판매가</th>
            <th className="py-2 px-3 text-right font-medium">할인</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const list = it.listPrice ? Number(it.listPrice) : 0;
            const unit = Number(it.unitPrice);
            const qty = Number(it.quantity);
            const diff = list > 0 ? unit - list : 0;
            const pct = list > 0 ? (diff / list) * 100 : 0;
            return (
              <tr key={it.id} className="border-b border-border hover:bg-muted/50">
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                  {new Date(it.order.orderDate).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-3 py-2.5">
                  <Link
                    href={`/sales/history?id=${it.order.id}`}
                    className="text-primary hover:underline font-mono text-[12px]"
                  >
                    {it.order.orderNo}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {it.order.customerName ?? "-"}
                </td>
                <td className="px-3 py-2.5">
                  {it.order.channel ? (
                    <Badge variant="outline" className="font-normal">
                      {it.order.channel.name}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">POS</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {qty.toLocaleString("ko-KR")}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {list > 0 ? `₩${fmt(list)}` : "-"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                  ₩{fmt(unit)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${
                    diff < 0
                      ? "text-green-500"
                      : diff > 0
                        ? "text-red-500"
                        : "text-muted-foreground"
                  }`}
                >
                  {list > 0 && diff !== 0
                    ? `${diff < 0 ? "−" : "+"}₩${fmt(Math.abs(diff))} (${pct.toFixed(1)}%)`
                    : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "discount";
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`text-[14px] font-semibold tabular-nums ${
          tone === "discount" ? "text-green-600 dark:text-green-400" : ""
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
      )}
    </div>
  );
}
