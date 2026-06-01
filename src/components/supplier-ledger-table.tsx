"use client";

import React, { useMemo } from "react";
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

export type SupplierLedgerType = "PURCHASE" | "PAYMENT" | "ADJUSTMENT" | "REFUND";

const TYPE_LABELS: Record<SupplierLedgerType, string> = {
  PURCHASE: "매입",
  PAYMENT: "결제",
  ADJUSTMENT: "조정",
  REFUND: "환급",
};

const TYPE_VARIANTS: Record<
  SupplierLedgerType,
  "default" | "info" | "success" | "warning" | "danger"
> = {
  PURCHASE: "info",
  PAYMENT: "success",
  ADJUSTMENT: "default",
  REFUND: "danger",
};

export interface SupplierLedgerEntry {
  id: string;
  date: string;
  createdAt: string;
  type: SupplierLedgerType;
  description: string;
  debitAmount: string;
  creditAmount: string;
  balance: string;
  referenceId: string | null;
  referenceType: string | null;
  /** 거래처 컬럼이 보일 때 필요 (전체 거래처 보기). 단일 거래처 컨텍스트면 생략 가능. */
  supplier?: { id: string; name: string };
}

export interface SupplierLedgerOpeningBalance {
  /** 기준일 (이월 잔액 row 표시용) */
  from: Date;
  /** 그 시점 잔액 */
  amount: number;
}

export interface SupplierLedgerTableProps {
  entries: SupplierLedgerEntry[];
  /** false 면 거래처 컬럼 숨김 (단일 거래처 상세 페이지용). 기본 true. */
  showSupplierColumn?: boolean;
  /** 이월 잔액 row 표시 (기간 필터링 + summary 가 있을 때) */
  opening?: SupplierLedgerOpeningBalance;
  /** 행 더블클릭 시 호출. 미제공 시 클릭 비활성. */
  onEntryDoubleClick?: (e: SupplierLedgerEntry) => void;
  /** 빈 상태 fallback */
  emptyState: React.ReactNode;
  /** 컨테이너 className override */
  className?: string;
  /** 최소 너비 (default 900px) */
  minWidth?: string;
}

function formatAmount(n: string | number) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return Math.round(v).toLocaleString("ko-KR");
}

function buildDateGroups(
  entries: SupplierLedgerEntry[],
): Array<[string, SupplierLedgerEntry[]]> {
  const map = new Map<string, SupplierLedgerEntry[]>();
  entries.forEach((e) => {
    const key = format(new Date(e.date), "yyyy-MM-dd");
    const arr = map.get(key) || [];
    arr.push(e);
    map.set(key, arr);
  });
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
}

/**
 * 거래처 원장 표 (공용).
 * - 거래처 ledger 페이지(전체 보기)와 거래처 상세 ledger 탭(단일) 양쪽에서 재사용.
 * - 색상 룰: 잔액 음수(과지급, 비정상) 만 빨강 표시. 양수(미지급)·0 은 기본색.
 *   부호 의미 — balance = 매입(차변) - 결제(대변).
 *   양수 = 미지급(정상), 음수 = 과지급(비정상, 시정 필요).
 */
export function SupplierLedgerTable({
  entries,
  showSupplierColumn = true,
  opening,
  onEntryDoubleClick,
  emptyState,
  className,
  minWidth = "900px",
}: SupplierLedgerTableProps) {
  const dateGroups = useMemo(() => buildDateGroups(entries), [entries]);

  if (dateGroups.length === 0 && !opening) return <>{emptyState}</>;

  // 컬럼 수: 거래처 컬럼 빼고 6개. 이월잔액 row 의 colSpan 계산용.
  const baseCols = 6; // 유형/설명/참조/차변/대변/잔액
  const totalCols = showSupplierColumn ? baseCols + 1 : baseCols;
  const openingLabelColSpan = totalCols - 1; // 마지막 컬럼(잔액) 만 분리

  return (
    <JmTable
      className={cn(`table-fixed border-b border-[var(--jm-border)]`, className)}
      style={{ minWidth }}
    >
      <colgroup>
        {showSupplierColumn && <col style={{ width: "14%" }} />}
        <col style={{ width: "70px" }} />
        <col />
        <col style={{ width: "130px" }} />
        <col style={{ width: "120px" }} />
        <col style={{ width: "120px" }} />
        <col style={{ width: "120px" }} />
      </colgroup>
      <JmTableHeader className="sticky top-0 z-10">
        <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
          {showSupplierColumn && (
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 font-medium">
              거래처
            </JmTableHead>
          )}
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-center font-medium">
            유형
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 font-medium">
            설명
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-center font-medium">
            참조
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-right font-medium">
            차변 (매입)
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-right font-medium">
            대변 (결제)
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-right font-medium">
            잔액
          </JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {opening && (
          <JmTableRow className="bg-[var(--jm-surface-muted)]/60 hover:bg-[var(--jm-surface-muted)]/60">
            <JmTableCell
              colSpan={openingLabelColSpan}
              className="px-3 py-1.5 text-xs text-[var(--jm-text-muted)] font-medium"
            >
              이월 잔액 ({format(opening.from, "yyyy-MM-dd")} 기준)
            </JmTableCell>
            <JmTableCell
              className={cn(
                "px-3 py-2.5 text-right font-medium tabular-nums",
                // 과지급(음수) 만 빨강. 정상 미지급(양수)·0 은 기본
                opening.amount < 0
                  ? "text-[var(--jm-danger-fg)]"
                  : "text-[var(--jm-text)]",
              )}
            >
              ₩{formatAmount(opening.amount)}
            </JmTableCell>
          </JmTableRow>
        )}
        {dateGroups.map(([date, rows]) => (
          <React.Fragment key={`date-${date}`}>
            <JmTableRow className="bg-[var(--jm-surface)] hover:bg-[var(--jm-surface)]">
              <JmTableCell
                colSpan={totalCols}
                className="px-3 py-1.5 text-xs text-[var(--jm-text-muted)] font-medium"
              >
                {date}
              </JmTableCell>
            </JmTableRow>
            {rows.map((e) => {
              const isPayment =
                e.type === "PAYMENT" && e.referenceType === "SUPPLIER_PAYMENT";
              const isManualAdj =
                e.type === "ADJUSTMENT" && e.referenceType === "MANUAL_ADJUSTMENT";
              const isIncoming =
                (e.type === "PURCHASE" || e.type === "REFUND") && !!e.referenceId;
              const isClickable =
                !!onEntryDoubleClick && (isPayment || isManualAdj || isIncoming);
              const title = !onEntryDoubleClick
                ? undefined
                : isPayment
                  ? "더블클릭: 결제 수정"
                  : isManualAdj
                    ? "더블클릭: 조정 수정"
                    : isIncoming
                      ? "더블클릭: 입고 상세"
                      : undefined;
              return (
                <JmTableRow
                  key={e.id}
                  className={cn(
                    !isClickable && "hover:bg-transparent",
                    isClickable && "cursor-pointer",
                  )}
                  title={title}
                  onDoubleClick={
                    onEntryDoubleClick ? () => onEntryDoubleClick(e) : undefined
                  }
                >
                  {showSupplierColumn && (
                    <JmTableCell className="px-3 py-2.5 truncate">
                      {e.supplier?.name ?? "-"}
                    </JmTableCell>
                  )}
                  <JmTableCell className="px-3 py-2.5 text-center">
                    <JmBadge variant={TYPE_VARIANTS[e.type]} size="sm" shape="square">
                      {TYPE_LABELS[e.type]}
                    </JmBadge>
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2.5 truncate">
                    <span className="inline-flex items-center gap-1.5">
                      {e.description}
                      {/* 직송 매입 — 거래처가 손님에게 직접 발송한 건(재고 미반영) 명시 */}
                      {e.type === "PURCHASE" && e.description?.includes("직송") && (
                        <JmBadge variant="outline" size="sm" shape="square">
                          거래처 직송
                        </JmBadge>
                      )}
                    </span>
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2.5 text-center text-[var(--jm-text-muted)] text-xs">
                    {e.referenceType ?? "-"}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2.5 text-right tabular-nums">
                    {parseFloat(e.debitAmount) > 0
                      ? `₩${formatAmount(e.debitAmount)}`
                      : "-"}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2.5 text-right tabular-nums">
                    {parseFloat(e.creditAmount) > 0
                      ? `₩${formatAmount(e.creditAmount)}`
                      : "-"}
                  </JmTableCell>
                  <JmTableCell
                    className={cn(
                      "px-3 py-2.5 text-right font-medium tabular-nums",
                      parseFloat(e.balance) < 0 && "text-[var(--jm-danger-fg)]",
                    )}
                  >
                    ₩{formatAmount(e.balance)}
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
