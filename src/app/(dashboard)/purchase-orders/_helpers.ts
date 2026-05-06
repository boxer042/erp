import type { PurchaseOrderListRow } from "./_types";

export function calcReceiveProgress(row: PurchaseOrderListRow): {
  ordered: number;
  received: number;
  pending: number;
  percentReceived: number;
  percentPending: number;
} {
  const ordered = row.items.reduce((s, it) => s + parseFloat(it.quantity || "0"), 0);
  const received = row.items.reduce((s, it) => s + parseFloat(it.receivedQty || "0"), 0);
  const pending = row.items.reduce((s, it) => s + (it.pendingQty ?? 0), 0);
  const percentReceived = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;
  const percentPending = ordered > 0 ? Math.min(100 - percentReceived, Math.round((pending / ordered) * 100)) : 0;
  return { ordered, received, pending, percentReceived, percentPending };
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function isoToKr(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}
