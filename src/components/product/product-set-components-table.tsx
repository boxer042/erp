import {
  JmBadge,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import { fmtNumber } from "./helpers";
import type { SetComponentItem } from "./types";

interface ProductSetComponentsTableProps {
  components: SetComponentItem[];
}

export function ProductSetComponentsTable({ components }: ProductSetComponentsTableProps) {
  if (components.length === 0) {
    return (
      <p className="text-center py-8 text-[var(--jm-text-muted)] text-jm-sm">
        구성품이 없습니다
      </p>
    );
  }
  return (
    <JmTable className="min-w-[640px]">
      <JmTableHeader>
        <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            라벨
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            구성품
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            SKU
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
            수량
          </JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {components.map((sc) => (
          <JmTableRow key={sc.id}>
            <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)]">
              {sc.label?.trim() ? sc.label : "-"}
            </JmTableCell>
            <JmTableCell className="px-3 py-2 font-medium text-[var(--jm-text)]">
              {sc.component.name}
            </JmTableCell>
            <JmTableCell className="px-3 py-2">
              <JmBadge variant="outline" size="sm" shape="square">
                {sc.component.sku}
              </JmBadge>
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
              {fmtNumber(sc.quantity)}
            </JmTableCell>
          </JmTableRow>
        ))}
      </JmTableBody>
    </JmTable>
  );
}
