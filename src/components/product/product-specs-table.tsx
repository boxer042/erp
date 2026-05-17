import {
  JmBadge,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import type { ProductSpecValueItem } from "./types";

interface ProductSpecsTableProps {
  values: ProductSpecValueItem[];
}

export function ProductSpecsTable({ values }: ProductSpecsTableProps) {
  if (values.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-jm-sm text-[var(--jm-text-muted)]">
        등록된 스펙이 없습니다
      </div>
    );
  }

  return (
    <JmTable>
      <JmTableHeader>
        <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[200px]">
            슬롯
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            값
          </JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {values.map((v) => (
          <JmTableRow key={v.id}>
            <JmTableCell className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-jm-sm text-[var(--jm-text)]">
                  {v.slot.name}
                </span>
                {v.slot.type === "ENUM" && (
                  <JmBadge variant="outline" size="sm" shape="square" className="text-jm-2xs">
                    선택지
                  </JmBadge>
                )}
              </div>
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-jm-sm tabular-nums text-[var(--jm-text)]">
              {v.value}
              {v.slot.type === "NUMBER" && v.slot.unit && (
                <span className="ml-1 text-[var(--jm-text-muted)]">{v.slot.unit}</span>
              )}
            </JmTableCell>
          </JmTableRow>
        ))}
      </JmTableBody>
    </JmTable>
  );
}
