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
import { PRODUCT_TYPE_LABELS } from "./helpers";
import type { ParentProductItem } from "./types";

interface Props {
  parents: ParentProductItem[];
}

/**
 * 상위 상품 표시 — 이 상품을 구성품으로 쓰는 세트·조립 상품 목록 (역방향 SetComponent).
 * 상품명 클릭 시 해당 상위 상품 상세로 이동.
 */
export function ProductParentsTable({ parents }: Props) {
  if (parents.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-jm-sm text-[var(--jm-text-muted)]">
        이 상품을 구성품으로 쓰는 세트·조립 상품이 없습니다
      </div>
    );
  }

  return (
    <JmTable>
      <JmTableHeader>
        <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            상위 상품
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[130px]">
            SKU
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[90px]">
            유형
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[120px]">
            슬롯
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[90px] text-right">
            소요 수량
          </JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {parents.map((p) => (
          <JmTableRow key={p.linkId}>
            <JmTableCell className="px-3 py-2 text-jm-sm">
              <Link
                href={`/products/${p.id}`}
                className="font-medium text-[var(--jm-text)] hover:underline"
              >
                {p.name}
              </Link>
            </JmTableCell>
            <JmTableCell className="px-3 py-2 font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text-muted)]">
              {p.sku}
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-jm-sm">
              <JmBadge
                variant="outline"
                size="sm"
                shape="square"
                className="text-jm-2xs"
              >
                {PRODUCT_TYPE_LABELS[p.productType] ?? p.productType}
              </JmBadge>
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-jm-xs text-[var(--jm-text-muted)]">
              {p.label || "—"}
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-jm-sm tabular-nums text-right text-[var(--jm-text)]">
              {Number(p.quantity).toLocaleString("ko-KR")}
            </JmTableCell>
          </JmTableRow>
        ))}
      </JmTableBody>
    </JmTable>
  );
}
