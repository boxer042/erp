import {
  JmBadge,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import { fmtNumber, formatDateKo, MOVEMENT_TYPE_LABELS } from "./helpers";
import type { InventoryMovementItem } from "./types";

interface ProductMovementsTableProps {
  movements: InventoryMovementItem[] | undefined;
  isLoading?: boolean;
  /** 대표(canonical) 상품일 때 자식 변형 movement 합산이라 "변형" 컬럼 노출 */
  showVariantColumn?: boolean;
}

export function ProductMovementsTable({
  movements,
  isLoading,
  showVariantColumn,
}: ProductMovementsTableProps) {
  const colCount = 6 + (showVariantColumn ? 1 : 0);
  return (
    <JmTable className="min-w-[820px]">
      <JmTableHeader>
        <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            일시
          </JmTableHead>
          {showVariantColumn && (
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
              변형
            </JmTableHead>
          )}
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            유형
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
            수량
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
            잔량
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            사유
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            메모
          </JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <JmTableRow key={i} className="hover:bg-transparent">
              <JmTableCell className="px-3 py-2">
                <JmSkeleton className="h-3 w-28" />
              </JmTableCell>
              {showVariantColumn && (
                <JmTableCell className="px-3 py-2">
                  <JmSkeleton className="h-3 w-20" />
                </JmTableCell>
              )}
              <JmTableCell className="px-3 py-2">
                <JmSkeleton className="h-5 w-16 rounded-md" />
              </JmTableCell>
              <JmTableCell className="px-3 py-2">
                <div className="flex justify-end">
                  <JmSkeleton className="h-3 w-12" />
                </div>
              </JmTableCell>
              <JmTableCell className="px-3 py-2">
                <div className="flex justify-end">
                  <JmSkeleton className="h-3 w-12" />
                </div>
              </JmTableCell>
              <JmTableCell className="px-3 py-2">
                <JmSkeleton className="h-3 w-16" />
              </JmTableCell>
              <JmTableCell className="px-3 py-2">
                <JmSkeleton className="h-3 w-24" />
              </JmTableCell>
            </JmTableRow>
          ))
        ) : !movements || movements.length === 0 ? (
          <JmTableRow className="hover:bg-transparent">
            <JmTableCell
              colSpan={colCount}
              className="text-center py-8 text-[var(--jm-text-muted)] text-jm-sm"
            >
              이동 이력이 없습니다
            </JmTableCell>
          </JmTableRow>
        ) : (
          movements.map((m) => (
            <JmTableRow key={m.id}>
              <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)] text-jm-xs whitespace-nowrap">
                {formatDateKo(m.createdAt)}
              </JmTableCell>
              {showVariantColumn && (
                <JmTableCell className="px-3 py-2 text-jm-xs">
                  {m.inventory?.product ? (
                    <span className="text-[var(--jm-text)]">{m.inventory.product.sku}</span>
                  ) : (
                    <span className="text-[var(--jm-text-muted)]">-</span>
                  )}
                </JmTableCell>
              )}
              <JmTableCell className="px-3 py-2">
                <JmBadge variant="outline" size="sm" shape="square" className="text-jm-2xs">
                  {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
                </JmBadge>
              </JmTableCell>
              <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                {fmtNumber(m.quantity)}
              </JmTableCell>
              <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                {fmtNumber(m.balanceAfter)}
              </JmTableCell>
              <JmTableCell className="px-3 py-2 text-jm-xs text-[var(--jm-text-muted)]">
                {m.reason ?? "-"}
              </JmTableCell>
              <JmTableCell className="px-3 py-2 text-jm-xs text-[var(--jm-text-muted)]">
                {m.memo ?? "-"}
              </JmTableCell>
            </JmTableRow>
          ))
        )}
      </JmTableBody>
    </JmTable>
  );
}
