import { randomBytes } from "crypto";

export function genTicketNo() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `R${y}${m}${d}-${r}`;
}

export function genApprovalToken() {
  return randomBytes(24).toString("base64url");
}

// 수리 합계 계산 — 어드민 detail / POS 워크스페이스 / 인쇄 / 서버 픽업이 모두 동일한 결과를 내도록 단일 헬퍼.
// 입력은 Number로 변환 가능한 형태(string/number/Decimal)면 모두 OK.
export interface RepairTotalsInput {
  parts: { totalPrice: unknown; status: "USED" | "LOST" }[];
  labors: { totalPrice: unknown }[];
  diagnosisFee: unknown;
  totalDiscount: string | null | undefined;
}

export interface RepairTotals {
  usedPartsTotal: number;
  laborTotal: number;
  diagnosisFee: number;
  subtotal: number;
  discountAmount: number;
  finalTotal: number;
}

export function calcRepairTotals(input: RepairTotalsInput): RepairTotals {
  const usedPartsTotal = input.parts
    .filter((p) => p.status === "USED")
    .reduce((s, p) => s + Number(p.totalPrice), 0);
  const laborTotal = input.labors.reduce(
    (s, l) => s + Number(l.totalPrice),
    0,
  );
  const diagnosisFee = Number(input.diagnosisFee ?? 0) || 0;
  const subtotal = usedPartsTotal + laborTotal + diagnosisFee;

  const td = (input.totalDiscount ?? "0").trim();
  const discountAmount = td.endsWith("%")
    ? Math.round((subtotal * (parseFloat(td) || 0)) / 100)
    : parseInt(td.replace(/,/g, ""), 10) || 0;

  return {
    usedPartsTotal,
    laborTotal,
    diagnosisFee,
    subtotal,
    discountAmount,
    finalTotal: Math.max(0, subtotal - discountAmount),
  };
}
