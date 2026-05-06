import { format } from "date-fns";
import { utcDayDiff } from "@/lib/orders/board";
import type { OrderListItem } from "./_types";

/**
 * 주문 1행에 표시할 상품 요약 — "상품명1, 상품명2 외 N건"
 */
export function summarizeItems(order: OrderListItem): string {
  const names = order.items
    .map((i) => i.product?.name ?? i.serviceName ?? "")
    .filter(Boolean);
  if (names.length === 0) return `${order._count.items}개 항목`;
  const total = order._count.items;
  if (names.length >= total) return names.slice(0, 2).join(", ");
  const head = names.slice(0, 2).join(", ");
  return `${head} 외 ${total - 2}건`;
}

/**
 * expectedShipDate 가 today 기준 며칠 차이인지 — 음수면 지연.
 * 비교는 UTC 자정 기준 (서버에서 받은 today 와 동일 통화).
 */
export function daysUntilShip(
  expectedShipDate: string | null,
  today: Date,
): number | null {
  if (!expectedShipDate) return null;
  return utcDayDiff(new Date(expectedShipDate), today);
}

export function formatShipDate(date: string | null): string {
  if (!date) return "—";
  return format(new Date(date), "M월 d일");
}

export function formatCurrency(value: string | number): string {
  return `₩${Number(value).toLocaleString("ko-KR")}`;
}
