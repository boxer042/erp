"use client";

import {
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import type { InitialHistoryItem } from "./_types";
import { formatPrice } from "./_helpers";

export { InlineCellProductSearch } from "@/components/inline-cell-product-search";

// ─── 합계 푸터 ──────────────────────────────────────────────────────────────

function SummaryCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 min-w-[140px] items-center justify-between gap-3 border-r border-[var(--jm-border)] px-3 py-2.5 last:border-r-0">
      <span className="text-jm-xs text-[var(--jm-text-muted)]">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

interface SummaryFooterProps {
  validCount: number;
  totalSupply: number;
  totalTax: number;
  totalDiscount: number;
  totalAmount: number;
}

export function SummaryFooter({
  validCount,
  totalSupply,
  totalTax,
  totalDiscount,
  totalAmount,
}: SummaryFooterProps) {
  return (
    <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)]">
      <div className="flex flex-wrap text-jm-sm">
        <SummaryCell label="품목수">{validCount}건</SummaryCell>
        <SummaryCell label="공급가액">
          ₩{formatPrice(Math.round(totalSupply))}
        </SummaryCell>
        <SummaryCell label="세액">
          {totalTax > 0 ? `₩${formatPrice(totalTax)}` : ""}
        </SummaryCell>
        <SummaryCell label="할인합계">
          <span className={totalDiscount > 0 ? "text-[var(--jm-danger-fg)]" : ""}>
            {totalDiscount > 0
              ? `-₩${formatPrice(Math.round(totalDiscount))}`
              : ""}
          </span>
        </SummaryCell>
        <SummaryCell label="합계금액">
          <span className="font-bold text-jm-base">
            ₩{formatPrice(totalAmount)}
          </span>
        </SummaryCell>
      </div>
    </div>
  );
}

// ─── 이력 탭 스켈레톤 ──────────────────────────────────────────────────────

export function InitialHistorySkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i}>
          <JmTableCell><JmSkeleton className="h-4 w-28" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-40" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-12" /></JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-16" />
            </div>
          </JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

// ─── 이력 테이블 ──────────────────────────────────────────────────────────

interface HistoryTableProps {
  items: InitialHistoryItem[];
  loading: boolean;
}

export function HistoryTable({ items, loading }: HistoryTableProps) {
  return (
    <JmTable>
      <JmTableHeader>
        <JmTableRow>
          <JmTableHead>거래처</JmTableHead>
          <JmTableHead>품명</JmTableHead>
          <JmTableHead>규격</JmTableHead>
          <JmTableHead>품번</JmTableHead>
          <JmTableHead>단위</JmTableHead>
          <JmTableHead className="text-right">단가</JmTableHead>
          <JmTableHead>등록일</JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {loading ? (
          <InitialHistorySkeletonRows />
        ) : items.length === 0 ? (
          <JmTableRow>
            <JmTableCell
              colSpan={7}
              className="text-center py-8 text-[var(--jm-text-muted)]"
            >
              초기 등록 이력이 없습니다
            </JmTableCell>
          </JmTableRow>
        ) : (
          items.map((item) => (
            <JmTableRow key={item.id}>
              <JmTableCell>{item.supplier.name}</JmTableCell>
              <JmTableCell className="font-medium">{item.name}</JmTableCell>
              <JmTableCell className="text-[var(--jm-text-muted)]">
                {item.spec || "—"}
              </JmTableCell>
              <JmTableCell className="text-[var(--jm-text-muted)]">
                {item.supplierCode || "—"}
              </JmTableCell>
              <JmTableCell>{item.unitOfMeasure}</JmTableCell>
              <JmTableCell className="text-right tabular-nums">
                ₩{parseFloat(item.unitPrice).toLocaleString("ko-KR")}
              </JmTableCell>
              <JmTableCell className="text-[var(--jm-text-muted)]">
                {new Date(item.createdAt).toLocaleDateString("ko-KR")}
              </JmTableCell>
            </JmTableRow>
          ))
        )}
      </JmTableBody>
    </JmTable>
  );
}
