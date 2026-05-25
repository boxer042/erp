import type { Prisma, PrismaClient, SellingCost } from "@prisma/client";
import {
  ensureBulkStock,
  fifoConsume,
  isOversellAllowed,
} from "@/lib/inventory/fifo";
import { computeSellingCostPerUnit } from "@/lib/selling-cost";

/** computeSellingCostPerUnit 가 받는 shape — Prisma SellingCost 의 일부 필드 */
type SellingCostLite = Pick<SellingCost, "costType" | "value" | "isTaxable">;

type Tx = Prisma.TransactionClient;
type PrismaLike = Pick<PrismaClient, "cardFeeRate" | "sellingCost">;

/**
 * 주문 라인 재고 차감 + 라인 스냅샷에 필요한 옵션 사전 조회.
 * 트랜잭션 외부에서 한 번 호출해 옵션을 만들고, 그 옵션을 consumeStockForOrder 에 전달.
 *
 * 책임:
 *  - channelCommRate: 채널 수수료율 (오프라인이면 0)
 *  - cardFeeRateSnapshot: 오프라인일 때만 — 현재 카드 수수료율 스냅샷
 *  - sellingCostsByProduct: 라인별 판매비 일괄 조회 (N+1 방지)
 *  - allowOversell: 음수 재고 허용 여부 (CompanyInfo 설정)
 */
export async function prepareConsumeOptions(
  prisma: PrismaLike,
  order: {
    channelId: string | null;
    channel: { commissionRate: Prisma.Decimal | string | number } | null;
    items: Array<{ product: { id: string } | null }>;
  },
): Promise<ConsumeOptions> {
  const channelCommRate = order.channel ? Number(order.channel.commissionRate) : 0;
  const isOffline = order.channelId == null;
  const currentCardFee = isOffline
    ? await prisma.cardFeeRate.findFirst({
        where: { appliedFrom: { lte: new Date() } },
        orderBy: { appliedFrom: "desc" },
      })
    : null;
  const cardFeeRateSnapshot = currentCardFee ? Number(currentCardFee.rate) : null;

  const productIds = Array.from(
    new Set(
      order.items
        .map((i) => i.product?.id)
        .filter((p): p is string => !!p),
    ),
  );
  const allSellingCosts =
    productIds.length > 0
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

  return {
    channelCommRate,
    cardFeeRateSnapshot,
    sellingCostsByProduct,
    allowOversell,
  };
}

export interface ConsumeOptions {
  channelCommRate: number;
  cardFeeRateSnapshot: number | null;
  sellingCostsByProduct: Map<string, SellingCostLite[]>;
  allowOversell: boolean;
}

/**
 * 주문 라인 재고 차감 + 라인 스냅샷 채우기 — 트랜잭션 내부 호출.
 *
 * 사용처:
 *  - /api/orders POST IN_STORE (즉시 종결 + 재고 차감)
 *  - /api/orders/[id] PUT prepare (PENDING → PREPARING)
 *
 * 책임:
 *  - 각 OrderItem(productId 있음) 에 대해 FIFO 로 InventoryLot 소진
 *  - Inventory.quantity 차감 + InventoryMovement OUTGOING/SET_CONSUME 생성
 *  - LotConsumption 생성 (마진 리포트용)
 *  - OrderItem.unitCostSnapshot/channelCommissionRateSnapshot/cardFeeRateSnapshot/sellingCostSnapshot 업데이트
 *  - 조립상품(isSet): 완제품 로트 우선 소진, 부족분만 구성품 즉시 소비
 */
export async function consumeStockForOrder(
  tx: Tx,
  order: {
    id: string;
    orderNo: string;
    items: Array<{
      id: string;
      quantity: Prisma.Decimal | string | number;
      unitPrice: Prisma.Decimal | string | number;
      product: {
        id: string;
        name: string;
        isSet: boolean;
        setComponents: Array<{
          componentId: string;
          quantity: Prisma.Decimal | string | number;
          component: { name: string };
        }>;
      } | null;
    }>;
  },
  options: ConsumeOptions,
): Promise<void> {
  const {
    channelCommRate,
    cardFeeRateSnapshot,
    sellingCostsByProduct,
    allowOversell,
  } = options;

  // FIFO 로트 소진 + orderItemId 로 LotConsumption 생성 (헬퍼 내부 재사용)
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
    if (!item.product) continue; // 서비스 라인 — 재고 소진 스킵
    let unitCostSnapshot: number | null = null;

    if (item.product.isSet && item.product.setComponents.length > 0) {
      // 조립상품: 완제품 로트 우선 차감, 부족분만 구성품 즉시 소비
      const orderQty = Number(item.quantity);
      const finishedInv = await tx.inventory.findUnique({
        where: { productId: item.product.id },
      });
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

    // 판매비용 스냅샷 — 호출자가 미리 일괄 조회한 결과 사용
    const sellingCosts = sellingCostsByProduct.get(item.product.id) ?? [];
    const sellingCostSnapshot = computeSellingCostPerUnit(
      sellingCosts,
      Number(item.unitPrice),
    );

    if (unitCostSnapshot == null) {
      console.warn(
        `[consume-stock] unitCostSnapshot 누락: orderItemId=${item.id}, productId=${item.product?.id}. ` +
          `LotConsumption 도 없을 가능성 → 마진 리포트 부정확.`,
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
}
