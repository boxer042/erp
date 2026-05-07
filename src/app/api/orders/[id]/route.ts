import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeSellingCostPerUnit } from "@/lib/selling-cost";
import { fifoConsume, ensureBulkStock } from "@/lib/inventory/fifo";
import { orderUpdateSchema } from "@/lib/validators/order";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  dispatchAcceptReturn,
  dispatchPushTracking,
  dispatchRejectReturn,
} from "@/lib/channels/outbound";

/**
 * 교환 새 주문번호 — 원본 주문번호 뒤에 -EX 접미사. 사용자가 한눈에 교환 새 주문임을 인지.
 * 충돌 가능성 낮음 (원본은 ORD[YYMMDD]-[4자리], 교환은 그 뒤 -EX 추가).
 */
function generateExchangeOrderNo(originalOrderNo: string): string {
  return `${originalOrderNo}-EX`;
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
              setComponents: {
                include: { component: { select: { id: true, name: true } } },
              },
              variants: {
                select: {
                  id: true, name: true, sku: true,
                  inventory: { select: { quantity: true } },
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

  // 주문 확정(prepare) 가드: 대표 상품(canonical)이 그대로 있으면 차단 — 변형 확정 후 재시도
  if (action === "prepare") {
    const unresolved = order.items.filter(
      (i) => i.product && i.product.isCanonical,
    );
    if (unresolved.length > 0) {
      return NextResponse.json(
        {
          error: `다음 항목의 변형이 확정되지 않았습니다: ${unresolved
            .map((i) => i.product?.name ?? "")
            .join(", ")}. 출고 준비 단계에서 변형을 선택해주세요.`,
        },
        { status: 400 },
      );
    }
  }

  /**
   * 출고 흐름: PENDING → PREPARING → SHIPPED → COMPLETED.
   *
   * 반품 흐름 (3단계 — 손님 요청 / 매장 결정 / 회수·종결):
   *   COMPLETED →(request_return)→ RETURN_REQUESTED  (손님 요청, 매장 미확인)
   *   RETURN_REQUESTED →(accept_return)→ RETURN_ACCEPTED  (회수 대기)
   *   RETURN_REQUESTED →(reject_return)→ COMPLETED  (반려)
   *   RETURN_REQUESTED →(cancel_return_request)→ COMPLETED  (손님이 요청 취소)
   *   RETURN_ACCEPTED →(return)→ RETURNED  (회수 완료 + 재고 복원 + 환불)
   *   RETURN_ACCEPTED →(exchange)→ EXCHANGED  (회수 완료 + 재고 복원, 차액은 새 주문)
   *
   * 즉시 반품 (1단계, 매장에서 손님이 즉석 처리):
   *   COMPLETED →(return)→ RETURNED
   *
   * 취소: PENDING/PREPARING →(cancel)→ CANCELLED
   *
   * 부수효과:
   *   - 재고 복원: cancel(PREPARING이상)/return/exchange 에서 (PENDING은 미차감이라 X)
   *   - paymentStatus: cancel/return 시 PAID였으면 REFUNDED. exchange 는 새 주문에서 정산하므로 PAID 유지.
   */
  const statusTransitions: Record<
    string,
    { from: string | string[]; to: string }
  > = {
    prepare: { from: "PENDING", to: "PREPARING" },
    ship: { from: "PREPARING", to: "SHIPPED" },
    complete: { from: "SHIPPED", to: "COMPLETED" },
    cancel: { from: ["PENDING", "PREPARING"], to: "CANCELLED" },
    request_return: { from: "COMPLETED", to: "RETURN_REQUESTED" },
    accept_return: { from: "RETURN_REQUESTED", to: "RETURN_ACCEPTED" },
    reject_return: { from: "RETURN_REQUESTED", to: "COMPLETED" },
    cancel_return_request: { from: "RETURN_REQUESTED", to: "COMPLETED" },
    return: {
      from: ["COMPLETED", "RETURN_REQUESTED", "RETURN_ACCEPTED"],
      to: "RETURNED",
    },
    exchange: { from: "RETURN_ACCEPTED", to: "EXCHANGED" },
  };

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

      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id }, data: { status: "PREPARING" } });

        // FIFO 로트 소진 + orderItemId로 LotConsumption 생성
        const fifoForOrderItem = async (
          productId: string,
          orderItemId: string,
          qty: number,
          displayName: string,
        ) => {
          await ensureBulkStock(tx, productId, qty, displayName);
          const { consumptions, unitCostAvg } = await fifoConsume(
            tx,
            productId,
            qty,
            displayName,
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
            const finishedAvailable = finishedInv
              ? Math.min(orderQty, Number(finishedInv.quantity))
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

    return NextResponse.json(updated);
  }

  // === 취소/반품/교환 시 재고 복원 + 결제 상태 전이 ===
  // PENDING 은 재고 차감 안 된 상태이므로 그냥 상태만 변경.
  // PREPARING 이상은 차감됐으므로 LotConsumption 복원 + Inventory 복원.
  // exchange: 재고 복원 + paymentStatus 유지 + 새 주문 자동 생성 (교환 발송용).
  if (action === "cancel" || action === "return" || action === "exchange") {
    const wasStockDeducted = order.status !== "PENDING";
    const wasPaid = order.paymentStatus === "PAID";
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
            taxAmount: exchangeSame ? Number(order.taxAmount) : 0,
            totalAmount: exchangeSame ? Number(order.totalAmount) : 0,
            commissionAmount: 0,
            memo: `교환 발송 — 원본 ${order.orderNo}${exchangeSame ? " (같은 상품)" : " (다른 상품 — 항목·차액 직접 편집)"}`,
            createdById: auditUser?.id ?? order.createdById,
            items:
              cloneItems.length > 0
                ? { create: cloneItems }
                : undefined,
          },
        });
        exchangeNewOrderId = newOrder.id;
      }

      await tx.order.update({
        where: { id },
        data: {
          status: targetStatus,
          // 환불 처리: cancel/return 만. exchange 는 새 주문에서 정산하므로 paymentStatus 유지.
          ...(!isExchange && wasPaid
            ? { paymentStatus: "REFUNDED" as const }
            : {}),
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
          refunded: !isExchange && wasPaid,
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
      data: { status: transition.to as never, ...trackingPatch },
    });
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
  if (
    order.status === "COMPLETED" ||
    order.status === "RETURN_REQUESTED" ||
    order.status === "RETURN_ACCEPTED" ||
    order.status === "CANCELLED" ||
    order.status === "RETURNED" ||
    order.status === "EXCHANGED"
  ) {
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

  // fulfillmentType=PICKUP 으로 변경 시 expectedShipDate / shippingAddress / recipient 정리.
  const isPickup = data.fulfillmentType === "PICKUP";

  // 항목 변경 시 금액 재계산 — POST /api/orders 와 동일 로직
  let recalcPatch: Record<string, unknown> = {};
  if (data.items !== undefined) {
    const productIds = data.items.map((i) => i.productId).filter(Boolean);
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
        _taxable: (taxTypeById.get(item.productId) ?? "TAXABLE") === "TAXABLE",
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
