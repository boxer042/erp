import type { RepairStatus, RepairTicketDetail } from "./_types";
import { calcRepairTotals as libCalc } from "@/lib/repair";

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
  const list: ActionDef[] = [];
  if (status === "RECEIVED") {
    if (type === "DROP_OFF") {
      list.push({ action: "diagnose", label: "진단 시작", primary: true });
    }
    list.push({ action: "start", label: "수리 시작", primary: type === "ON_SITE" });
    list.push({ action: "cancel", label: "취소", destructive: true });
  } else if (status === "DIAGNOSING") {
    list.push({ action: "quote", label: "견적 확정", primary: true });
    list.push({ action: "cancel", label: "취소", destructive: true });
  } else if (status === "QUOTED") {
    list.push({ action: "approve", label: "고객 승인", primary: true });
    list.push({ action: "cancel", label: "거절", destructive: true });
  } else if (status === "APPROVED") {
    list.push({ action: "start", label: "수리 시작", primary: true });
    list.push({ action: "cancel", label: "취소", destructive: true });
  } else if (status === "REPAIRING") {
    list.push({ action: "ready", label: "수리 완료", primary: true });
    list.push({ action: "cancel", label: "취소", destructive: true });
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
