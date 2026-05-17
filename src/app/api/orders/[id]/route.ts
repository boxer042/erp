import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeSellingCostPerUnit } from "@/lib/selling-cost";
import { fifoConsume, ensureBulkStock, isOversellAllowed } from "@/lib/inventory/fifo";
import { orderUpdateSchema } from "@/lib/validators/order";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  dispatchAcceptReturn,
  dispatchPushStock,
  dispatchPushTracking,
  dispatchRejectReturn,
} from "@/lib/channels/outbound";
import { rebalanceCustomerLedger } from "@/lib/customer-ledger";
import { learnDiagnosisPartSet } from "@/lib/repair-diagnosis-usage";
import { notify } from "@/lib/notifications/dispatch";
import {
  dispatchPaymentCancel,
  dispatchRefund,
} from "@/lib/payments/dispatch";
import { CustomerRefundMethod, Prisma } from "@prisma/client";

/**
 * 환불 입력 — 매장이 RefundDialog 에서 실제 환불 내역을 기록할 때 전달.
 * 없으면 paymentStatus 만 변경 (구버전 호환). 있으면 CustomerRefund row 생성.
 */
type RefundInputPayload = {
  amount: number;
  method: CustomerRefundMethod;
  refundedAt: string; // ISO date
  memo?: string | null;
};

function parseRefundInput(raw: unknown): RefundInputPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const amount = typeof o.amount === "number" ? o.amount : Number(o.amount);
  const method = typeof o.method === "string" ? (o.method as CustomerRefundMethod) : null;
  const refundedAt = typeof o.refundedAt === "string" ? o.refundedAt : null;
  const memo = typeof o.memo === "string" ? o.memo : null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (
    !method ||
    !["CARD_CANCEL", "CASH", "BANK_TRANSFER", "POINTS", "OTHER"].includes(method)
  )
    return null;
  if (!refundedAt) return null;
  return { amount, method, refundedAt, memo };
}

/**
 * CustomerRefund 기록 — 손님에게 실제 돈이 나간 사실을 기록.
 * - customerId 가 있어야 함 (anonymous 결제 즉시환불은 기록 안 함)
 * - 금액·방법·일자·메모 는 UI 에서 입력. method 는 enum (CARD_CANCEL/CASH/BANK_TRANSFER/POINTS/OTHER)
 */
async function createCustomerRefundRecord(
  tx: Prisma.TransactionClient,
  args: {
    orderId: string;
    orderNo: string;
    customerId: string;
    input: RefundInputPayload;
    createdById: string;
  },
) {
  return tx.customerRefund.create({
    data: {
      customerId: args.customerId,
      orderId: args.orderId,
      amount: args.input.amount,
      method: args.input.method,
      refundedAt: new Date(args.input.refundedAt),
      memo: args.input.memo ?? null,
      createdById: args.createdById,
    },
  });
}

/**
 * 교환 새 주문번호 — 원본 주문번호 뒤에 -EX 접미사. 사용자가 한눈에 교환 새 주문임을 인지.
 * 충돌 가능성 낮음 (원본은 ORD[YYMMDD]-[4자리], 교환은 그 뒤 -EX 추가).
 */
function generateExchangeOrderNo(originalOrderNo: string): string {
  return `${originalOrderNo}-EX`;
}

/**
 * claimReason 별 책임 매핑 — UI/api 양쪽이 일치해야 함 (단일 출처).
 * shop=매장책임 / customer=손님책임 / shared=분담.
 * 운임 청구 자동 제안: 새 -EX 주문의 shippingPaymentType + memo 에 반영.
 */
const CLAIM_LIABILITY_API: Record<string, "shop" | "customer" | "shared"> = {
  DEFECTIVE: "shop",
  DAMAGED_IN_TRANSIT: "shop",
  WRONG_ITEM: "shop",
  CHANGE_MIND: "customer",
  SIZE_COLOR: "shared",
  OTHER: "shared",
};

/**
 * 교환 -EX 새 주문의 운임 정책 자동 제안.
 * - shop: STORE_BURDEN (매장 부담) + 안내 메모
 * - customer: COD (착불) + "운임 청구 검토" 메모
 * - shared: PREPAID + 분담 안내 메모 (매장 직원이 직접 청구액 결정)
 * - reason null: PREPAID 폴백
 */
function deriveExchangeShippingPolicy(reason: string | null): {
  shippingPaymentType: "PREPAID" | "COD" | "STORE_BURDEN";
  liabilityNote: string;
} {
  const liability = reason ? CLAIM_LIABILITY_API[reason] : null;
  if (liability === "shop") {
    return {
      shippingPaymentType: "STORE_BURDEN",
      liabilityNote: "매장 책임 사유 — 회수·재발송 운임 매장 부담 자동 적용",
    };
  }
  if (liability === "customer") {
    return {
      shippingPaymentType: "COD",
      liabilityNote: "손님 책임 사유 — 착불 자동 설정. 운임 청구액 직접 입력 후 발송",
    };
  }
  if (liability === "shared") {
    return {
      shippingPaymentType: "PREPAID",
      liabilityNote: "협의 사유 — 운임 매장·손님 분담 검토. shippingFee 직접 입력",
    };
  }
  return {
    shippingPaymentType: "PREPAID",
    liabilityNote: "claimReason 미설정 — 운임 정책 직접 결정",
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      channel: { select: { name: true, code: true, commissionRate: true } },
      createdBy: { select: { name: true } },
      // 교환으로 생성된 새 주문 link (이 주문에서 시작된 교환)
      exchangeOrder: {
        select: {
          id: true,
          orderNo: true,
          status: true,
          totalAmount: true,
          paymentStatus: true,
        },
      },
      // 이 주문이 다른 주문의 교환 새 주문인 경우 — reverse lookup (역참조)
      // 차액 계산 + 운임 책임 안내를 위해 totalAmount + claimReason 함께 가져옴.
      exchangedFromOrders: {
        select: {
          id: true,
          orderNo: true,
          status: true,
          totalAmount: true,
          claimType: true,
          claimReason: true,
        },
      },
      items: {
        include: {
          product: {
            select: {
              id: true, name: true, sku: true, isSet: true,
              isCanonical: true, canonicalProductId: true,
              productType: true, sellingPrice: true,
              setComponents: {
                include: { component: { select: { id: true, name: true } } },
              },
              variants: {
                select: {
                  id: true, name: true, sku: true, sellingPrice: true,
                  inventory: { select: { quantity: true } },
                },
              },
            },
          },
          // 진입 경로 SKU — 자사몰/외부 채널 funnel. 상세 시트의 라인별 명시용
          entryProduct: { select: { id: true, name: true, sku: true } },
        },
      },
      // 분할 송장 — 회차별 발송 이력 (shipmentNo 순). 라인별 발송 수량 함께
      shipments: {
        orderBy: { shipmentNo: "asc" },
        include: {
          items: {
            select: {
              id: true,
              orderItemId: true,
              quantity: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json(order);
}

// 주문 상태 변경
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { action } = body as { action: string };

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      channel: { select: { id: true, code: true, commissionRate: true } },
      items: {
        include: {
          product: {
            select: {
              id: true, name: true, isSet: true, isCanonical: true,
              productType: true,
              setComponents: {
                select: {
                  componentId: true, quantity: true,
                  component: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
  }

  // 주문 확정(prepare) 가드:
  //   1) 대표 상품(canonical) 그대로면 차단 — 변형 확정 후 재시도
  //   2) OPTION_PARENT 그대로면 차단 — 자체 재고 없는 placeholder 라 SWAP 옵션값으로 실제 SKU 결정 필요
  // 양쪽 모두 항목 단위 productId 교체로 해결 — POS 의 canonical 결제 가드와 동일한 흐름.
  if (action === "prepare") {
    const unresolved = order.items.filter(
      (i) =>
        i.product &&
        (i.product.isCanonical || i.product.productType === "OPTION_PARENT"),
    );
    if (unresolved.length > 0) {
      const names = unresolved.map((i) => i.product?.name ?? "").join(", ");
      return NextResponse.json(
        {
          error: `다음 항목의 변형/옵션이 확정되지 않았습니다: ${names}. 출고 준비 단계에서 실제 출고 SKU 를 선택해주세요.`,
          unresolvedItemIds: unresolved.map((i) => i.id),
        },
        { status: 400 },
      );
    }
  }

  /**
   * 출고 흐름 (5단계):
   *   PENDING(주문/접수) →(prepare)→ PREPARING(출고대기) →(pack)→ PREPARING_PACKED(출고확정)
   *     →(ship)→ SHIPPED(배송중) →(complete)→ COMPLETED(배송완료)
   *
   * 반품/교환 흐름 (5단계):
   *   COMPLETED →(request_return)→ RETURN_REQUESTED  (손님 요청)
   *   RETURN_REQUESTED →(accept_return)→ RETURN_ACCEPTED  (수락)
   *   RETURN_REQUESTED →(reject_return)→ COMPLETED  (반려)
   *   RETURN_REQUESTED →(cancel_return_request)→ COMPLETED  (자진 취소)
   *   RETURN_ACCEPTED →(collect_return)→ RETURN_COLLECTED  (회수완료)
   *   RETURN_COLLECTED →(inspect_return)→ RETURN_INSPECTED  (검수완료)
   *   RETURN_INSPECTED →(refund)→ RETURNED  (반품완료 + 재고 복원 + 환불/매출취소)
   *   RETURN_INSPECTED →(exchange)→ EXCHANGED  (교환완료 + 재고 복원 + 새 주문 자동 생성)
   *
   * 단축 경로 (매장 즉석 처리):
   *   COMPLETED →(return)→ RETURNED  (1단계 즉시 반품)
   *
   * 취소: PENDING/PREPARING →(cancel)→ CANCELLED  (PREPARING_PACKED 후 불가, 송장 발급 후라 반품으로)
   *
   * 부수효과:
   *   - 재고 차감: prepare 시점 (출고대기 진입 시 FIFO 차감 + LotConsumption)
   *   - 재고 복원: cancel(PREPARING)/refund/exchange (PENDING 취소·CANCELLED 는 차감 X)
   *   - paymentStatus 전이:
   *     · cancel: PAID → REFUNDED, UNPAID → SALES_CANCELLED
   *     · refund: PAID → REFUNDED, UNPAID → SALES_CANCELLED
   *     · exchange: 그대로 유지 (차액은 새 주문에서 정산)
   *     · inspect_return: PAID → REFUND_PENDING (환불 절차 진행 중 표시)
   */
  const statusTransitions: Record<
    string,
    { from: string | string[]; to: string }
  > = {
    prepare: { from: "PENDING", to: "PREPARING" },
    pack: { from: "PREPARING", to: "PREPARING_PACKED" },
    ship: { from: "PREPARING_PACKED", to: "SHIPPED" },
    // SHIPPED→COMPLETED (배송 종결) + PREPARING→COMPLETED (PICKUP 픽업완료 단축)
    complete: { from: ["SHIPPED", "PREPARING"], to: "COMPLETED" },
    cancel: { from: ["PENDING", "PREPARING"], to: "CANCELLED" },
    request_return: { from: "COMPLETED", to: "RETURN_REQUESTED" },
    accept_return: { from: "RETURN_REQUESTED", to: "RETURN_ACCEPTED" },
    reject_return: { from: "RETURN_REQUESTED", to: "COMPLETED" },
    cancel_return_request: { from: "RETURN_REQUESTED", to: "COMPLETED" },
    /** 회수 시작 — 택배 회수 라벨 발급. RETURN_ACCEPTED → RETURN_PICKING. 매장 → 손님 통보. */
    start_picking: {
      from: "RETURN_ACCEPTED",
      to: "RETURN_PICKING",
    },
    collect_return: {
      // RETURN_ACCEPTED 직접 가능(라벨 없이 매장 직접 수거) + RETURN_PICKING(라벨 발급 후 도착)
      from: ["RETURN_ACCEPTED", "RETURN_PICKING"],
      to: "RETURN_COLLECTED",
    },
    inspect_return: {
      from: "RETURN_COLLECTED",
      to: "RETURN_INSPECTED",
    },
    /** 검수 반려 — 회수했지만 검수 결과 불량(포장 손상·사용 흔적 등)
     *  손님에게 반송, COMPLETED 복귀. 재고 복원 X (물품 다시 손님에게).
     *  paymentStatus 도 그대로 유지. */
    reject_inspection: {
      from: "RETURN_COLLECTED",
      to: "COMPLETED",
    },
    refund: {
      // COMPLETED 도 허용 — 매장 즉석 반품(단축경로). `return` 액션과 같은 분기에서 처리되므로 안전.
      from: [
        "COMPLETED",
        "RETURN_INSPECTED",
        "RETURN_COLLECTED",
        "RETURN_PICKING",
        "RETURN_ACCEPTED",
      ],
      to: "RETURNED",
    },
    return: {
      // 하위 호환 + 단축 경로 — COMPLETED 에서 즉시 반품
      from: [
        "COMPLETED",
        "RETURN_REQUESTED",
        "RETURN_ACCEPTED",
        "RETURN_PICKING",
        "RETURN_COLLECTED",
        "RETURN_INSPECTED",
      ],
      to: "RETURNED",
    },
    exchange: {
      from: [
        "RETURN_ACCEPTED",
        "RETURN_PICKING",
        "RETURN_COLLECTED",
        "RETURN_INSPECTED",
      ],
      to: "EXCHANGED",
    },
  };

  // === 부분 출고 (partial_ship) — PREPARING/PREPARING_PACKED 에서 일부만 발송 ===
  // 항목별 shipQty 받음 → OrderItem.shippedQty 누적 갱신.
  // 모두 fully shipped 면 status=SHIPPED, 일부면 status 그대로 유지.
  // 송장 정보 (carrier, trackingNumber) 도 함께 저장 — 단일 송장 (분할 송장은 후속).
  if (action === "partial_ship") {
    if (
      order.status !== "PREPARING" &&
      order.status !== "PREPARING_PACKED"
    ) {
      return NextResponse.json(
        {
          error: `${order.status} 상태에서는 부분 출고할 수 없습니다 (PREPARING/PREPARING_PACKED 만 가능)`,
        },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.partialItems) || body.partialItems.length === 0) {
      return NextResponse.json(
        { error: "partialItems 가 필요합니다" },
        { status: 400 },
      );
    }
    type ShipItem = { orderItemId: string; shipQty: number };
    const ships: ShipItem[] = (
      body.partialItems as Array<{ orderItemId?: string; shipQty?: number }>
    )
      .filter(
        (p): p is ShipItem =>
          typeof p.orderItemId === "string" &&
          typeof p.shipQty === "number" &&
          p.shipQty > 0,
      )
      .map((p) => ({ orderItemId: p.orderItemId, shipQty: p.shipQty }));
    if (ships.length === 0) {
      return NextResponse.json(
        { error: "유효한 출고 수량이 없습니다" },
        { status: 400 },
      );
    }

    const itemMap = new Map(order.items.map((i) => [i.id, i]));
    for (const s of ships) {
      const it = itemMap.get(s.orderItemId);
      if (!it) {
        return NextResponse.json(
          { error: `OrderItem ${s.orderItemId} 가 없습니다` },
          { status: 400 },
        );
      }
      const already = Number(it.shippedQty);
      const newTotal = already + s.shipQty;
      if (newTotal > Number(it.quantity) + 0.0001) {
        return NextResponse.json(
          {
            error: `${it.product?.name ?? it.id}: 발송 누적 ${newTotal} > 주문 수량 ${it.quantity}`,
          },
          { status: 400 },
        );
      }
    }

    const trackingPatch =
      typeof body.trackingCarrier === "string" ||
      typeof body.trackingNumber === "string"
        ? {
            ...(typeof body.trackingCarrier === "string"
              ? { trackingCarrier: body.trackingCarrier || null }
              : {}),
            ...(typeof body.trackingNumber === "string"
              ? { trackingNumber: body.trackingNumber || null }
              : {}),
          }
        : {};

    const auditUserShip = await getCurrentUser();
    let allFullyShipped = true;
    const updated = await prisma.$transaction(async (tx) => {
      for (const s of ships) {
        const it = itemMap.get(s.orderItemId)!;
        const newShipped = Number(it.shippedQty) + s.shipQty;
        await tx.orderItem.update({
          where: { id: it.id },
          data: { shippedQty: newShipped },
        });
        if (newShipped < Number(it.quantity) - 0.0001) {
          allFullyShipped = false;
        }
      }
      // 다른 OrderItem 들도 모두 fully shipped 인지 확인
      if (allFullyShipped) {
        for (const it of order.items) {
          const ship = ships.find((s) => s.orderItemId === it.id);
          const finalShipped = ship
            ? Number(it.shippedQty) + ship.shipQty
            : Number(it.shippedQty);
          if (finalShipped < Number(it.quantity) - 0.0001) {
            allFullyShipped = false;
            break;
          }
        }
      }
      const newStatus = allFullyShipped ? "SHIPPED" : order.status;
      const u = await tx.order.update({
        where: { id },
        data: {
          status: newStatus,
          ...trackingPatch,
          shipmentCount: { increment: 1 },
        },
      });

      // Shipment 회차 생성 — 이 회차에 발송한 ShipmentItem 도 함께. shipmentNo = 기존+1
      const nextShipmentNo = (order.shipmentCount ?? 0) + 1;
      const carrierForShipment =
        typeof body.trackingCarrier === "string"
          ? body.trackingCarrier || null
          : (order.trackingCarrier ?? null);
      const trackingForShipment =
        typeof body.trackingNumber === "string"
          ? body.trackingNumber || null
          : (order.trackingNumber ?? null);
      await tx.shipment.create({
        data: {
          orderId: id,
          shipmentNo: nextShipmentNo,
          trackingCarrier: carrierForShipment,
          trackingNumber: trackingForShipment,
          shippedAt: new Date(),
          items: {
            create: ships.map((s) => ({
              orderItemId: s.orderItemId,
              quantity: s.shipQty,
            })),
          },
        },
      });

      await recordAudit(tx, {
        userId: auditUserShip?.id ?? null,
        entity: "Order",
        entityId: id,
        action: "STATUS_CHANGE",
        meta: {
          from: order.status,
          to: newStatus,
          action: "partial_ship",
          orderNo: order.orderNo,
          ships,
          shipmentNo: nextShipmentNo,
          fullyShipped: allFullyShipped,
        },
      });
      return u;
    });

    // Outbound — fully shipped 시점에 채널에 송장 push (best-effort)
    if (
      allFullyShipped &&
      updated.channelId &&
      updated.channelOrderNo &&
      (updated.trackingCarrier || updated.trackingNumber)
    ) {
      await dispatchPushTracking(
        prisma,
        {
          orderId: id,
          channelId: updated.channelId,
          channelOrderNo: updated.channelOrderNo,
        },
        updated.trackingCarrier ?? "",
        updated.trackingNumber ?? "",
        auditUserShip?.id ?? null,
      );
    }

    return NextResponse.json(updated);
  }

  const transition = statusTransitions[action];
  if (!transition) {
    return NextResponse.json({ error: "유효하지 않은 액션입니다" }, { status: 400 });
  }

  const allowedFrom = Array.isArray(transition.from)
    ? transition.from
    : [transition.from];
  if (!allowedFrom.includes(order.status)) {
    return NextResponse.json(
      { error: `현재 상태(${order.status})에서 ${action} 할 수 없습니다` },
      { status: 400 },
    );
  }

  // PREPARING→COMPLETED 단축 전이는 PICKUP(픽업대기) 에만 허용. DELIVERY/SHIPPING 은 pack→ship→complete 거쳐야 함.
  if (
    action === "complete" &&
    order.status === "PREPARING" &&
    order.fulfillmentType !== "PICKUP"
  ) {
    return NextResponse.json(
      { error: "PICKUP(픽업대기) 주문만 PREPARING 단계에서 바로 완료할 수 있습니다" },
      { status: 400 },
    );
  }

  // === prepare 시 재고 차감 + cost snapshot (기존 confirm 로직과 동일) ===
  if (action === "prepare") {
    // 채널 수수료율 + 오프라인(channelId IS NULL) 이면 현재 카드수수료율 (트랜잭션 외에서 fetch)
    const channelCommRate = order.channel ? Number(order.channel.commissionRate) : 0;
    const isOffline = order.channelId == null;
    const currentCardFee = isOffline
      ? await prisma.cardFeeRate.findFirst({
          where: { appliedFrom: { lte: new Date() } },
          orderBy: { appliedFrom: "desc" },
        })
      : null;
    const cardFeeRateSnapshot = currentCardFee ? Number(currentCardFee.rate) : null;

    try {
      // 모든 OrderItem의 productId 모아 sellingCost를 일괄 조회 (N+1 방지)
      const productIds = Array.from(
        new Set(order.items.map((i) => i.product?.id).filter((p): p is string => !!p))
      );
      const allSellingCosts = productIds.length > 0
        ? await prisma.sellingCost.findMany({
            where: {
              productId: { in: productIds },
              isActive: true,
              OR: [
                { channelId: null },
                ...(order.channelId ? [{ channelId: order.channelId }] : []),
              ],
            },
          })
        : [];
      const sellingCostsByProduct = new Map<string, typeof allSellingCosts>();
      for (const sc of allSellingCosts) {
        const arr = sellingCostsByProduct.get(sc.productId) ?? [];
        arr.push(sc);
        sellingCostsByProduct.set(sc.productId, arr);
      }

      const allowOversell = await isOversellAllowed();

      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id }, data: { status: "PREPARING" } });

        // FIFO 로트 소진 + orderItemId로 LotConsumption 생성
        const fifoForOrderItem = async (
          productId: string,
          orderItemId: string,
          qty: number,
          displayName: string,
        ) => {
          await ensureBulkStock(tx, productId, qty, displayName, allowOversell);
          const { consumptions, unitCostAvg } = await fifoConsume(
            tx,
            productId,
            qty,
            displayName,
            allowOversell,
          );
          if (consumptions.length > 0) {
            await tx.lotConsumption.createMany({
              data: consumptions.map((c) => ({
                orderItemId,
                lotId: c.lotId,
                quantity: c.quantity,
                unitCost: c.unitCost,
              })),
            });
          }
          return unitCostAvg;
        };

        for (const item of order.items) {
          if (!item.product) continue; // 서비스 항목(productId 없음)은 재고 소진 스킵
          let unitCostSnapshot: number | null = null;

          if (item.product.isSet && item.product.setComponents.length > 0) {
            // 조립상품: 완제품 로트 우선 차감, 부족분만 구성품 즉시 소비
            const orderQty = Number(item.quantity);
            const finishedInv = await tx.inventory.findUnique({
              where: { productId: item.product.id },
            });
            // 완제품 재고가 음수(이미 초과판매)일 수 있으므로 0 으로 clamp —
            // 부족분(componentQty)이 orderQty 를 넘지 않게 한다.
            const finishedAvailable = finishedInv
              ? Math.max(0, Math.min(orderQty, Number(finishedInv.quantity)))
              : 0;
            const componentQty = orderQty - finishedAvailable;

            let finishedCostTotal = 0;
            if (finishedAvailable > 0) {
              const finishedUnitCost = await fifoForOrderItem(
                item.product.id,
                item.id,
                finishedAvailable,
                `${item.product.name} (완제품 재고)`,
              );
              finishedCostTotal = finishedUnitCost * finishedAvailable;

              const inv = await tx.inventory.update({
                where: { productId: item.product.id },
                data: { quantity: { decrement: finishedAvailable } },
              });
              await tx.inventoryMovement.create({
                data: {
                  inventoryId: inv.id,
                  type: "OUTGOING",
                  quantity: finishedAvailable,
                  balanceAfter: inv.quantity,
                  referenceId: order.id,
                  referenceType: "ORDER",
                  memo: `주문 ${order.orderNo} 완제품 출고`,
                },
              });
            }

            let componentCostTotal = 0;
            if (componentQty > 0) {
              // 부족분은 구성품에서 즉시 소비 (현 로직 유지)
              for (const comp of item.product.setComponents) {
                const deductQty = componentQty * Number(comp.quantity);
                const compUnitCost = await fifoForOrderItem(
                  comp.componentId,
                  item.id,
                  deductQty,
                  `세트 구성품 ${comp.component.name}`,
                );
                componentCostTotal +=
                  compUnitCost * Number(comp.quantity) * componentQty;

                const inventory = await tx.inventory.update({
                  where: { productId: comp.componentId },
                  data: { quantity: { decrement: deductQty } },
                });
                await tx.inventoryMovement.create({
                  data: {
                    inventoryId: inventory.id,
                    type: "SET_CONSUME",
                    quantity: deductQty,
                    balanceAfter: inventory.quantity,
                    referenceId: order.id,
                    referenceType: "ORDER",
                    memo: `주문 ${order.orderNo} 세트 구성품 차감`,
                  },
                });
              }
            }

            unitCostSnapshot = (finishedCostTotal + componentCostTotal) / orderQty;
          } else {
            // 단품: FIFO 차감
            unitCostSnapshot = await fifoForOrderItem(
              item.product.id,
              item.id,
              Number(item.quantity),
              item.product.name,
            );

            const inventory = await tx.inventory.update({
              where: { productId: item.product.id },
              data: { quantity: { decrement: Number(item.quantity) } },
            });
            await tx.inventoryMovement.create({
              data: {
                inventoryId: inventory.id,
                type: "OUTGOING",
                quantity: Number(item.quantity),
                balanceAfter: inventory.quantity,
                referenceId: order.id,
                referenceType: "ORDER",
                memo: `주문 ${order.orderNo}`,
              },
            });
          }

          // 판매비용 스냅샷 — 트랜잭션 시작 전 일괄 조회한 결과를 사용 (N+1 방지)
          const sellingCosts = sellingCostsByProduct.get(item.product.id) ?? [];
          const sellingCostSnapshot = computeSellingCostPerUnit(
            sellingCosts,
            Number(item.unitPrice),
          );

          if (unitCostSnapshot == null) {
            console.warn(
              `[orders/confirm] unitCostSnapshot 누락: orderItemId=${item.id}, productId=${item.product?.id}. ` +
                `LotConsumption 도 없을 가능성 → 마진 리포트 부정확.`
            );
          }

          await tx.orderItem.update({
            where: { id: item.id },
            data: {
              unitCostSnapshot,
              channelCommissionRateSnapshot: channelCommRate,
              cardFeeRateSnapshot,
              sellingCostSnapshot,
            },
          });
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "주문 확정 실패";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const updated = await prisma.order.findUnique({ where: { id } });

    // Inventory 변동 — 매핑된 채널에 가용 재고 push (best-effort, 트랜잭션 외부)
    const productIdsToPush = Array.from(
      new Set(
        order.items
          .flatMap((i) => [
            i.product?.id,
            ...(i.product?.setComponents?.map((sc) => sc.componentId) ?? []),
          ])
          .filter((p): p is string => !!p),
      ),
    );
    if (productIdsToPush.length > 0) {
      await dispatchPushStock(prisma, productIdsToPush);
    }

    return NextResponse.json(updated);
  }

  // === 단순 단계 전이 (재고·결제 변동 없음, 상태만) ===
  // pack:              PREPARING → PREPARING_PACKED. 송장 입력은 ship 액션에서.
  // collect_return:    RETURN_ACCEPTED → RETURN_COLLECTED. 물품 도착.
  // inspect_return:    RETURN_COLLECTED → RETURN_INSPECTED. 검수 통과 + paymentStatus PAID→REFUND_PENDING.
  // reject_inspection: RETURN_COLLECTED → COMPLETED. 검수 반려 — 손님 반송, returnRejectedAt 기록.
  if (
    action === "pack" ||
    action === "collect_return" ||
    action === "inspect_return" ||
    action === "reject_inspection"
  ) {
    const auditUser = await getCurrentUser();
    const targetStatus = transition.to as
      | "PREPARING_PACKED"
      | "RETURN_COLLECTED"
      | "RETURN_INSPECTED"
      | "COMPLETED";
    const trackingPatch =
      action === "pack"
        ? {
            ...(typeof body.trackingCarrier === "string"
              ? { trackingCarrier: body.trackingCarrier || null }
              : {}),
            ...(typeof body.trackingNumber === "string"
              ? { trackingNumber: body.trackingNumber || null }
              : {}),
          }
        : {};
    // 검수완료 시 결제 축 표시 갱신 — PAID 였다면 REFUND_PENDING (환불 절차 진행 중)
    const paymentPatch =
      action === "inspect_return" && order.paymentStatus === "PAID"
        ? { paymentStatus: "REFUND_PENDING" as const }
        : {};
    // 검수 반려 — returnRejectedAt 기록 + reason 보강. 재고·결제 변동 없음.
    const reasonInputForReject =
      typeof body.returnReason === "string" ? body.returnReason : undefined;
    const rejectPatch =
      action === "reject_inspection"
        ? {
            returnRejectedAt: new Date(),
            ...(reasonInputForReject
              ? { returnReason: reasonInputForReject }
              : {}),
          }
        : {};
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.order.update({
        where: { id },
        data: {
          status: targetStatus,
          ...trackingPatch,
          ...paymentPatch,
          ...rejectPatch,
        },
      });
      await recordAudit(tx, {
        userId: auditUser?.id ?? null,
        entity: "Order",
        entityId: id,
        action: "STATUS_CHANGE",
        meta: {
          from: order.status,
          to: targetStatus,
          action,
          orderNo: order.orderNo,
          ...(reasonInputForReject
            ? { rejectReason: reasonInputForReject }
            : {}),
        },
      });
      return u;
    });
    return NextResponse.json(updated);
  }

  // === 반품 흐름 단계 전이 (재고·결제 변동 없음, 상태 + timestamp + claim 정보만) ===
  // request_return: 손님 요청 접수 + claimType (필수, default REFUND) + claimReason (선택)
  // accept_return:  매장 수락 (returnAcceptedAt). 매장이 claimType 변경 가능 (수락 시 결정 변경)
  // reject_return:  매장 반려 (returnRejectedAt). claim 정보 보존
  // cancel_return_request: 손님 자진 취소 — claim 정보 모두 클리어
  if (
    action === "request_return" ||
    action === "accept_return" ||
    action === "reject_return" ||
    action === "cancel_return_request"
  ) {
    const auditUser = await getCurrentUser();
    const targetStatus = transition.to as
      | "RETURN_REQUESTED"
      | "RETURN_ACCEPTED"
      | "COMPLETED";
    const now = new Date();

    const reasonInput =
      typeof body.returnReason === "string" ? body.returnReason : undefined;
    const VALID_CLAIM_TYPES = [
      "REFUND",
      "EXCHANGE_SAME",
      "EXCHANGE_DIFFERENT",
    ] as const;
    const VALID_CLAIM_REASONS = [
      "DEFECTIVE",
      "DAMAGED_IN_TRANSIT",
      "WRONG_ITEM",
      "CHANGE_MIND",
      "SIZE_COLOR",
      "OTHER",
    ] as const;
    type ClaimType = (typeof VALID_CLAIM_TYPES)[number];
    type ClaimReason = (typeof VALID_CLAIM_REASONS)[number];
    const claimTypeInput: ClaimType | undefined = VALID_CLAIM_TYPES.includes(
      body.claimType,
    )
      ? body.claimType
      : undefined;
    const claimReasonInput: ClaimReason | undefined =
      VALID_CLAIM_REASONS.includes(body.claimReason)
        ? body.claimReason
        : undefined;

    const patch: Record<string, unknown> = {};
    if (action === "request_return") {
      patch.returnRequestedAt = now;
      patch.claimType = claimTypeInput ?? "REFUND";
      if (claimReasonInput) patch.claimReason = claimReasonInput;
      if (reasonInput !== undefined) patch.returnReason = reasonInput;
    } else if (action === "accept_return") {
      patch.returnAcceptedAt = now;
      // 매장이 수락 시점에 claimType 조정 가능 (예: 손님은 교환 원했지만 매장이 환불로 결정)
      if (claimTypeInput) patch.claimType = claimTypeInput;
      if (claimReasonInput) patch.claimReason = claimReasonInput;
    } else if (action === "reject_return") {
      patch.returnRejectedAt = now;
      if (reasonInput !== undefined) patch.returnReason = reasonInput;
    } else if (action === "cancel_return_request") {
      // 자진 취소 — claim 정보 전부 리셋해 흐름 깨끗이
      patch.returnRequestedAt = null;
      patch.claimType = null;
      patch.claimReason = null;
      patch.returnReason = null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.order.update({
        where: { id },
        data: { status: targetStatus, ...patch },
      });
      await recordAudit(tx, {
        userId: auditUser?.id ?? null,
        entity: "Order",
        entityId: id,
        action: "STATUS_CHANGE",
        meta: {
          from: order.status,
          to: targetStatus,
          action,
          orderNo: order.orderNo,
          claimType: patch.claimType ?? undefined,
          claimReason: patch.claimReason ?? undefined,
          ...(reasonInput ? { reason: reasonInput } : {}),
        },
      });
      return u;
    });

    // Outbound — 매장 결정을 채널에 자동 통보 (best-effort)
    if (
      (action === "accept_return" || action === "reject_return") &&
      order.channelId &&
      order.channelOrderNo
    ) {
      const ctx = {
        orderId: id,
        channelId: order.channelId,
        channelOrderNo: order.channelOrderNo,
      };
      if (action === "accept_return") {
        await dispatchAcceptReturn(prisma, ctx, auditUser?.id ?? null);
      } else {
        await dispatchRejectReturn(
          prisma,
          ctx,
          reasonInput ?? "",
          auditUser?.id ?? null,
        );
      }
    }

    // 알림 — 손님에게 수락/반려 통지 (best-effort)
    if (action === "accept_return" || action === "reject_return") {
      const phone = order.customerPhone;
      if (phone) {
        const isAccept = action === "accept_return";
        await notify(
          { phone, name: order.customerName ?? undefined },
          {
            kind: isAccept ? "RETURN_ACCEPTED" : "RETURN_REJECTED",
            subject: `[${isAccept ? "반품 수락" : "반품 반려"}] ${order.orderNo}`,
            body: isAccept
              ? `주문 ${order.orderNo} 반품 요청이 수락되었습니다. 회수 안내를 곧 보내드리겠습니다.`
              : `주문 ${order.orderNo} 반품 요청이 반려되었습니다.${reasonInput ? ` 사유: ${reasonInput}` : ""}`,
          },
          "sms",
        );
      }
    }

    return NextResponse.json(updated);
  }

  // === 부분 교환 (exchange + body.partialItems) — 일부 OrderItem 만 교환 ===
  // 흐름: RETURN_INSPECTED 까지 진행 → exchange 시점에 partialItems 로 일부 지정.
  // 부분 반품과 알고리즘 동일하나 결과가 다름:
  //  - 새 주문(-EX) 자동 생성 (EXCHANGE_SAME 이면 회수된 항목만 복제, DIFFERENT 면 빈 항목)
  //  - paymentStatus 그대로 유지 (환불 X, 차액은 새 주문에서)
  //  - 종결 status: 모두 fully returned → EXCHANGED, 일부면 COMPLETED 복귀
  if (
    action === "exchange" &&
    Array.isArray(body.partialItems) &&
    body.partialItems.length > 0
  ) {
    type PartialItem = { orderItemId: string; returnQty: number };
    const partials: PartialItem[] = (
      body.partialItems as Array<{ orderItemId?: string; returnQty?: number }>
    )
      .filter(
        (p): p is PartialItem =>
          typeof p.orderItemId === "string" &&
          typeof p.returnQty === "number" &&
          p.returnQty > 0,
      )
      .map((p) => ({ orderItemId: p.orderItemId, returnQty: p.returnQty }));

    if (partials.length === 0) {
      return NextResponse.json(
        { error: "유효한 partialItems 가 없습니다" },
        { status: 400 },
      );
    }

    // claimType 결정 (Dialog body 우선, order 폴백, default SAME)
    const exchangeClaimType: "EXCHANGE_SAME" | "EXCHANGE_DIFFERENT" =
      body.claimType === "EXCHANGE_SAME" ||
      body.claimType === "EXCHANGE_DIFFERENT"
        ? body.claimType
        : order.claimType === "EXCHANGE_SAME" ||
            order.claimType === "EXCHANGE_DIFFERENT"
          ? order.claimType
          : "EXCHANGE_SAME";
    const exchangeSame = exchangeClaimType === "EXCHANGE_SAME";

    // 검증 — 모든 orderItemId 가 이 주문에 속하고, returnedQty + returnQty <= quantity
    const itemMap = new Map(order.items.map((i) => [i.id, i]));
    for (const p of partials) {
      const it = itemMap.get(p.orderItemId);
      if (!it) {
        return NextResponse.json(
          { error: `OrderItem ${p.orderItemId} 가 이 주문에 없습니다` },
          { status: 400 },
        );
      }
      const already = Number(it.returnedQty);
      const newTotal = already + p.returnQty;
      if (newTotal > Number(it.quantity) + 0.0001) {
        return NextResponse.json(
          {
            error: `${it.product?.name ?? it.id}: 반품 누적 ${newTotal} > 주문 수량 ${it.quantity}`,
          },
          { status: 400 },
        );
      }
    }

    const auditUser = await getCurrentUser();
    let allFullyReturnedAfter = true;
    let exchangeNewOrderId: string | null = null;

    await prisma.$transaction(async (tx) => {
      for (const p of partials) {
        const it = itemMap.get(p.orderItemId)!;
        const productId = it.product?.id;
        if (!productId) continue;

        // LotConsumption 부분 복원 — createdAt DESC
        const consumptions = await tx.lotConsumption.findMany({
          where: { orderItemId: it.id },
          orderBy: { createdAt: "desc" },
          include: { lot: { select: { id: true } } },
        });
        let restoreLeft = p.returnQty;
        for (const c of consumptions) {
          if (restoreLeft <= 0) break;
          const cQty = Number(c.quantity);
          const take = Math.min(restoreLeft, cQty);
          await tx.inventoryLot.update({
            where: { id: c.lotId },
            data: { remainingQty: { increment: take } },
          });
          if (take >= cQty - 0.0001) {
            await tx.lotConsumption.delete({ where: { id: c.id } });
          } else {
            await tx.lotConsumption.update({
              where: { id: c.id },
              data: { quantity: cQty - take },
            });
          }
          restoreLeft -= take;
        }
        const inventory = await tx.inventory.update({
          where: { productId },
          data: { quantity: { increment: p.returnQty } },
        });
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            type: "RETURN",
            quantity: p.returnQty,
            balanceAfter: inventory.quantity,
            referenceId: order.id,
            referenceType: "ORDER",
            memo: `주문 ${order.orderNo} 부분 교환 복원 (item ${it.id})`,
          },
        });

        // OrderItem 누적 갱신 — 부분 교환은 refundedAmount 누적 안 함 (환불 없음)
        const newReturnedQty = Number(it.returnedQty) + p.returnQty;
        await tx.orderItem.update({
          where: { id: it.id },
          data: { returnedQty: newReturnedQty },
        });

        if (newReturnedQty < Number(it.quantity) - 0.0001) {
          allFullyReturnedAfter = false;
        }
      }

      // 다른 OrderItem 들도 모두 fully returned 인지 확인
      if (allFullyReturnedAfter) {
        for (const it of order.items) {
          const partial = partials.find((p) => p.orderItemId === it.id);
          const finalReturned = partial
            ? Number(it.returnedQty) + partial.returnQty
            : Number(it.returnedQty);
          if (finalReturned < Number(it.quantity) - 0.0001) {
            allFullyReturnedAfter = false;
            break;
          }
        }
      }

      // 새 주문(-EX) 자동 생성 — 부분 교환은 회수된 항목만 복제 (EXCHANGE_SAME) 또는 빈 항목 (DIFFERENT)
      const newOrderNo = generateExchangeOrderNo(order.orderNo);
      const cloneItems = exchangeSame
        ? partials
            .map((p) => {
              const it = itemMap.get(p.orderItemId);
              if (!it || !it.product) return null;
              return {
                productId: it.product.id,
                quantity: p.returnQty,
                listPrice: it.listPrice,
                discountAmount: it.discountAmount,
                unitPrice: it.unitPrice,
                totalPrice: p.returnQty * Number(it.unitPrice),
              };
            })
            .filter((x): x is NonNullable<typeof x> => !!x)
        : [];

      const subtotal = exchangeSame
        ? cloneItems.reduce((s, i) => s + Number(i.totalPrice), 0)
        : 0;

      // 운임 정책 자동 제안 — claimReason 책임 매핑 기반 (매장 책임/손님 책임/분담)
      const shippingPolicy = deriveExchangeShippingPolicy(
        (order.claimReason as string | null) ?? null,
      );
      const newOrder = await tx.order.create({
        data: {
          orderNo: newOrderNo,
          channelId: order.channelId,
          customerId: order.customerId,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          recipientName: order.recipientName,
          recipientPhone: order.recipientPhone,
          shippingAddress: order.shippingAddress,
          fulfillmentType: order.fulfillmentType,
          orderDate: new Date(),
          status: "PENDING",
          paymentStatus: exchangeSame ? "PAID" : "UNPAID",
          paymentMethod: exchangeSame ? order.paymentMethod : null,
          subtotalAmount: subtotal,
          discountAmount: 0,
          shippingFee: 0,
          shippingPaymentType: shippingPolicy.shippingPaymentType,
          taxAmount: 0,
          totalAmount: subtotal,
          commissionAmount: 0,
          memo: `부분 교환 발송 — 원본 ${order.orderNo}${exchangeSame ? " (같은 상품 일부)" : " (다른 상품 — 항목·차액 직접 편집)"}\n[운임] ${shippingPolicy.liabilityNote}`,
          createdById: auditUser?.id ?? order.createdById,
          items:
            cloneItems.length > 0
              ? { create: cloneItems }
              : undefined,
        },
      });
      exchangeNewOrderId = newOrder.id;

      // 원본 주문 status — 모두 fully returned 면 EXCHANGED, 일부면 COMPLETED 복귀
      // 부분 교환은 paymentStatus 변동 없음 (환불 X, 차액은 새 주문에서)
      const newStatus = allFullyReturnedAfter ? "EXCHANGED" : "COMPLETED";
      await tx.order.update({
        where: { id },
        data: {
          status: newStatus,
          claimType: exchangeClaimType,
          ...(allFullyReturnedAfter
            ? {
                exchangedAt: new Date(),
                exchangeOrderId: exchangeNewOrderId,
              }
            : {}),
        },
      });

      await recordAudit(tx, {
        userId: auditUser?.id ?? null,
        entity: "Order",
        entityId: id,
        action: "STATUS_CHANGE",
        meta: {
          from: order.status,
          to: newStatus,
          action: "partial_exchange",
          orderNo: order.orderNo,
          claimType: exchangeClaimType,
          partials,
          fullyReturned: allFullyReturnedAfter,
          exchangeNewOrderId,
        },
      });
    });

    // Inventory 변동 — 매핑된 채널에 가용 재고 push
    const productIdsToPush = Array.from(
      new Set(
        partials
          .map((p) => itemMap.get(p.orderItemId)?.product?.id)
          .filter((p): p is string => !!p),
      ),
    );
    if (productIdsToPush.length > 0) {
      await dispatchPushStock(prisma, productIdsToPush);
    }

    // 알림 — 부분 교환 시 차액 결제 안내 (best-effort)
    if (exchangeNewOrderId) {
      const phone = order.customerPhone;
      if (phone) {
        const isDiff = exchangeClaimType === "EXCHANGE_DIFFERENT";
        await notify(
          { phone, name: order.customerName ?? undefined },
          {
            kind: "EXCHANGE_DIFFERENT_PAYMENT",
            subject: `[부분 교환] ${order.orderNo}`,
            body: isDiff
              ? `주문 ${order.orderNo} 부분 교환이 접수되었습니다. 차액 결제 안내는 매장에서 별도 연락드리겠습니다.`
              : `주문 ${order.orderNo} 부분 교환이 접수되었습니다. 새 발송 정보는 곧 안내드리겠습니다.`,
            meta: { exchangeNewOrderId, claimType: exchangeClaimType },
          },
          "sms",
        );
      }
    }

    const updated = await prisma.order.findUnique({ where: { id } });
    return NextResponse.json(updated);
  }

  // === 부분 반품 (refund + body.partialItems) — 일부 OrderItem 만 환불 ===
  // 흐름: RETURN_INSPECTED 까지 정상 진행 → refund 시점에 partialItems 로 일부 지정.
  // 종결 status: 모든 OrderItem 이 returnedQty == quantity 면 RETURNED, 아니면 COMPLETED 복귀.
  // paymentStatus: 결제 → PARTIAL_REFUND(부분) / REFUNDED(전체), 외상 → SALES_CANCELLED + ledger 부분 차감.
  if (
    action === "refund" &&
    Array.isArray(body.partialItems) &&
    body.partialItems.length > 0
  ) {
    type PartialItem = { orderItemId: string; returnQty: number };
    const partials: PartialItem[] = (
      body.partialItems as Array<{ orderItemId?: string; returnQty?: number }>
    )
      .filter(
        (p): p is PartialItem =>
          typeof p.orderItemId === "string" &&
          typeof p.returnQty === "number" &&
          p.returnQty > 0,
      )
      .map((p) => ({ orderItemId: p.orderItemId, returnQty: p.returnQty }));

    if (partials.length === 0) {
      return NextResponse.json(
        { error: "유효한 partialItems 가 없습니다" },
        { status: 400 },
      );
    }

    // 검증 — 모든 orderItemId 가 이 주문에 속하고, returnedQty + returnQty <= quantity
    const itemMap = new Map(order.items.map((i) => [i.id, i]));
    for (const p of partials) {
      const it = itemMap.get(p.orderItemId);
      if (!it) {
        return NextResponse.json(
          { error: `OrderItem ${p.orderItemId} 가 이 주문에 없습니다` },
          { status: 400 },
        );
      }
      const already = Number(it.returnedQty);
      const newTotal = already + p.returnQty;
      if (newTotal > Number(it.quantity) + 0.0001) {
        return NextResponse.json(
          {
            error: `${it.product?.name ?? it.id}: 반품 누적 ${newTotal} > 주문 수량 ${it.quantity}`,
          },
          { status: 400 },
        );
      }
    }

    const wasUnpaid = order.paymentStatus === "UNPAID";
    const wasPaidOrPending =
      order.paymentStatus === "PAID" ||
      order.paymentStatus === "REFUND_PENDING" ||
      order.paymentStatus === "PARTIAL_REFUND";
    const auditUser = await getCurrentUser();

    let totalRefundAmount = 0;
    let allFullyReturnedAfter = true;

    await prisma.$transaction(async (tx) => {
      for (const p of partials) {
        const it = itemMap.get(p.orderItemId)!;
        const productId = it.product?.id;
        if (!productId) continue; // 서비스 라인 — 재고 무관

        // LotConsumption 부분 복원 — createdAt DESC (가장 최근 소진 lot 부터 복원)
        const consumptions = await tx.lotConsumption.findMany({
          where: { orderItemId: it.id },
          orderBy: { createdAt: "desc" },
          include: { lot: { select: { id: true } } },
        });
        let restoreLeft = p.returnQty;
        for (const c of consumptions) {
          if (restoreLeft <= 0) break;
          const cQty = Number(c.quantity);
          const take = Math.min(restoreLeft, cQty);
          await tx.inventoryLot.update({
            where: { id: c.lotId },
            data: { remainingQty: { increment: take } },
          });
          if (take >= cQty - 0.0001) {
            await tx.lotConsumption.delete({ where: { id: c.id } });
          } else {
            await tx.lotConsumption.update({
              where: { id: c.id },
              data: { quantity: cQty - take },
            });
          }
          restoreLeft -= take;
        }
        // Inventory 복원 + movement
        const inventory = await tx.inventory.update({
          where: { productId },
          data: { quantity: { increment: p.returnQty } },
        });
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            type: "RETURN",
            quantity: p.returnQty,
            balanceAfter: inventory.quantity,
            referenceId: order.id,
            referenceType: "ORDER",
            memo: `주문 ${order.orderNo} 부분 반품 복원 (item ${it.id})`,
          },
        });

        // OrderItem 누적 갱신
        const newReturnedQty = Number(it.returnedQty) + p.returnQty;
        const itemRefund = p.returnQty * Number(it.unitPrice);
        const newRefunded = Number(it.refundedAmount) + itemRefund;
        await tx.orderItem.update({
          where: { id: it.id },
          data: {
            returnedQty: newReturnedQty,
            refundedAmount: newRefunded,
          },
        });

        totalRefundAmount += itemRefund;
        if (newReturnedQty < Number(it.quantity) - 0.0001) {
          allFullyReturnedAfter = false;
        }
      }

      // 다른 OrderItem 들도 모두 fully returned 인지 확인 (이번에 처리 안 한 것들)
      if (allFullyReturnedAfter) {
        for (const it of order.items) {
          const partial = partials.find((p) => p.orderItemId === it.id);
          const finalReturned = partial
            ? Number(it.returnedQty) + partial.returnQty
            : Number(it.returnedQty);
          if (finalReturned < Number(it.quantity) - 0.0001) {
            allFullyReturnedAfter = false;
            break;
          }
        }
      }

      const newStatus = allFullyReturnedAfter ? "RETURNED" : "COMPLETED";
      const newPaymentStatus: "REFUNDED" | "PARTIAL_REFUND" | "SALES_CANCELLED" =
        allFullyReturnedAfter
          ? wasUnpaid
            ? "SALES_CANCELLED"
            : "REFUNDED"
          : "PARTIAL_REFUND";

      await tx.order.update({
        where: { id },
        data: {
          status: newStatus,
          paymentStatus: newPaymentStatus,
        },
      });

      // 외상이면 customer ledger ADJUSTMENT (부분 금액)
      if (wasUnpaid && order.customerId) {
        const lastLedger = await tx.customerLedger.findFirst({
          where: { customerId: order.customerId },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        });
        const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
        await tx.customerLedger.create({
          data: {
            customerId: order.customerId,
            type: "ADJUSTMENT",
            description: `${allFullyReturnedAfter ? "매출취소" : "부분 매출취소"} — 주문 ${order.orderNo}`,
            debitAmount: 0,
            creditAmount: totalRefundAmount,
            balance: prevBalance - totalRefundAmount,
            referenceId: order.id,
            referenceType: allFullyReturnedAfter
              ? "ORDER_SALES_CANCELLED"
              : "ORDER_PARTIAL_SALES_CANCELLED",
          },
        });
        await rebalanceCustomerLedger(tx, order.customerId);
      }

      // CustomerRefund 기록 — PAID/REFUND_PENDING 결제건의 실제 돈 환불 내역 (UI 입력 시)
      // UNPAID 는 위에서 ledger ADJUSTMENT 처리되므로 별도 기록 불필요
      const refundInput = parseRefundInput((body as { refundInput?: unknown }).refundInput);
      if (wasPaidOrPending && refundInput && order.customerId && auditUser?.id) {
        await createCustomerRefundRecord(tx, {
          orderId: id,
          orderNo: order.orderNo,
          customerId: order.customerId,
          input: refundInput,
          createdById: auditUser.id,
        });
      }

      await recordAudit(tx, {
        userId: auditUser?.id ?? null,
        entity: "Order",
        entityId: id,
        action: "STATUS_CHANGE",
        meta: {
          from: order.status,
          to: newStatus,
          action: "partial_refund",
          orderNo: order.orderNo,
          refundAmount: totalRefundAmount,
          refundMethod: refundInput?.method ?? null,
          refundedAt: refundInput?.refundedAt ?? null,
          partials,
          fullyReturned: allFullyReturnedAfter,
        },
      });
    });

    // Inventory 변동 — 매핑된 채널에 가용 재고 push (best-effort, 트랜잭션 외부)
    const productIdsToPush = Array.from(
      new Set(
        partials
          .map((p) => itemMap.get(p.orderItemId)?.product?.id)
          .filter((p): p is string => !!p),
      ),
    );
    if (productIdsToPush.length > 0) {
      await dispatchPushStock(prisma, productIdsToPush);
    }

    // PG hook — 부분 환불 (PAID/REFUND_PENDING 결제건만, 외상은 호출 안 함)
    if (wasPaidOrPending && totalRefundAmount > 0) {
      await dispatchRefund(
        prisma,
        {
          orderId: id,
          orderNo: order.orderNo,
          amount: totalRefundAmount,
          reason: `부분 반품 (${partials.length}건)`,
          userId: auditUser?.id ?? null,
        },
        true,
      );
    }

    const updated = await prisma.order.findUnique({ where: { id } });
    return NextResponse.json(updated);
  }

  // === 취소/반품/환불/교환 시 재고 복원 + 결제 상태 전이 ===
  // PENDING 은 재고 차감 안 된 상태이므로 그냥 상태만 변경.
  // PREPARING 이상은 차감됐으므로 LotConsumption 복원 + Inventory 복원.
  // exchange: 재고 복원 + paymentStatus 유지 + 새 주문 자동 생성 (교환 발송용).
  // 결제 분기:
  //   - PAID/REFUND_PENDING → REFUNDED (환불 완료)
  //   - UNPAID → SALES_CANCELLED (외상은 환불 없이 매출 취소)
  if (
    action === "cancel" ||
    action === "return" ||
    action === "refund" ||
    action === "exchange"
  ) {
    const wasStockDeducted = order.status !== "PENDING";
    const wasUnpaid = order.paymentStatus === "UNPAID";
    const wasPaidOrPending =
      order.paymentStatus === "PAID" ||
      order.paymentStatus === "REFUND_PENDING";
    const isExchange = action === "exchange";
    // exchange 액션은 body 의 claimType 을 우선 (UI Dialog 에서 SAME/DIFFERENT 직접 선택).
    // body 미전달 시 order.claimType 폴백. 둘 다 EXCHANGE_* 가 아니면 기본 EXCHANGE_SAME.
    const exchangeClaimType: "EXCHANGE_SAME" | "EXCHANGE_DIFFERENT" =
      isExchange
        ? body.claimType === "EXCHANGE_SAME" ||
          body.claimType === "EXCHANGE_DIFFERENT"
          ? body.claimType
          : order.claimType === "EXCHANGE_SAME" ||
              order.claimType === "EXCHANGE_DIFFERENT"
            ? order.claimType
            : "EXCHANGE_SAME"
        : "EXCHANGE_SAME";
    const exchangeSame = isExchange && exchangeClaimType === "EXCHANGE_SAME";
    const auditUser = await getCurrentUser();
    let exchangeNewOrderId: string | null = null;
    await prisma.$transaction(async (tx) => {
      const targetStatus =
        action === "cancel"
          ? "CANCELLED"
          : action === "exchange"
            ? "EXCHANGED"
            : "RETURNED";

      // 교환 분기: 회수 후 다시 출고할 새 주문 자동 생성
      // - EXCHANGE_SAME:      항목 복제 (같은 상품 재발송, 매출 0 — 이미 결제됨)
      // - EXCHANGE_DIFFERENT: 빈 항목 (사용자가 새 항목 + 차액 직접 편집)
      if (isExchange) {
        const newOrderNo = generateExchangeOrderNo(order.orderNo);
        const cloneItems = exchangeSame
          ? order.items
              .filter((i) => i.product) // 서비스 항목 제외 (재고 무관)
              .map((i) => ({
                productId: i.product!.id,
                quantity: i.quantity,
                listPrice: i.listPrice,
                discountAmount: i.discountAmount,
                unitPrice: i.unitPrice,
                totalPrice: i.totalPrice,
              }))
          : [];

        // 운임 정책 자동 제안 — claimReason 책임 매핑 기반
        const shippingPolicyFull = deriveExchangeShippingPolicy(
          (order.claimReason as string | null) ?? null,
        );
        const newOrder = await tx.order.create({
          data: {
            orderNo: newOrderNo,
            channelId: order.channelId,
            customerId: order.customerId,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            recipientName: order.recipientName,
            recipientPhone: order.recipientPhone,
            shippingAddress: order.shippingAddress,
            fulfillmentType: order.fulfillmentType,
            orderDate: new Date(),
            status: "PENDING",
            // EXCHANGE_SAME: 매출 인식 안 됨, 이미 결제 완료된 건의 재발송 → totalAmount=0, PAID
            // EXCHANGE_DIFFERENT: 새 항목 + 차액 정산 — 사용자가 PATCH 로 편집 후 결제
            paymentStatus: exchangeSame ? "PAID" : "UNPAID",
            paymentMethod: exchangeSame ? order.paymentMethod : null,
            subtotalAmount: exchangeSame ? Number(order.subtotalAmount) : 0,
            discountAmount: exchangeSame
              ? Number(order.discountAmount)
              : 0,
            shippingFee: 0,
            shippingPaymentType: shippingPolicyFull.shippingPaymentType,
            taxAmount: exchangeSame ? Number(order.taxAmount) : 0,
            totalAmount: exchangeSame ? Number(order.totalAmount) : 0,
            commissionAmount: 0,
            memo: `교환 발송 — 원본 ${order.orderNo}${exchangeSame ? " (같은 상품)" : " (다른 상품 — 항목·차액 직접 편집)"}\n[운임] ${shippingPolicyFull.liabilityNote}`,
            createdById: auditUser?.id ?? order.createdById,
            items:
              cloneItems.length > 0
                ? { create: cloneItems }
                : undefined,
          },
        });
        exchangeNewOrderId = newOrder.id;
      }

      // 결제 축 전이:
      //   - exchange: 그대로 유지 (차액은 새 주문)
      //   - cancel/return/refund + PAID/REFUND_PENDING → REFUNDED
      //   - cancel/return/refund + UNPAID → SALES_CANCELLED (외상 매출 취소)
      let paymentPatch: { paymentStatus?: "REFUNDED" | "SALES_CANCELLED" } = {};
      if (!isExchange) {
        if (wasPaidOrPending) paymentPatch = { paymentStatus: "REFUNDED" };
        else if (wasUnpaid) paymentPatch = { paymentStatus: "SALES_CANCELLED" };
      }
      await tx.order.update({
        where: { id },
        data: {
          status: targetStatus,
          ...paymentPatch,
          ...(isExchange
            ? {
                exchangedAt: new Date(),
                exchangeOrderId: exchangeNewOrderId,
                // 사용자가 RETURN_ACCEPTED 단계에서 claimType 변경했다면 함께 반영
                claimType: exchangeClaimType,
              }
            : {}),
        },
      });

      // === SALES_CANCELLED — 외상 주문 매출 취소 시 customer ledger 자동 조정 ===
      // 주문 생성 시 외상이면 SALE 잔액이 누적되어 있음 → 매출 취소 시 ADJUSTMENT (credit) 로 차감.
      // 등록 고객(customerId) 있는 외상에만 적용. 비등록 외상은 ledger 자체가 없음.
      if (paymentPatch.paymentStatus === "SALES_CANCELLED" && order.customerId) {
        const lastLedger = await tx.customerLedger.findFirst({
          where: { customerId: order.customerId },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        });
        const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
        const orderAmount = Number(order.totalAmount);
        await tx.customerLedger.create({
          data: {
            customerId: order.customerId,
            type: "ADJUSTMENT",
            description: `매출취소 — 주문 ${order.orderNo}`,
            debitAmount: 0,
            creditAmount: orderAmount,
            balance: prevBalance - orderAmount,
            referenceId: order.id,
            referenceType: "ORDER_SALES_CANCELLED",
          },
        });
        // 후속 ledger 항목들의 balance 재계산 (시간순 정렬 보장)
        await rebalanceCustomerLedger(tx, order.customerId);
      }
      // CustomerRefund 기록 — refund/cancel/return 시 실제 환불 내역 (UI 입력 시).
      // exchange 는 paymentStatus 유지 → 차액은 새 -EX 주문에서 처리되므로 여기서는 제외.
      const refundInput = parseRefundInput((body as { refundInput?: unknown }).refundInput);
      if (
        !isExchange &&
        wasPaidOrPending &&
        refundInput &&
        order.customerId &&
        auditUser?.id
      ) {
        await createCustomerRefundRecord(tx, {
          orderId: id,
          orderNo: order.orderNo,
          customerId: order.customerId,
          input: refundInput,
          createdById: auditUser.id,
        });
      }

      await recordAudit(tx, {
        userId: auditUser?.id ?? null,
        entity: "Order",
        entityId: id,
        action: action === "cancel" ? "CANCEL" : "STATUS_CHANGE",
        meta: {
          from: order.status,
          to: targetStatus,
          orderNo: order.orderNo,
          totalAmount: Number(order.totalAmount),
          stockRestored: wasStockDeducted,
          paymentTransition: paymentPatch.paymentStatus ?? null,
          refundMethod: !isExchange ? refundInput?.method ?? null : undefined,
          refundedAt: !isExchange ? refundInput?.refundedAt ?? null : undefined,
          isExchange,
          claimType: isExchange ? order.claimType ?? null : undefined,
          exchangeNewOrderId: exchangeNewOrderId ?? undefined,
        },
      });

      if (wasStockDeducted) {
        // 모든 OrderItem 의 LotConsumption 을 한 번에 조회 (N+1 방지)
        const itemIds = order.items.map((i) => i.id);
        const allConsumptions = await tx.lotConsumption.findMany({
          where: { orderItemId: { in: itemIds } },
          include: { lot: { select: { productId: true } } },
        });

        // 로트별 복원 수량 집계 → 일괄 update 병렬
        const perLot = new Map<string, number>();
        const perProduct = new Map<string, number>();
        for (const c of allConsumptions) {
          perLot.set(c.lotId, (perLot.get(c.lotId) ?? 0) + Number(c.quantity));
          const pid = c.lot.productId;
          if (pid) {
            perProduct.set(pid, (perProduct.get(pid) ?? 0) + Number(c.quantity));
          }
        }

        await Promise.all(
          Array.from(perLot.entries()).map(([lotId, qty]) =>
            tx.inventoryLot.update({
              where: { id: lotId },
              data: { remainingQty: { increment: qty } },
            })
          )
        );
        await tx.lotConsumption.deleteMany({ where: { orderItemId: { in: itemIds } } });

        // 제품별 inventory 복원 — 순차 (movement 생성에 inventory.id 필요)
        for (const [productId, qty] of perProduct) {
          const inventory = await tx.inventory.update({
            where: { productId },
            data: { quantity: { increment: qty } },
          });
          await tx.inventoryMovement.create({
            data: {
              inventoryId: inventory.id,
              type: "RETURN",
              quantity: qty,
              balanceAfter: inventory.quantity,
              referenceId: order.id,
              referenceType: "ORDER",
              memo: `주문 ${order.orderNo} ${action === "cancel" ? "취소" : action === "exchange" ? "교환" : "반품"} 복원`,
            },
          });
        }
      }
    });

    const updated = await prisma.order.findUnique({ where: { id } });

    // Inventory 복원 — 매핑된 채널에 가용 재고 push (best-effort, 트랜잭션 외부)
    if (wasStockDeducted) {
      const productIdsToPush = Array.from(
        new Set(
          order.items
            .flatMap((i) => [
              i.product?.id,
              ...(i.product?.setComponents?.map((sc) => sc.componentId) ?? []),
            ])
            .filter((p): p is string => !!p),
        ),
      );
      if (productIdsToPush.length > 0) {
        await dispatchPushStock(prisma, productIdsToPush);
      }
    }

    // PG hook — PAID/REFUND_PENDING 였던 결제건 환불·취소 자동 시도 (best-effort)
    if (wasPaidOrPending && !isExchange) {
      const ctx = {
        orderId: id,
        orderNo: order.orderNo,
        amount: Number(order.totalAmount),
        reason: action === "cancel" ? "주문 취소" : "반품 환불",
        userId: auditUser?.id ?? null,
      };
      if (action === "cancel") {
        await dispatchPaymentCancel(prisma, ctx);
      } else {
        await dispatchRefund(prisma, ctx, false);
      }
    }

    // 알림 — 교환 시 차액 결제 안내 (best-effort)
    // EXCHANGE_DIFFERENT: 새 주문(-EX) 의 빈 항목에 차액이 잡힐 수 있음. 사용자가 새 항목 등록 후 손님 결제 안내.
    // EXCHANGE_SAME: 차액 0 이지만 교환 진행됐음을 통지.
    if (isExchange && exchangeNewOrderId) {
      const phone = order.customerPhone;
      if (phone) {
        const isDiff = exchangeClaimType === "EXCHANGE_DIFFERENT";
        await notify(
          { phone, name: order.customerName ?? undefined },
          {
            kind: "EXCHANGE_DIFFERENT_PAYMENT",
            subject: `[교환 진행] ${order.orderNo}`,
            body: isDiff
              ? `주문 ${order.orderNo} 교환이 접수되었습니다. 차액 결제 안내는 매장에서 별도 연락드리겠습니다.`
              : `주문 ${order.orderNo} 교환이 접수되었습니다. 새 발송 정보는 곧 안내드리겠습니다.`,
            meta: { exchangeNewOrderId, claimType: exchangeClaimType },
          },
          "sms",
        );
      }
    }

    return NextResponse.json(updated);
  }

  // 일반 상태 전이 (ship, complete) — prepare/cancel/return 은 위에서 별도 처리.
  // ship 액션은 trackingCarrier/Number 함께 저장 가능 (UI 의 송장 입력 dialog 와 연동).
  const trackingPatch =
    action === "ship"
      ? {
          ...(typeof body.trackingCarrier === "string"
            ? { trackingCarrier: body.trackingCarrier || null }
            : {}),
          ...(typeof body.trackingNumber === "string"
            ? { trackingNumber: body.trackingNumber || null }
            : {}),
        }
      : {};
  const auditUserShip = await getCurrentUser();
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.order.update({
      where: { id },
      data: {
        status: transition.to as never,
        ...trackingPatch,
        ...(action === "ship" ? { shipmentCount: { increment: 1 } } : {}),
      },
    });
    // ship 액션 (전체 발송) — 모든 OrderItem.shippedQty = quantity 로 set.
    // 부분 출고 후에도 ship 호출하면 잔여까지 모두 발송 처리.
    if (action === "ship") {
      await Promise.all(
        order.items.map((it) =>
          tx.orderItem.update({
            where: { id: it.id },
            data: { shippedQty: it.quantity },
          }),
        ),
      );

      // Shipment 회차 생성 — 잔여 수량 (quantity - shippedQty) 만 ShipmentItem 으로
      const nextShipmentNo = (order.shipmentCount ?? 0) + 1;
      const remaining = order.items
        .map((it) => ({
          orderItemId: it.id,
          remainingQty: Number(it.quantity) - Number(it.shippedQty),
        }))
        .filter((r) => r.remainingQty > 0.0001);

      // 잔여가 0 이어도 (이미 모두 발송됨에도 ship 호출) Shipment 비어있는 회차로 생성하지 않음
      if (remaining.length > 0) {
        const carrierForShipment =
          typeof body.trackingCarrier === "string"
            ? body.trackingCarrier || null
            : (order.trackingCarrier ?? null);
        const trackingForShipment =
          typeof body.trackingNumber === "string"
            ? body.trackingNumber || null
            : (order.trackingNumber ?? null);
        await tx.shipment.create({
          data: {
            orderId: id,
            shipmentNo: nextShipmentNo,
            trackingCarrier: carrierForShipment,
            trackingNumber: trackingForShipment,
            shippedAt: new Date(),
            items: {
              create: remaining.map((r) => ({
                orderItemId: r.orderItemId,
                quantity: r.remainingQty,
              })),
            },
          },
        });
      }
    }
    // complete 액션 — Order 가 COMPLETED 가 되는 시점에 연결된 RepairTicket 도 PICKED_UP 으로 전환.
    // POS IN_STORE 결제 시엔 이미 PICKED_UP 이므로 무시 (READY 상태일 때만 전환). 보증은 이 시점부터 시작.
    if (action === "complete" && order.repairTicketId) {
      const ticket = await tx.repairTicket.findUnique({
        where: { id: order.repairTicketId },
        select: {
          id: true,
          status: true,
          repairWarrantyMonths: true,
        },
      });
      if (ticket && ticket.status !== "PICKED_UP" && ticket.status !== "CANCELLED") {
        const pickupAt = new Date();
        const warrantyEnds =
          ticket.repairWarrantyMonths != null && ticket.repairWarrantyMonths > 0
            ? new Date(
                pickupAt.getFullYear(),
                pickupAt.getMonth() + ticket.repairWarrantyMonths,
                pickupAt.getDate(),
              )
            : null;
        await tx.repairTicket.update({
          where: { id: ticket.id },
          data: {
            status: "PICKED_UP",
            pickedUpAt: pickupAt,
            repairWarrantyEnds: warrantyEnds,
          },
        });
        // Phase 4 세트 학습 — Order 배송/픽업 완료 시점에 연결된 RepairTicket 도 PICKED_UP 진입
        await learnDiagnosisPartSet(tx, ticket.id);
      }
    }
    await recordAudit(tx, {
      userId: auditUserShip?.id ?? null,
      entity: "Order",
      entityId: id,
      action: "STATUS_CHANGE",
      meta: {
        from: order.status,
        to: transition.to,
        action,
        orderNo: order.orderNo,
      },
    });
    return u;
  });

  // Outbound — ship 액션 시 채널에 송장 자동 push (best-effort, 실패해도 ERP 액션 영향 X)
  if (action === "ship" && updated.channelId && updated.channelOrderNo) {
    const carrier = updated.trackingCarrier ?? "";
    const trackingNo = updated.trackingNumber ?? "";
    if (carrier || trackingNo) {
      // 트랜잭션 외부 — 채널 API 호출이 길거나 실패해도 ERP 트랜잭션은 이미 commit
      await dispatchPushTracking(
        prisma,
        {
          orderId: id,
          channelId: updated.channelId,
          channelOrderNo: updated.channelOrderNo,
        },
        carrier,
        trackingNo,
        auditUserShip?.id ?? null,
      );
    }
  }

  // 알림 — 배송완료/픽업완료 시 고객에게 통지 (best-effort)
  if (action === "complete") {
    const phone = updated.recipientPhone || updated.customerPhone;
    if (phone) {
      const isPickup = updated.fulfillmentType === "PICKUP";
      await notify(
        { phone, name: updated.recipientName ?? updated.customerName ?? undefined },
        {
          kind: "ORDER_DELIVERED",
          subject: isPickup ? `[픽업완료] ${updated.orderNo}` : `[배송완료] ${updated.orderNo}`,
          body: isPickup
            ? `주문 ${updated.orderNo} 픽업이 완료되었습니다. 이용해주셔서 감사합니다.`
            : `주문 ${updated.orderNo} 배송이 완료되었습니다. 이용해주셔서 감사합니다.`,
        },
        "sms",
      );
    }
  }

  return NextResponse.json(updated);
}

/**
 * 주문 일반 수정.
 * - 출고 정보(예정일·주소·받는사람·메모·송장 등): PENDING/PREPARING/SHIPPED 에서 가능
 * - 항목 replace (`items`): PENDING 한정. 재고 미차감이라 안전.
 *   배열 전달 시 기존 OrderItem 모두 삭제 후 재생성 + subtotal/tax/total/commission 재계산.
 * 종결 상태(COMPLETED/RETURN_REQUESTED/RETURN_ACCEPTED/CANCELLED/RETURNED/EXCHANGED) 는 잠금.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = orderUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      channelId: true,
      discountAmount: true,
      shippingFee: true,
    },
  });
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
  }
  // PATCH 가능한 상태: PENDING / PREPARING / PREPARING_PACKED / SHIPPED 만 (출고 흐름 진행 중).
  // 그 외는 잠금 — 항목·송장·출고예정 모두 수정 불가.
  const lockedStatuses = [
    "COMPLETED",
    "RETURN_REQUESTED",
    "RETURN_ACCEPTED",
    "RETURN_COLLECTED",
    "RETURN_INSPECTED",
    "CANCELLED",
    "RETURNED",
    "EXCHANGED",
  ];
  if (lockedStatuses.includes(order.status)) {
    return NextResponse.json(
      { error: `${order.status} 상태에서는 수정할 수 없습니다` },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // 항목 편집 가드 — PENDING 한정 (PREPARING 이상은 재고 차감 + LotConsumption 영향)
  if (data.items !== undefined && order.status !== "PENDING") {
    return NextResponse.json(
      {
        error: `${order.status} 상태에서는 항목을 편집할 수 없습니다 — PENDING 에서만 가능`,
      },
      { status: 400 },
    );
  }

  // fulfillmentType=IN_STORE/PICKUP(매장 인도) 로 변경 시 expectedShipDate / shippingAddress / recipient 정리.
  const isPickup =
    data.fulfillmentType === "IN_STORE" || data.fulfillmentType === "PICKUP";

  // 항목 변경 시 금액 재계산 — POST /api/orders 와 동일 로직
  let recalcPatch: Record<string, unknown> = {};
  if (data.items !== undefined) {
    const productIds = data.items
      .map((i) => i.productId)
      .filter((id): id is string => Boolean(id));
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, taxType: true },
        })
      : [];
    const taxTypeById = new Map(products.map((p) => [p.id, p.taxType]));
    const items = data.items.map((item) => {
      const qty = parseFloat(item.quantity);
      const price = parseFloat(item.unitPrice);
      return {
        productId: item.productId,
        quantity: qty,
        unitPrice: price,
        totalPrice: qty * price,
        _taxable: (taxTypeById.get(item.productId ?? "") ?? "TAXABLE") === "TAXABLE",
      };
    });
    const subtotalAmount = items.reduce((sum, i) => sum + i.totalPrice, 0);
    const taxableSubtotal = items
      .filter((i) => i._taxable)
      .reduce((sum, i) => sum + i.totalPrice, 0);
    const discountAmount =
      data.discountAmount !== undefined
        ? parseFloat(data.discountAmount || "0")
        : Number(order.discountAmount);
    const shippingFee =
      data.shippingFee !== undefined
        ? parseFloat(data.shippingFee || "0")
        : Number(order.shippingFee);
    const taxableRatio =
      subtotalAmount > 0 ? taxableSubtotal / subtotalAmount : 0;
    const taxableNet = taxableSubtotal - discountAmount * taxableRatio;
    const taxAmount = Math.round(Math.max(0, taxableNet) * 0.1);
    const totalAmount =
      subtotalAmount - discountAmount + shippingFee + taxAmount;
    // 채널 수수료 재계산 — 항목 합계 변경에 따라
    const channel = order.channelId
      ? await prisma.salesChannel.findUnique({
          where: { id: order.channelId },
          select: { commissionRate: true },
        })
      : null;
    const commissionAmount = channel
      ? Math.round(subtotalAmount * Number(channel.commissionRate))
      : 0;

    recalcPatch = {
      subtotalAmount,
      discountAmount,
      shippingFee,
      taxAmount,
      totalAmount,
      commissionAmount,
      // 기존 OrderItem 모두 삭제 후 재생성 (PENDING 이라 LotConsumption 없음 — 안전)
      items: {
        deleteMany: {},
        create: items.map(({ _taxable, ...it }) => it),
      },
    };
  }

  const updated = await prisma.order.update({
    where: { id },
    data: {
      ...(data.fulfillmentType !== undefined
        ? { fulfillmentType: data.fulfillmentType }
        : {}),
      ...(isPickup
        ? {
            expectedShipDate: null,
            shippingAddress: null,
            recipientName: null,
            recipientPhone: null,
          }
        : {
            ...(data.expectedShipDate !== undefined
              ? {
                  expectedShipDate: data.expectedShipDate
                    ? new Date(data.expectedShipDate)
                    : null,
                }
              : {}),
            ...(data.shippingAddress !== undefined
              ? { shippingAddress: data.shippingAddress || null }
              : {}),
            ...(data.recipientName !== undefined
              ? { recipientName: data.recipientName || null }
              : {}),
            ...(data.recipientPhone !== undefined
              ? { recipientPhone: data.recipientPhone || null }
              : {}),
          }),
      ...(data.channelOrderNo !== undefined
        ? { channelOrderNo: data.channelOrderNo || null }
        : {}),
      ...(data.memo !== undefined ? { memo: data.memo || null } : {}),
      ...(data.trackingCarrier !== undefined
        ? { trackingCarrier: data.trackingCarrier || null }
        : {}),
      ...(data.trackingNumber !== undefined
        ? { trackingNumber: data.trackingNumber || null }
        : {}),
      ...recalcPatch,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id } });

  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
  }

  if (order.status !== "PENDING") {
    return NextResponse.json({ error: "대기 상태의 주문만 삭제할 수 있습니다" }, { status: 400 });
  }

  await prisma.order.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
