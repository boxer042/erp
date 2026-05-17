import Link from "next/link";
import {
  JmBadge,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import { fmtNumber, formatDateOnly, LOT_SOURCE_LABELS } from "./helpers";
import type { InventoryLotItem } from "./types";

interface ProductInventoryLotsTableProps {
  lots: InventoryLotItem[];
  limit?: number;
  /** 대표(canonical) 상품일 때 자식 변형 lot 합산이라 "변형" 컬럼 노출 */
  showVariantColumn?: boolean;
}

const SHIPPING_SOURCE_LABEL: Record<
  NonNullable<InventoryLotItem["shippingSource"]>,
  string
> = {
  ITEM: "직접",
  ALLOCATED: "분배",
  DEDUCTED: "차감",
  ZERO: "0원",
};

export function ProductInventoryLotsTable({
  lots,
  limit = 5,
  showVariantColumn,
}: ProductInventoryLotsTableProps) {
  const slice = lots.slice(0, limit);
  if (slice.length === 0) {
    return (
      <p className="text-center py-6 text-[var(--jm-text-muted)] text-jm-sm">
        잔여 재고 로트가 없습니다
      </p>
    );
  }
  return (
    <JmTable className="min-w-[820px]">
      <JmTableHeader>
        <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            상태
          </JmTableHead>
          {showVariantColumn && (
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
              변형
            </JmTableHead>
          )}
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            입고일
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            전표
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            출처
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            공급자
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
            입고수량
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
            잔량
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
            단가
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
            배송비(개당)
          </JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {slice.map((lot) => (
          <JmTableRow
            key={lot.id}
            className={
              lot.isCurrentlyConsuming
                ? "bg-[var(--jm-info-bg)]/30 hover:bg-[var(--jm-info-bg)]/50"
                : undefined
            }
          >
            <JmTableCell className="px-3 py-2">
              {lot.isCurrentlyConsuming ? (
                <JmBadge variant="info" size="sm" shape="square" className="text-jm-2xs">
                  사용 중
                </JmBadge>
              ) : (
                <JmBadge
                  variant="outline"
                  size="sm"
                  shape="square"
                  className="text-jm-2xs text-[var(--jm-text-muted)]"
                >
                  대기
                </JmBadge>
              )}
            </JmTableCell>
            {showVariantColumn && (
              <JmTableCell className="px-3 py-2 text-jm-xs">
                {lot.variant ? (
                  <span className="text-[var(--jm-text)]">{lot.variant.sku}</span>
                ) : (
                  <span className="text-[var(--jm-text-muted)]">-</span>
                )}
              </JmTableCell>
            )}
            <JmTableCell className="px-3 py-2 text-jm-xs text-[var(--jm-text-muted)] whitespace-nowrap">
              {formatDateOnly(lot.receivedAt)}
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-jm-xs">
              {lot.incomingNo && lot.incomingId ? (
                <Link
                  href={`/inventory/incoming?incomingId=${lot.incomingId}`}
                  className="text-[var(--jm-text)] hover:text-[var(--jm-info-fg)] underline-offset-4 hover:underline"
                >
                  {lot.incomingNo}
                </Link>
              ) : (
                <span className="text-[var(--jm-text-muted)]">-</span>
              )}
            </JmTableCell>
            <JmTableCell className="px-3 py-2">
              <JmBadge variant="outline" size="sm" shape="square" className="text-jm-2xs">
                {LOT_SOURCE_LABELS[lot.source] ?? lot.source}
              </JmBadge>
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-jm-xs text-[var(--jm-text-muted)]">
              {lot.supplierProduct?.supplier.name ?? "-"}
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
              {fmtNumber(lot.receivedQty)}
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-right tabular-nums font-medium text-[var(--jm-text)]">
              {fmtNumber(lot.remainingQty)}
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
              ₩{fmtNumber(lot.unitCost)}
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-right tabular-nums">
              {lot.shippingPerUnit && lot.shippingPerUnit > 0 ? (
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-[var(--jm-text)]">
                    ₩{Math.round(lot.shippingPerUnit).toLocaleString("ko-KR")}
                  </span>
                  {lot.shippingSource && (
                    <span
                      className={`text-jm-2xs px-1 py-0.5 rounded ${
                        lot.shippingSource === "ITEM"
                          ? "bg-[var(--jm-info-bg)] text-[var(--jm-info-fg)]"
                          : lot.shippingSource === "DEDUCTED"
                            ? "bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]"
                            : "bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]"
                      }`}
                    >
                      {SHIPPING_SOURCE_LABEL[lot.shippingSource]}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-jm-xs text-[var(--jm-text-muted)]">—</span>
              )}
            </JmTableCell>
          </JmTableRow>
        ))}
      </JmTableBody>
    </JmTable>
  );
}
