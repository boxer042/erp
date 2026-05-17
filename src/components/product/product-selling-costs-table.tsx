import {
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import { costTypeLabel, fmtNumber } from "./helpers";
import type { SellingCostItem } from "./types";

interface ProductSellingCostsTableProps {
  costs: SellingCostItem[];
  emptyMessage?: string;
  compact?: boolean;
}

export function ProductSellingCostsTable({
  costs,
  emptyMessage = "등록된 판매비용이 없습니다",
  compact = false,
}: ProductSellingCostsTableProps) {
  if (costs.length === 0) {
    return (
      <p className="text-center py-6 text-[var(--jm-text-muted)] text-jm-sm">
        {emptyMessage}
      </p>
    );
  }
  const cellClass = compact ? "px-3 py-2" : "px-3 py-2.5";
  return (
    <JmTable className="min-w-[640px]">
      <JmTableHeader>
        <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            비용항목
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            유형
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
            값
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            적용
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            과세
          </JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {costs.map((c) => (
          <JmTableRow key={c.id}>
            <JmTableCell className={`${cellClass} font-medium text-[var(--jm-text)]`}>
              {c.name}
            </JmTableCell>
            <JmTableCell className={`${cellClass} text-[var(--jm-text-muted)]`}>
              {costTypeLabel(c.costType)}
            </JmTableCell>
            <JmTableCell
              className={`${cellClass} text-right tabular-nums text-[var(--jm-text)]`}
            >
              {c.costType === "FIXED" ? `₩${fmtNumber(c.value)}` : `${c.value}%`}
            </JmTableCell>
            <JmTableCell className={`${cellClass} text-[var(--jm-text-muted)]`}>
              {c.perUnit ? "개당" : "건당"}
            </JmTableCell>
            <JmTableCell className={`${cellClass} text-[var(--jm-text-muted)]`}>
              {c.isTaxable ? "과세" : "면세"}
            </JmTableCell>
          </JmTableRow>
        ))}
      </JmTableBody>
    </JmTable>
  );
}
