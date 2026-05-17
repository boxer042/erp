import type { RepairStatus, RepairTicketDetail } from "./_types";
import { calcRepairTotals as libCalc } from "@/lib/repair";
import { DEFAULT_TAX_RATE } from "@/lib/constants";

export function calcFinal(ticket: RepairTicketDetail): number {
  return libCalc({
    parts: ticket.parts,
    labors: ticket.labors,
    diagnosisFee: ticket.diagnosisFee,
    totalDiscount: ticket.totalDiscount,
  }).finalTotal;
}

// 다음 가능한 액션 — 기존 RepairWorkView 와 동일한 흐름
export interface ActionDef {
  action:
    | "diagnose"
    | "quote"
    | "approve"
    | "start"
    | "ready"
    | "pickup"
    | "cart"
    | "reject_after_quote"
    | "cancel";
  label: string;
  primary?: boolean; // 큰 메인 버튼인지
  destructive?: boolean;
}

/**
 * @param canSendToCart v2 고객 페이지 안에서 호출 시 true — 픽업 대신 "카트에 추가" 노출.
 *                     repairs standalone 진입 시 false — 자체 PickupSheet 사용 (v1 호환).
 */
export function nextActions(
  status: RepairStatus,
  type: "ON_SITE" | "DROP_OFF",
  canSendToCart = false,
): ActionDef[] {
  // 하단 sticky 액션 바는 "다음 단계 진행" 만 노출. 취소/거절 같은 destructive 액션은 헤더 kebab 메뉴.
  const list: ActionDef[] = [];
  if (status === "RECEIVED") {
    if (type === "DROP_OFF") {
      list.push({ action: "diagnose", label: "진단 시작", primary: true });
    }
    list.push({ action: "start", label: "수리 시작", primary: type === "ON_SITE" });
  } else if (status === "DIAGNOSING") {
    list.push({ action: "reject_after_quote", label: "진단비만" });
    list.push({ action: "quote", label: "견적 확정", primary: true });
  } else if (status === "QUOTED") {
    list.push({ action: "reject_after_quote", label: "진단비만" });
    list.push({ action: "approve", label: "고객 승인", primary: true });
  } else if (status === "APPROVED") {
    list.push({ action: "start", label: "수리 시작", primary: true });
  } else if (status === "REPAIRING") {
    // ON_SITE 는 새수리 드로워에서 바로 REPAIRING 진입 → 손님 거절 시 진단비만 청구도 이 단계에서 가능.
    // DROP_OFF 는 REPAIRING 까지 오면 이미 손님 승인 끝난 상태라 거절 의미 없음.
    if (type === "ON_SITE") {
      list.push({ action: "reject_after_quote", label: "진단비만" });
    }
    list.push({ action: "ready", label: "수리 완료", primary: true });
  } else if (status === "READY") {
    if (canSendToCart) {
      // v2 흐름: 카트에 라인 추가 → 다른 상품/임대와 함께 한 번에 결제
      list.push({ action: "cart", label: "카트에 추가", primary: true });
    } else {
      // 기존 흐름: 자체 픽업 결제
      list.push({ action: "pickup", label: "픽업 / 결제", primary: true });
    }
  }
  return list;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function fmtKRW(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  return `₩${(Number.isFinite(v) ? v : 0).toLocaleString("ko-KR")}`;
}

/**
 * 부가세 포함 표시 — DB 저장값은 세전(공급가액) 이지만 사용자에게는 부가세 포함으로 노출.
 * 수리 항목은 부속·공임·진단비 모두 TAXABLE 가정 (10% VAT).
 * 면세 부속이 도입되면 part.product.taxType 을 받아 분기 필요.
 */
export function fmtKRWInc(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  const gross = Math.round((Number.isFinite(v) ? v : 0) * (1 + DEFAULT_TAX_RATE));
  return `₩${gross.toLocaleString("ko-KR")}`;
}

/** 세액만 표시 — 공급가액(세전) × 0.1 */
export function fmtKRWTax(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  const tax = Math.round((Number.isFinite(v) ? v : 0) * DEFAULT_TAX_RATE);
  return `₩${tax.toLocaleString("ko-KR")}`;
}
