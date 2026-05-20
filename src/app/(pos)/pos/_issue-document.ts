"use client";

import { apiMutate } from "@/lib/api-client";
import type { CartSession, CartItem } from "@/components/pos/sessions-context";
import { calcDiscountPerUnit } from "@/lib/utils";

/**
 * 카트 지문 — 발행 시점 카트 상태를 짧은 hash 로. 카트 변경 시 재발행 필요 감지.
 * customerId / items(productId+qty+unitPrice+discount) / totalDiscount / shippingCost 만 본다.
 */
export function calcCartFingerprint(session: CartSession): string {
  const parts = [
    session.customerId ?? "",
    session.totalDiscount ?? "0",
    session.shippingCost ?? "0",
    ...session.items.map(
      (i) =>
        `${i.itemType}:${i.productId ?? "x"}:${i.quantity}:${i.unitPrice}:${i.discount}:${i.isZeroRate ? 1 : 0}`,
    ),
  ];
  // 단순 djb2 해시 (외부 의존성 없이)
  const s = parts.join("|");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/**
 * POS 카트의 items 를 quotation/statement 의 items 로 변환.
 * - taxType=TAX_FREE 또는 isZeroRate=true → isTaxable=false
 * - 할인 단가 적용 (calcDiscountPerUnit 으로 unit 별 차감 후 unitPrice 산출)
 */
function mapCartItems(items: CartItem[]) {
  return items.map((it, idx) => {
    const taxFree = it.taxType === "TAX_FREE" || !!it.isZeroRate;
    const discountPerUnit = calcDiscountPerUnit(it.unitPrice, it.discount);
    const unitPriceAfterDiscount = Math.max(0, it.unitPrice - discountPerUnit);
    return {
      productId: it.productId ?? null,
      name: it.name,
      spec: undefined as string | undefined,
      unitOfMeasure: it.unitOfMeasure ?? "EA",
      quantity: String(it.quantity),
      listPrice: String(it.unitPrice),
      discountAmount: String(Math.round(discountPerUnit)),
      unitPrice: String(Math.round(unitPriceAfterDiscount)),
      isTaxable: !taxFree,
      sortOrder: idx,
    };
  });
}

/**
 * 견적서 발행 — POS 카트 → /api/quotations POST → quotation.id 반환.
 * 호출 측은 그 ID 로 /quotations/[id]/print?auto=1 새 탭 띄움.
 */
export async function issueQuotation(session: CartSession): Promise<{ id: string; quotationNo: string }> {
  if (!session.customerId) {
    throw new Error("견적서는 고객 연결이 필요합니다");
  }
  if (session.items.length === 0) {
    throw new Error("카트가 비어있습니다");
  }
  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    type: "SALES" as const,
    status: "DRAFT" as const,
    issueDate: today,
    customerId: session.customerId,
    title: null,
    items: mapCartItems(session.items),
  };
  return apiMutate<{ id: string; quotationNo: string }>(
    "/api/quotations",
    "POST",
    payload,
  );
}

/**
 * 거래명세표 발행 — POS 카트 → /api/statements POST → statement.id 반환.
 * 결제 직전 또는 즉시 증빙용. quotation 우회 직접 발행.
 *
 * orderId 를 넘기면 해당 주문에 연결된다 — 결제 직후 발행 시 전달하면
 * 이후 주문 취소 시 거래명세표도 함께 취소된다.
 */
export async function issueStatement(
  session: CartSession,
  orderId?: string | null,
): Promise<{ id: string; statementNo: string }> {
  if (!session.customerId) {
    throw new Error("거래명세표는 고객 연결이 필요합니다");
  }
  if (session.items.length === 0) {
    throw new Error("카트가 비어있습니다");
  }
  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    status: "ISSUED" as const,
    issueDate: today,
    customerId: session.customerId,
    customerNameSnapshot: session.customerName ?? undefined,
    customerPhoneSnapshot: session.customerPhone ?? undefined,
    orderId: orderId ?? undefined,
    items: mapCartItems(session.items),
  };
  return apiMutate<{ id: string; statementNo: string }>(
    "/api/statements",
    "POST",
    payload,
  );
}

/**
 * 발행 후 새 탭으로 인쇄 페이지 열기 (auto=1 → 자동 다운로드).
 */
export function openPrintTab(kind: "quotations" | "statements", id: string) {
  window.open(`/${kind}/${id}/print?auto=1`, "_blank");
}
