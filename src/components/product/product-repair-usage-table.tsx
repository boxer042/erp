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
import { formatDateOnly } from "./helpers";
import type { RepairUsageItem } from "./types";

interface Props {
  usages: RepairUsageItem[];
}

const REPAIR_STATUS_LABEL: Record<string, string> = {
  RECEIVED: "접수",
  DIAGNOSING: "진단중",
  QUOTED: "견적",
  APPROVED: "승인",
  REPAIRING: "수리중",
  READY: "완료대기",
  PICKED_UP: "출고완료",
  CANCELLED: "취소",
};

/**
 * 부속 사용 수리 이력 — 이 상품이 RepairPart 로 소진된 수리 목록 (역방향).
 * 수리번호 클릭 시 해당 수리 상세로 이동.
 */
export function ProductRepairUsageTable({ usages }: Props) {
  if (usages.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-jm-sm text-[var(--jm-text-muted)]">
        이 상품이 부속으로 사용된 수리 이력이 없습니다
      </div>
    );
  }

  return (
    <JmTable>
      <JmTableHeader>
        <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[150px]">
            수리번호
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
            손님
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[80px] text-right">
            수량
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[90px]">
            부속 상태
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[100px]">
            수리 상태
          </JmTableHead>
          <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[110px]">
            사용일
          </JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {usages.map((u) => (
          <JmTableRow key={u.id}>
            <JmTableCell className="px-3 py-2 text-jm-sm">
              <Link
                href={`/repairs/${u.ticketId}`}
                className="font-[family-name:var(--jm-font-mono)] text-jm-xs font-medium text-[var(--jm-text)] hover:underline"
              >
                {u.ticketNo}
              </Link>
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-jm-sm text-[var(--jm-text)]">
              {u.customerName || (
                <span className="text-[var(--jm-text-muted)]">미등록 손님</span>
              )}
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-jm-sm tabular-nums text-right text-[var(--jm-text)]">
              {Number(u.quantity).toLocaleString("ko-KR")}
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-jm-sm">
              <JmBadge
                variant={u.partStatus === "LOST" ? "warning" : "default"}
                size="sm"
                shape="square"
                className="text-jm-2xs"
              >
                {u.partStatus === "LOST" ? "분실" : "사용"}
              </JmBadge>
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-jm-sm">
              <JmBadge
                variant={u.ticketStatus === "CANCELLED" ? "danger" : "outline"}
                size="sm"
                shape="square"
                className="text-jm-2xs"
              >
                {REPAIR_STATUS_LABEL[u.ticketStatus] ?? u.ticketStatus}
              </JmBadge>
            </JmTableCell>
            <JmTableCell className="px-3 py-2 text-jm-xs text-[var(--jm-text-muted)]">
              {formatDateOnly(u.usedAt)}
            </JmTableCell>
          </JmTableRow>
        ))}
      </JmTableBody>
    </JmTable>
  );
}
