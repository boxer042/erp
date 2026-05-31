import { apiMutate } from "@/lib/api-client";
import { calcDiscountPerUnit } from "@/lib/utils";
import type { CartSession } from "@/components/pos/sessions-context";

export type CheckoutAction = "order" | "quotation" | "statement";
export type FulfillmentType =
  | "IN_STORE"
  | "PICKUP"
  | "DELIVERY"
  | "QUICK"
  | "SHIPPING";

export interface ShippingInfo {
  recipientName?: string | null;
  recipientPhone?: string | null;
  address?: string | null;
  /** YYYY-MM-DD — 미지정 시 서버에서 주문일+1로 자동 계산 */
  expectedShipDate?: string | null;
}

export interface CheckoutPayloadOptions {
  action: CheckoutAction;
  paymentMethod?: "CASH" | "CASH_RECEIPT" | "CARD" | "TRANSFER" | "MIXED" | "UNPAID" | null;
  /** 즉시 결제 금액 — null/totalAmount 와 같으면 전액 결제. 그 외 PARTIAL_PAID + 잔금 ledger SALE */
  paidAmount?: number | null;
  /** 부분 결제 구분 — DEPOSIT(계약금) / PARTIAL(부분결제) */
  partialPaymentKind?: "DEPOSIT" | "PARTIAL" | null;
  taxInvoiceRequested?: boolean;
  memo?: string | null;
  /** 출고 방식 — 미지정/IN_STORE 시 즉시 종결, PICKUP/DELIVERY/SHIPPING 은 ERP 워크보드 진입 */
  fulfillmentType?: FulfillmentType;
  shipping?: ShippingInfo;
  /** 배송비 결제 방식 — IN_STORE/PICKUP 은 무관. DELIVERY/SHIPPING 만 의미 */
  shippingPaymentType?: "PREPAID" | "COD" | "STORE_BURDEN";
  /** 배송 원가(매장 지불) — 우리가 낸 퀵비·택배비. 마진에서만 차감 */
  shippingCostBorne?: number;
  /**
   * 결제시간 override — 미지정 시 서버 now() 사용. 매장 사후 입력(영수증 정정 등) 케이스만 사용.
   * Order.orderDate 로 저장. 미래 시점은 서버에서 거부.
   */
  checkoutAt?: Date;
}

export function buildCheckoutPayload(session: CartSession, opts: CheckoutPayloadOptions) {
  const repairItems = session.items.filter((i) => i.itemType === "repair");
  const rentalItems = session.items.filter((i) => i.itemType === "rental");
  const customerId = session.customerId ?? null;

  // 새 RepairTicket 생성 흐름 — 카트 안 모든 repair 라인에 repairTicketId 가 없을 때.
  // 한 라인이라도 기존 ticket(repairTicketId 있음) 이면 기존 finalize 흐름으로 전환되어 repairTicketData 는 미사용.
  const anyExistingRepair = repairItems.some((i) => i.repairMeta?.repairTicketId);
  const firstRepairMeta = repairItems[0]?.repairMeta;
  const repairTicketData =
    repairItems.length > 0 && customerId && !anyExistingRepair
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
    // 부분 결제 — order action 일 때만 의미. 견적서/명세서엔 무관.
    paidAmount: opts.action === "order" ? opts.paidAmount ?? null : null,
    partialPaymentKind:
      opts.action === "order" ? opts.partialPaymentKind ?? null : null,
    taxInvoiceRequested: opts.action === "order" ? !!opts.taxInvoiceRequested : false,
    memo: opts.memo ?? null,
    items: applySessionDiscount(session.items.map((i) => {
      // ADDON 자식 라인은 옵션 가산 무관 (단독 상품). 메인 라인만 base 환산.
      if (i.isAddon) {
        return {
          productId: i.productId,
          itemType: i.itemType,
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
          isService: i.isService ?? false,
          usedItemId: i.usedItemId ?? null,
        };
      }
      // 옵션 addPrice 는 메인 단가 외 별도 라인(OPTION_REF) 또는 메인 라인 가산으로 서버에서 처리됨.
      // → 카트의 unitPrice 는 (base + addPriceSum) 인데, 서버는 base 만 받아서 addPrice 를 다시 계산.
      // 이중 합산을 막으려고 base 환산 후 전달.
      const addPriceSum = i.optionAddPriceSum ?? 0;
      const baseUnitPrice = Math.max(0, i.unitPrice - addPriceSum);
      return {
        productId: i.productId,
        itemType: i.itemType,
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
        // 수리 라인 — 라인별 RepairTicket 매핑. 서버가 라인별로 ticket finalize.
        repairTicketId: i.repairMeta?.repairTicketId ?? null,
        // 서비스로 지급 — OrderItem.isService 로 저장. 영수증/명세표/판매내역에서 배지 표시.
        isService: i.isService ?? false,
        // UsedItem 단품 — 서버가 lot 차감 우회 + UsedItem.status=SOLD + SerialItem 손님 정보 채움
        usedItemId: i.usedItemId ?? null,
        // 선판매 자유 라인 구별 — 서버가 OrderItem.presaleKind 로 저장, 사후 정리에서 기술료와 구별
        presaleKind: i.presaleKind ?? null,
      };
    }), session.totalDiscount),
    repairTicketData,
    rentalRecords,
    fulfillmentType,
    shippingPaymentType: opts.shippingPaymentType ?? "PREPAID",
    shippingCostBorne: isInStore ? 0 : opts.shippingCostBorne ?? 0,
    shippingRecipientName: shipping?.recipientName ?? null,
    shippingRecipientPhone: shipping?.recipientPhone ?? null,
    shippingAddress: shipping?.address ?? null,
    expectedShipDate: shipping?.expectedShipDate ?? null,
    // 결제 직전 발번된 라벨 — 서버에서 OrderItem 과 매칭해 orderItemId 연결
    labelCodes: session.labelCodes ?? [],
    // 결제시간 override — 미지정 시 서버 now() 사용. 영수증 정정 등 사후 입력용.
    checkoutAt: opts.checkoutAt ? opts.checkoutAt.toISOString() : null,
  };
}

export async function submitCheckout(session: CartSession, opts: CheckoutPayloadOptions) {
  const payload = buildCheckoutPayload(session, opts);
  return apiMutate<{
    id: string;
    no: string;
    // 적자 출고 라인 — 재고 없이 출고된 상품. POS 가 toast 로 직원에게 안내.
    oversoldLines?: { name: string; deficitQty: number }[];
  }>("/api/pos/checkout", "POST", payload);
}

// ─── 세션 할인 비례 분배 ────────────────────────────────────────────────────
// 카트 [할인] 버튼으로 입력한 session.totalDiscount("₩30,000" 또는 "10%") 를
// 각 라인의 discountPerUnit 에 비례 분배한다. 서버는 totalDiscount 필드를 받지
// 않으므로 여기서 라인에 흩뿌리지 않으면 Order.totalAmount / RepairTicket.totalDiscount /
// 마진 리포트 모두 카트 UI 와 어긋난다.
//
// 분배 기준: 라인별 (unitPrice - discountPerUnit) × qty 비율.
// 라운딩: 양수 lineNet 의 마지막 라인이 잔액 흡수해 합 일치.
//
// 제한: 옵션 addPrice 가 있는 라인의 OPTION_REF 자식(서버 재구성) 에는 분배 안 됨 —
// 메인 라인의 base 금액 비율로만 흩어지므로, 옵션 addPrice 가 큰 카트에선 분배 합이
// session 할인보다 작아져 Order.totalAmount 가 UI 보다 살짝 높을 수 있음. POS 일반
// 사용(수리·일반 상품)에선 영향 없음.
type DistributableItem = {
  unitPrice: number;
  discountPerUnit: number;
  quantity: number;
};

function applySessionDiscount<T extends DistributableItem>(
  items: T[],
  totalDiscount: string | undefined | null,
): T[] {
  const subtotalNet = items.reduce(
    (s, i) => s + Math.max(0, i.unitPrice - i.discountPerUnit) * i.quantity,
    0,
  );
  const sessionDiscount = parseSessionDiscount(totalDiscount, subtotalNet);
  if (sessionDiscount <= 0 || subtotalNet <= 0) return items;

  // 마지막 양수 lineNet 라인 — 잔액 흡수용
  const lineNets = items.map(
    (i) => Math.max(0, i.unitPrice - i.discountPerUnit) * i.quantity,
  );
  let lastIdx = -1;
  for (let i = lineNets.length - 1; i >= 0; i--) {
    if (lineNets[i] > 0) {
      lastIdx = i;
      break;
    }
  }

  let distributed = 0;
  for (let idx = 0; idx < items.length; idx++) {
    const lineNet = lineNets[idx];
    if (lineNet <= 0) continue;
    const item = items[idx];

    let shareTotal: number;
    if (idx === lastIdx) {
      // 마지막 라인 — 남은 잔액 전부 흡수 (라운딩 보정)
      shareTotal = Math.min(sessionDiscount - distributed, lineNet);
    } else {
      shareTotal = Math.min(
        Math.round((sessionDiscount * lineNet) / subtotalNet),
        lineNet,
      );
    }

    // 라인 KRW → 개당 KRW (정수). 라인이 qty=3 이고 shareTotal 이 qty 배수가 아니면 1~2원 손실.
    const perUnit = Math.round(shareTotal / item.quantity);
    // unitPrice 를 음수로 깎지 못함
    const capped = Math.min(item.unitPrice - item.discountPerUnit, perUnit);
    if (capped <= 0) continue;
    item.discountPerUnit += capped;
    distributed += capped * item.quantity;
  }

  return items;
}

function parseSessionDiscount(
  totalDiscount: string | undefined | null,
  subtotalNet: number,
): number {
  const s = (totalDiscount ?? "0").trim();
  if (!s || s === "0") return 0;
  if (s.endsWith("%")) {
    const pct = Math.min(100, Math.max(0, parseFloat(s.slice(0, -1)) || 0));
    return Math.round((subtotalNet * pct) / 100);
  }
  const raw = parseFloat(s.replace(/,/g, "")) || 0;
  return Math.min(subtotalNet, Math.max(0, raw));
}
