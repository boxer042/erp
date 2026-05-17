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
import type { ProductMappingItem } from "./types";

interface ProductMappingsTableProps {
  mappings: ProductMappingItem[];
}

export function ProductMappingsTable({ mappings }: ProductMappingsTableProps) {
  if (mappings.length === 0) {
    return (
      <p className="text-center py-8 text-[var(--jm-text-muted)] text-jm-sm">
        매핑된 공급자 상품이 없습니다
      </p>
    );
  }

  return (
    <JmTable className="min-w-[720px]">
      <JmTableHeader>
        <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            거래처
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            공급자 상품명
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            품번
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
            단가
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">
            변환비율
          </JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {mappings.map((m) => (
          <JmTableRow key={m.id}>
            <JmTableCell className="px-3 py-2 text-[var(--jm-text)]">
              <div className="flex items-center gap-1.5">
                {m.supplierProduct.supplier.name}
                {m.supplierProduct.isProvisional && (
                  <JmBadge
                    variant="outline"
                    size="sm"
                    shape="square"
                    className="text-jm-2xs px-1 py-0"
                  >
                    임시
                  </JmBadge>
                )}
              </div>
            </JmTableCell>
            <JmTableCell className="px-3 py-2 font-medium text-[var(--jm-text)]">
              {m.supplierProduct.name}
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)]">
              {m.supplierProduct.supplierCode || "-"}
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
              ₩{fmtNumber(m.supplierProduct.unitPrice)}
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
              {m.conversionRate}
            </JmTableCell>
          </JmTableRow>
        ))}
      </JmTableBody>
    </JmTable>
  );
}
