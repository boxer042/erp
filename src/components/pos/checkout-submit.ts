import { apiMutate } from "@/lib/api-client";
import { calcDiscountPerUnit } from "@/lib/utils";
import type { CartSession } from "@/components/pos/sessions-context";

export type CheckoutAction = "order" | "quotation" | "statement";
export type FulfillmentType = "IN_STORE" | "PICKUP" | "DELIVERY" | "SHIPPING";

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
  /** 출고 방식 — 미지정/IN_STORE 시 즉시 종결, PICKUP/DELIVERY/SHIPPING 은 ERP 워크보드 진입 */
  fulfillmentType?: FulfillmentType;
  shipping?: ShippingInfo;
  /** 배송비 결제 방식 — IN_STORE/PICKUP 은 무관. DELIVERY/SHIPPING 만 의미 */
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

  // 임대만 IN_STORE(즉시판매) 강제 (자산 인계가 매장에서 일어나야 함).
  // 수리는 사용자 선택 허용 (수리 완료 후 손님이 배송으로 받는 경우 종종 있음).
  const fulfillmentType: FulfillmentType =
    rentalItems.length > 0
      ? "IN_STORE"
      : opts.fulfillmentType ?? "IN_STORE";
  // 매장 인도(IN_STORE/PICKUP)는 배송정보 불필요
  const isInStore = fulfillmentType === "IN_STORE" || fulfillmentType === "PICKUP";
  const shipping = isInStore ? null : opts.shipping ?? null;

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
          // 정가(상품 마스터 listPrice) — 서버가 OrderItem.listPrice 로 보존, 통합 판매내역 상세에서 정가/할인 비교 표시
          listPrice: i.listPrice ?? null,
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
        // 정가(상품 마스터 listPrice) — unitPrice 와 별도로 보존. 가격 다이얼로그로 단가만 깎인 경우에도
        // 정가/할인 비교가 통합 판매내역 상세에서 보이도록 함.
        listPrice: i.listPrice ?? null,
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
