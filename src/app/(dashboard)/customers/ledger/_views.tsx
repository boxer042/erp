"use client";

import React from "react";
import { format } from "date-fns";
import { Printer } from "lucide-react";
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
  PAYMENT_KIND_LABELS,
  type CustomerSummary,
  type LedgerEntry,
} from "./_types";

export interface LedgerViewProps {
  dateGroups: Array<[string, LedgerEntry[]]>;
  selectedCustomerId: string | null;
  selectedCustomerSummary: CustomerSummary | null | undefined;
  from: Date | undefined;
  onEntryDoubleClick: (e: LedgerEntry) => void;
}

export function LedgerView({
  dateGroups,
  selectedCustomerId,
  selectedCustomerSummary,
  from,
  onEntryDoubleClick,
}: LedgerViewProps) {
  return (
    <JmTable className="min-w-[900px] table-fixed border-b border-[var(--jm-border)]">
      <colgroup>
        {!selectedCustomerId && <col style={{ width: "14%" }} />}
        <col style={{ width: "70px" }} />
        <col />
        <col style={{ width: "130px" }} />
        <col style={{ width: "120px" }} />
        <col style={{ width: "120px" }} />
        <col style={{ width: "120px" }} />
      </colgroup>
      <JmTableHeader className="sticky top-0 z-10">
        <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
          {!selectedCustomerId && (
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 font-medium">고객</JmTableHead>
          )}
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-center font-medium">유형</JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 font-medium">설명</JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-center font-medium">참조</JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-right font-medium">차변 (매출)</JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-right font-medium">대변 (수금)</JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-right font-medium">미수 잔액</JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {from && selectedCustomerSummary && (
          <JmTableRow className="bg-[var(--jm-surface-muted)]/60 hover:bg-[var(--jm-surface-muted)]/60">
            <JmTableCell
              colSpan={selectedCustomerId ? 5 : 6}
              className="px-3 py-1.5 text-xs text-[var(--jm-text-muted)] font-medium"
            >
              이월 잔액 ({format(from, "yyyy-MM-dd")} 기준)
            </JmTableCell>
            <JmTableCell className={cn(
              "px-3 py-2.5 text-right font-medium tabular-nums",
              // 과수금(음수) 만 빨강. 정상 미수(양수)·0 은 기본
              selectedCustomerSummary.openingBalance < 0
                ? "text-[var(--jm-danger-fg)]"
                : "text-[var(--jm-text)]",
            )}>
              ₩{formatAmount(selectedCustomerSummary.openingBalance)}
            </JmTableCell>
          </JmTableRow>
        )}
        {dateGroups.map(([date, rows]) => (
          <React.Fragment key={`date-${date}`}>
            <JmTableRow className="bg-[var(--jm-surface)] hover:bg-[var(--jm-surface)]">
              <JmTableCell
                colSpan={selectedCustomerId ? 6 : 7}
                className="px-3 py-1.5 text-xs text-[var(--jm-text-muted)] font-medium"
              >
                {date}
              </JmTableCell>
            </JmTableRow>
            {rows.map((e) => {
              const isReceipt = e.type === "RECEIPT" && e.referenceType === "CUSTOMER_PAYMENT";
              const isManualAdj = e.type === "ADJUSTMENT" && e.referenceType === "MANUAL_ADJUSTMENT";
              const isRefundLog = e.type === "REFUND_LOG";
              const isClickable = isReceipt || isManualAdj;
              const title = isReceipt
                ? "더블클릭: 수금 수정"
                : isManualAdj
                  ? "더블클릭: 조정 수정"
                  : undefined;
              return (
                <JmTableRow
                  key={e.id}
                  className={cn(
                    !isClickable && "hover:bg-transparent",
                    isClickable && "cursor-pointer",
                    isRefundLog && "bg-[var(--jm-danger-bg)]/30",
                  )}
                  title={title}
                  onDoubleClick={() => onEntryDoubleClick(e)}
                >
                  {!selectedCustomerId && (
                    <JmTableCell className="px-3 py-2.5 truncate">{e.customer.name}</JmTableCell>
                  )}
                  <JmTableCell className="px-3 py-2.5 text-center">
                    <JmBadge variant={TYPE_JM_VARIANTS[e.type]} size="sm" shape="square">
                      {TYPE_LABELS[e.type]}
                    </JmBadge>
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2.5 truncate">
                    <span className="inline-flex items-center gap-1.5">
                      {e.description}
                      {e.paymentKind && e.paymentKind !== "MIXED" && (
                        <JmBadge variant="warning" size="sm" shape="square">
                          {PAYMENT_KIND_LABELS[e.paymentKind]}
                        </JmBadge>
                      )}
                      {/* 부분결제/계약금 배지 — 두 포맷 인식
                          · 구 포맷 (백필 전): SALE("잔금") 단독 1행
                          · 신규 포맷 (a7489fc 이후): SALE 전액 + RECEIPT("일부결제" 또는 "계약금") 2행
                          어느 행에 붙어도 한눈에 "이 거래는 부분결제다"가 보이도록. */}
                      {((e.type === "SALE" && e.description.includes("잔금")) ||
                        (e.type === "RECEIPT" &&
                          e.referenceType === "ORDER" &&
                          (e.description.includes("일부결제") ||
                            e.description.includes("계약금")))) && (
                        <JmBadge variant="warning" size="sm" shape="square">
                          {e.description.includes("계약금") ? "계약금" : "부분결제"}
                        </JmBadge>
                      )}
                      {/* 수금 영수증 출력 — RECEIPT(CustomerPayment) 행 한정 */}
                      {isReceipt && e.referenceId && (
                        <a
                          href={`/customer-payments/${e.referenceId}/print?auto=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(ev) => ev.stopPropagation()}
                          title="수금 영수증 출력"
                          className="ml-1 inline-flex size-5 items-center justify-center rounded text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]"
                        >
                          <Printer className="size-3.5" />
                        </a>
                      )}
                    </span>
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2.5 text-center text-[var(--jm-text-muted)] text-xs">
                    {e.referenceType ?? "-"}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2.5 text-right tabular-nums">
                    {parseFloat(e.debitAmount) > 0 ? `₩${formatAmount(e.debitAmount)}` : "-"}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2.5 text-right tabular-nums">
                    {parseFloat(e.creditAmount) > 0 ? `₩${formatAmount(e.creditAmount)}` : "-"}
                  </JmTableCell>
                  <JmTableCell className={cn(
                    "px-3 py-2.5 text-right font-medium tabular-nums",
                    !isRefundLog && parseFloat(e.balance) < 0 && "text-[var(--jm-danger-fg)]",
                  )}>
                    {isRefundLog ? (
                      <span className="text-[var(--jm-text-muted)] text-xs">잔액 무관</span>
                    ) : (
                      `₩${formatAmount(e.balance)}`
                    )}
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
