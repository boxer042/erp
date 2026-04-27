import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeSellingCostPerUnit } from "@/lib/selling-cost";
import { fifoConsume, ensureBulkStock } from "@/lib/inventory/fifo";

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

  // 주문 확정 가드: 대표 상품(canonical)이 그대로 있으면 차단 — 변형 확정 후 재시도
  if (action === "confirm") {
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

  const statusTransitions: Record<string, { from: string; to: string }> = {
    confirm: { from: "PENDING", to: "CONFIRMED" },
    prepare: { from: "CONFIRMED", to: "PREPARING" },
    ship: { from: "PREPARING", to: "SHIPPED" },
    deliver: { from: "SHIPPED", to: "DELIVERED" },
    cancel: { from: "PENDING", to: "CANCELLED" },
    return: { from: "DELIVERED", to: "RETURNED" },
  };

  const transition = statusTransitions[action];
  if (!transition) {
    return NextResponse.json({ error: "유효하지 않은 액션입니다" }, { status: 400 });
  }

  // cancel은 PENDING, CONFIRMED에서 가능
  if (action === "cancel" && !["PENDING", "CONFIRMED"].includes(order.status)) {
    return NextResponse.json({ error: "취소할 수 없는 상태입니다" }, { status: 400 });
  } else if (action !== "cancel" && order.status !== transition.from) {
    return NextResponse.json(
      { error: `현재 상태(${order.status})에서 ${action}할 수 없습니다` },
      { status: 400 }
    );
  }

  // === 확인 시 재고 차감 + cost snapshot ===
  if (action === "confirm") {
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
        await tx.order.update({ where: { id }, data: { status: "CONFIRMED" } });

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

  // === 취소/반품 시 재고 복원 ===
  // avgCost 정책: 옵션 1(보수적) — quantity만 복원, avgCost는 그대로.
  // 출고는 이동평균을 변경하지 않으므로, 그 출고를 되돌리는 것도 마찬가지로 변경 없음.
  // 반품 상품의 재판매 가능성 검수는 별도 운영 단계 (필요 시 ADJUSTMENT_MINUS로 폐기 처리).
  if (action === "cancel" || action === "return") {
    const wasConfirmed = order.status !== "PENDING"; // PENDING이면 재고 차감 안 됨
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: { status: action === "cancel" ? "CANCELLED" : "RETURNED" },
      });

      if (wasConfirmed) {
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
              memo: `주문 ${order.orderNo} ${action === "cancel" ? "취소" : "반품"} 복원`,
            },
          });
        }
      }
    });

    const updated = await prisma.order.findUnique({ where: { id } });
    return NextResponse.json(updated);
  }

  // 일반 상태 전이 (prepare, ship, deliver)
  const updated = await prisma.order.update({
    where: { id },
    data: { status: transition.to as never },
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
