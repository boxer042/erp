"use client";

import React from "react";
import { format } from "date-fns";
import {
  JmBadge,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import { cn } from "@/lib/utils";
import { formatAmount } from "./_helpers";
import {
  TYPE_JM_VARIANTS,
  TYPE_LABELS,
  type ItemViewRow,
  type LedgerEntry,
  type SupplierSummary,
} from "./_types";

// ─── Ledger View ───────────────────────────────────────────────────────────
// LedgerView 는 src/components/supplier-ledger-table.tsx 의 SupplierLedgerTable 로 이동됨
// (거래처 상세 ledger 탭과 공용). 이 파일에는 ItemsView 만 남음.

// ─── Items View ────────────────────────────────────────────────────────────

export interface ItemsViewProps {
  itemDateGroups: Array<[string, ItemViewRow[]]>;
  selectedSupplierId: string | null;
  selectedSupplierSummary: SupplierSummary | null | undefined;
  from: Date | undefined;
  onEntryDoubleClick: (e: LedgerEntry) => void;
  onIncomingDeepLink: (incomingId: string) => void;
  emptyState: React.ReactNode;
}

export function ItemsView({
  itemDateGroups,
  selectedSupplierId,
  selectedSupplierSummary,
  from,
  onEntryDoubleClick,
  onIncomingDeepLink,
  emptyState,
}: ItemsViewProps) {
  if (itemDateGroups.length === 0) return <>{emptyState}</>;

  return (
    <JmTable className="min-w-[900px] table-fixed border-b border-[var(--jm-border)]">
      <colgroup>
        {!selectedSupplierId && <col style={{ width: "12%" }} />}
        <col style={{ width: "110px" }} />
        <col />
        <col style={{ width: "8%" }} />
        <col style={{ width: "50px" }} />
        <col style={{ width: "70px" }} />
        <col style={{ width: "90px" }} />
        <col style={{ width: "80px" }} />
        <col style={{ width: "120px" }} />
        <col style={{ width: "110px" }} />
        <col style={{ width: "120px" }} />
      </colgroup>
      <JmTableHeader className="sticky top-0 z-10">
        <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
          {!selectedSupplierId && (
            <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 px-2 font-medium">거래처</JmTableHead>
          )}
          <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 px-2 font-medium">입고번호</JmTableHead>
          <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 px-2 font-medium">품명</JmTableHead>
          <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 px-2 font-medium">규격</JmTableHead>
          <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 text-center font-medium">단위</JmTableHead>
          <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 text-center font-medium">수량</JmTableHead>
          <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 text-center font-medium">단가</JmTableHead>
          <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 text-center font-medium">할인</JmTableHead>
          <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 text-center font-medium">합계 (VAT포함)</JmTableHead>
          <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 text-center font-medium">입금</JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 text-center font-medium">잔액</JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {from && selectedSupplierSummary && (
          <JmTableRow className="bg-[var(--jm-surface-muted)]/60 hover:bg-[var(--jm-surface-muted)]/60">
            <JmTableCell
              colSpan={selectedSupplierId ? 9 : 10}
              className="px-3 py-1.5 text-xs text-[var(--jm-text-muted)] font-medium"
            >
              이월 잔액 ({format(from, "yyyy-MM-dd")} 기준)
            </JmTableCell>
            <JmTableCell className={cn(
              "px-2 py-1.5 text-right font-medium tabular-nums",
              selectedSupplierSummary.openingBalance > 0
                ? "text-[var(--jm-danger-fg)]"
                : "text-[var(--jm-text)]",
            )}>
              ₩{formatAmount(selectedSupplierSummary.openingBalance)}
            </JmTableCell>
          </JmTableRow>
        )}
        {itemDateGroups.map(([date, rows]) => (
          <React.Fragment key={`item-date-${date}`}>
            <JmTableRow className="bg-[var(--jm-surface)] hover:bg-[var(--jm-surface)]">
              <JmTableCell
                colSpan={selectedSupplierId ? 10 : 11}
                className="px-3 py-1.5 text-xs text-[var(--jm-text-muted)] font-medium"
              >
                {date}
              </JmTableCell>
            </JmTableRow>
            {rows.map((row) => {
              if (row.kind === "payment") {
                const p = row.data;
                const isPayment = p.type === "PAYMENT" && p.referenceType === "SUPPLIER_PAYMENT";
                const isManualAdj = p.type === "ADJUSTMENT" && p.referenceType === "MANUAL_ADJUSTMENT";
                const isClickable = isPayment || isManualAdj;
                const title = isPayment
                  ? "더블클릭: 결제 수정"
                  : isManualAdj
                    ? "더블클릭: 조정 수정"
                    : undefined;
                return (
                  <JmTableRow
                    key={`pay-${p.id}`}
                    className={cn(
                      "bg-[var(--jm-surface-muted)]/60 hover:bg-[var(--jm-surface-muted)]/60",
                      isClickable && "cursor-pointer",
                    )}
                    title={title}
                    onDoubleClick={() => onEntryDoubleClick(p)}
                  >
                    {!selectedSupplierId && (
                      <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 truncate">{p.supplier.name}</JmTableCell>
                    )}
                    <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-center">
                      <JmBadge variant={TYPE_JM_VARIANTS[p.type]} size="sm" shape="square">{TYPE_LABELS[p.type]}</JmBadge>
                    </JmTableCell>
                    <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-[var(--jm-text-muted)] truncate">{p.description}</JmTableCell>
                    <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-[var(--jm-text-muted)]">—</JmTableCell>
                    <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-center text-[var(--jm-text-muted)]">—</JmTableCell>
                    <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-right text-[var(--jm-text-muted)]">—</JmTableCell>
                    <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-right text-[var(--jm-text-muted)]">—</JmTableCell>
                    <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-right text-[var(--jm-text-muted)]">—</JmTableCell>
                    <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-right tabular-nums">
                      {parseFloat(p.debitAmount) > 0
                        ? <>₩{formatAmount(p.debitAmount)}</>
                        : <span className="text-[var(--jm-text-muted)]">—</span>}
                    </JmTableCell>
                    <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-right tabular-nums">
                      {parseFloat(p.creditAmount) > 0
                        ? <>₩{formatAmount(p.creditAmount)}</>
                        : <span className="text-[var(--jm-text-muted)]">—</span>}
                    </JmTableCell>
                    <JmTableCell className={cn(
                      "px-2 py-1.5 text-right font-medium tabular-nums",
                      parseFloat(p.balance) > 0 && "text-[var(--jm-danger-fg)]",
                    )}>
                      ₩{formatAmount(p.balance)}
                    </JmTableCell>
                  </JmTableRow>
                );
              }
              const it = row.data;
              const qty = parseFloat(it.quantity);
              const up = parseFloat(it.unitPrice);
              const origP = it.originalPrice ? parseFloat(it.originalPrice) : up;
              const disc = origP > up ? origP - up : 0;
              const supply = parseFloat(it.totalPrice);
              const totalWithTax = it.supplierProduct.isTaxable
                ? Math.round(supply * 1.1)
                : supply;
              return (
                <JmTableRow
                  key={it.id}
                  className="cursor-pointer"
                  title="더블클릭: 입고 상세"
                  onDoubleClick={() => onIncomingDeepLink(it.incomingId)}
                >
                  {!selectedSupplierId && (
                    <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 truncate">{it.supplier.name}</JmTableCell>
                  )}
                  <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-xs text-[var(--jm-text-muted)] truncate">{it.incomingNo}</JmTableCell>
                  <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 truncate">
                    <span className="font-medium">{it.supplierProduct.name}</span>
                    {it.supplierProduct.supplierCode && (
                      <span className="ml-1 text-xs text-[var(--jm-text-muted)]">({it.supplierProduct.supplierCode})</span>
                    )}
                  </JmTableCell>
                  <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-[var(--jm-text-muted)] truncate">{it.supplierProduct.spec ?? ""}</JmTableCell>
                  <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-center text-[var(--jm-text-muted)]">{it.supplierProduct.unitOfMeasure}</JmTableCell>
                  <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-right tabular-nums">{qty.toLocaleString("ko-KR")}</JmTableCell>
                  <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-right tabular-nums">{formatAmount(up)}</JmTableCell>
                  <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-right tabular-nums">
                    {disc > 0 ? <span className="text-[var(--jm-danger-fg)]">-{formatAmount(disc)}</span> : ""}
                  </JmTableCell>
                  <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-right tabular-nums">{formatAmount(totalWithTax)}</JmTableCell>
                  <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-right text-[var(--jm-text-muted)]">—</JmTableCell>
                  <JmTableCell className={cn(
                    "px-2 py-1.5 text-right font-medium tabular-nums",
                    row.balance !== null && row.balance > 0 && "text-[var(--jm-danger-fg)]",
                  )}>
                    {row.balance !== null ? `₩${formatAmount(row.balance)}` : ""}
                  </JmTableCell>
                </JmTableRow>
              );
            })}
          </React.Fragment>
        ))}
      </JmTableBody>
    </JmTable>
  );
}
