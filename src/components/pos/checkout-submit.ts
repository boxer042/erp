import { apiMutate } from "@/lib/api-client";
import { calcDiscountPerUnit } from "@/lib/utils";
import type { CartSession } from "@/components/pos/sessions-context";

export type CheckoutAction = "order" | "quotation" | "statement";
export type FulfillmentType = "PICKUP" | "DELIVERY" | "SHIPPING";

export interface ShippingInfo {
  recipientName?: string | null;
  recipientPhone?: string | null;
  address?: string | null;
  /** YYYY-MM-DD — 미지정 시 서버에서 주문일+1로 자동 계산 */
  expectedShipDate?: string | null;
}

export interface CheckoutPayloadOptions {
  action: CheckoutAction;
  paymentMethod?: "CASH" | "CARD" | "TRANSFER" | "MIXED" | "UNPAID" | null;
  taxInvoiceRequested?: boolean;
  memo?: string | null;
  /** 출고 방식 — 미지정/PICKUP 시 즉시 종결, DELIVERY/SHIPPING 은 ERP 워크보드 진입 */
  fulfillmentType?: FulfillmentType;
  shipping?: ShippingInfo;
}

export function buildCheckoutPayload(session: CartSession, opts: CheckoutPayloadOptions) {
  const repairItems = session.items.filter((i) => i.itemType === "repair");
  const rentalItems = session.items.filter((i) => i.itemType === "rental");
  const customerId = session.customerId ?? null;

  const firstRepairMeta = repairItems[0]?.repairMeta;
  // 기존 RepairTicket 픽업 결제: 첫 행에 repairTicketId가 있으면 픽업 모드로 전환
  const linkedRepairTicketId = firstRepairMeta?.repairTicketId ?? null;
  const repairTicketData =
    repairItems.length > 0 && customerId && !linkedRepairTicketId
      ? {
          symptom: firstRepairMeta?.issueDescription,
          deviceBrand: firstRepairMeta?.deviceBrand,
          deviceModel: firstRepairMeta?.deviceModel,
          serialItemId: firstRepairMeta?.serialItemId ?? null,
          labors: repairItems.map((i) => ({ name: i.name, unitRate: i.unitPrice })),
        }
      : undefined;

  const rentalRecords =
    rentalItems.length > 0 && customerId
      ? rentalItems
          .filter((i) => i.rentalMeta?.startDate && i.rentalMeta?.endDate)
          .map((i) => {
            const days = Math.max(
              1,
              Math.round(
                (new Date(i.rentalMeta!.endDate!).getTime() -
                  new Date(i.rentalMeta!.startDate!).getTime()) /
                  86400000
              )
            );
            return {
              assetId: i.rentalMeta!.assetId,
              startDate: i.rentalMeta!.startDate!,
              endDate: i.rentalMeta!.endDate!,
              totalDays: days,
              unitRate: i.rentalMeta!.dailyRate,
              rentalAmount: i.unitPrice * i.quantity,
              depositAmount: i.rentalMeta!.depositAmount,
              checkoutAt: i.rentalMeta!.checkoutAt,
            };
          })
      : undefined;

  // 수리/임대는 매장 인도라 항상 PICKUP 강제 (UI 에서 토글 안 보임)
  const fulfillmentType: FulfillmentType =
    repairItems.length > 0 || rentalItems.length > 0
      ? "PICKUP"
      : opts.fulfillmentType ?? "PICKUP";
  const shipping = fulfillmentType === "PICKUP" ? null : opts.shipping ?? null;

  return {
    action: opts.action,
    customerId,
    customerName: session.customerName ?? null,
    customerPhone: session.customerPhone ?? null,
    paymentMethod: opts.action === "order" ? opts.paymentMethod ?? null : null,
    taxInvoiceRequested: opts.action === "order" ? !!opts.taxInvoiceRequested : false,
    memo: opts.memo ?? null,
    items: session.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discountPerUnit: calcDiscountPerUnit(i.unitPrice, i.discount),
      taxType: i.taxType,
      isZeroRate: i.isZeroRate ?? false,
    })),
    repairTicketData,
    repairTicketId: linkedRepairTicketId,
    rentalRecords,
    fulfillmentType,
    shippingRecipientName: shipping?.recipientName ?? null,
    shippingRecipientPhone: shipping?.recipientPhone ?? null,
    shippingAddress: shipping?.address ?? null,
    expectedShipDate: shipping?.expectedShipDate ?? null,
    // 결제 직전 발번된 라벨 — 서버에서 OrderItem 과 매칭해 orderItemId 연결
    labelCodes: session.labelCodes ?? [],
  };
}

export async function submitCheckout(session: CartSession, opts: CheckoutPayloadOptions) {
  const payload = buildCheckoutPayload(session, opts);
  return apiMutate<{ id: string; no: string }>("/api/pos/checkout", "POST", payload);
}
