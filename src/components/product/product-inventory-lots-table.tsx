import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtNumber, formatDateOnly, LOT_SOURCE_LABELS } from "./helpers";
import type { InventoryLotItem } from "./types";

interface ProductInventoryLotsTableProps {
  lots: InventoryLotItem[];
  limit?: number;
  /** 대표(canonical) 상품일 때 자식 변형 lot 합산이라 "변형" 컬럼 노출 */
  showVariantColumn?: boolean;
}

const SHIPPING_SOURCE_LABEL: Record<NonNullable<InventoryLotItem["shippingSource"]>, string> = {
  ITEM: "직접",
  ALLOCATED: "분배",
  DEDUCTED: "차감",
  ZERO: "0원",
};

export function ProductInventoryLotsTable({ lots, limit = 5, showVariantColumn }: ProductInventoryLotsTableProps) {
  const slice = lots.slice(0, limit);
  if (slice.length === 0) {
    return (
      <p className="text-center py-6 text-muted-foreground text-sm">
        잔여 재고 로트가 없습니다
      </p>
    );
  }
  return (
    <Table className="min-w-[820px]">
      <TableHeader>
        <TableRow>
          <TableHead className="h-9 px-3 text-xs">상태</TableHead>
          {showVariantColumn && (
            <TableHead className="h-9 px-3 text-xs">변형</TableHead>
          )}
          <TableHead className="h-9 px-3 text-xs">입고일</TableHead>
          <TableHead className="h-9 px-3 text-xs">전표</TableHead>
          <TableHead className="h-9 px-3 text-xs">출처</TableHead>
          <TableHead className="h-9 px-3 text-xs">공급자</TableHead>
          <TableHead className="h-9 px-3 text-xs text-right">입고수량</TableHead>
          <TableHead className="h-9 px-3 text-xs text-right">잔량</TableHead>
          <TableHead className="h-9 px-3 text-xs text-right">단가</TableHead>
          <TableHead className="h-9 px-3 text-xs text-right">배송비(개당)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {slice.map((lot) => (
          <TableRow
            key={lot.id}
            className={lot.isCurrentlyConsuming ? "bg-primary/5 hover:bg-primary/10" : undefined}
          >
            <TableCell className="px-3 py-2.5">
              {lot.isCurrentlyConsuming ? (
                <Badge variant="default" className="text-[10px]">사용 중</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">대기</Badge>
              )}
            </TableCell>
            {showVariantColumn && (
              <TableCell className="px-3 py-2.5 text-xs">
                {lot.variant ? (
                  <div className="flex flex-col">
                    <span className="text-foreground">{lot.variant.sku}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
            )}
            <TableCell className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
              {formatDateOnly(lot.receivedAt)}
            </TableCell>
            <TableCell className="px-3 py-2.5 text-xs">
              {lot.incomingNo && lot.incomingId ? (
                <Link
                  href={`/inventory/incoming?incomingId=${lot.incomingId}`}
                  className="text-foreground hover:text-primary underline-offset-4 hover:underline"
                >
                  {lot.incomingNo}
                </Link>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell className="px-3 py-2.5">
              <Badge variant="outline" className="text-[10px]">
                {LOT_SOURCE_LABELS[lot.source] ?? lot.source}
              </Badge>
            </TableCell>
            <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
              {lot.supplierProduct?.supplier.name ?? "-"}
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right tabular-nums">
              {fmtNumber(lot.receivedQty)}
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right tabular-nums font-medium">
              {fmtNumber(lot.remainingQty)}
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right tabular-nums">
              ₩{fmtNumber(lot.unitCost)}
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right tabular-nums">
              {lot.shippingPerUnit && lot.shippingPerUnit > 0 ? (
                <div className="flex items-center justify-end gap-1.5">
                  <span>₩{Math.round(lot.shippingPerUnit).toLocaleString("ko-KR")}</span>
                  {lot.shippingSource && (
                    <span
                      className={`text-[10px] px-1 py-0.5 rounded ${
                        lot.shippingSource === "ITEM"
                          ? "bg-primary/10 text-primary"
                          : lot.shippingSource === "DEDUCTED"
                            ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {SHIPPING_SOURCE_LABEL[lot.shippingSource]}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
