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
  /** 배송비 결제 방식 — PICKUP 은 무관. DELIVERY/SHIPPING 만 의미 */
  shippingPaymentType?: "PREPAID" | "COD" | "STORE_BURDEN";
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
    items: session.items.map((i) => {
      // ADDON 자식 라인은 옵션 가산 무관 (단독 상품). 메인 라인만 base 환산.
      if (i.isAddon) {
        return {
          productId: i.productId,
          name: i.name,
          sku: i.sku,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountPerUnit: calcDiscountPerUnit(i.unitPrice, i.discount),
          taxType: i.taxType,
          isZeroRate: i.isZeroRate ?? false,
          optionValueIds: [],
          // ADDON 메타 — 서버가 lineRole=ADDON + parentItemId 매핑
          cartItemId: i.cartItemId,
          parentCartItemId: i.parentCartItemId,
          isAddon: true,
        };
      }
      // 옵션 addPrice 는 메인 단가 외 별도 라인(OPTION_REF) 또는 메인 라인 가산으로 서버에서 처리됨.
      // → 카트의 unitPrice 는 (base + addPriceSum) 인데, 서버는 base 만 받아서 addPrice 를 다시 계산.
      // 이중 합산을 막으려고 base 환산 후 전달.
      const addPriceSum = i.optionAddPriceSum ?? 0;
      const baseUnitPrice = Math.max(0, i.unitPrice - addPriceSum);
      return {
        productId: i.productId,
        name: i.name,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: baseUnitPrice,
        discountPerUnit: calcDiscountPerUnit(baseUnitPrice, i.discount),
        taxType: i.taxType,
        isZeroRate: i.isZeroRate ?? false,
        optionValueIds: i.optionValueIds ?? [],
        // 메인 라인 cartItemId — ADDON 자식의 parentCartItemId 매칭용
        cartItemId: i.cartItemId,
      };
    }),
    repairTicketData,
    repairTicketId: linkedRepairTicketId,
    rentalRecords,
    fulfillmentType,
    shippingPaymentType: opts.shippingPaymentType ?? "PREPAID",
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
