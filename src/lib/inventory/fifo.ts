import type { Prisma } from "@prisma/client";

export type FifoConsumption = {
  lotId: string;
  quantity: number;
  unitCost: number;
};

export type FifoResult = {
  consumptions: FifoConsumption[];
  unitCostAvg: number;
};

export async function fifoConsume(
  tx: Prisma.TransactionClient,
  productId: string,
  qty: number,
  displayName: string,
): Promise<FifoResult> {
  const lots = await tx.inventoryLot.findMany({
    where: { productId, remainingQty: { gt: 0 } },
    orderBy: { receivedAt: "asc" },
  });
  const available = lots.reduce((s, l) => s + Number(l.remainingQty), 0);
  if (available < qty) {
    throw new Error(
      `재고 부족 (${displayName}): 필요 ${qty}, 가용 ${available}. 실사보정으로 재고를 맞춘 뒤 다시 시도해주세요.`,
    );
  }
  const consumptions: FifoConsumption[] = [];
  let need = qty;
  let totalCost = 0;
  for (const lot of lots) {
    if (need <= 0) break;
    const take = Math.min(need, Number(lot.remainingQty));
    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: { remainingQty: { decrement: take } },
    });
    consumptions.push({
      lotId: lot.id,
      quantity: take,
      unitCost: Number(lot.unitCost),
    });
    totalCost += take * Number(lot.unitCost);
    need -= take;
  }
  return { consumptions, unitCostAvg: totalCost / qty };
}

/**
 * 벌크 SKU 재고가 부족하면 연결된 판매 SKU의 lot을 FIFO로 따서 벌크 lot에 채운다.
 * Phase 9 — 분할 사용 가능 상품 (엔진오일 4L 병 → 벌크 4000mL 등).
 */
export async function ensureBulkStock(
  tx: Prisma.TransactionClient,
  bulkProductId: string,
  requiredQty: number,
  displayName: string,
): Promise<void> {
  // 대상이 벌크 SKU가 아니면 분할 인프라가 적용되지 않으므로 즉시 종료.
  // (모든 fifoConsume 호출 앞에서 안전하게 호출 가능하도록 가드)
  const target = await tx.product.findUnique({
    where: { id: bulkProductId },
    select: { isBulk: true },
  });
  if (!target?.isBulk) return;

  const bulkInv = await tx.inventory.findUnique({
    where: { productId: bulkProductId },
    select: { quantity: true },
  });
  const current = bulkInv ? Number(bulkInv.quantity) : 0;
  if (current >= requiredQty) return;

  let shortage = requiredQty - current;

  const candidateLots = await tx.inventoryLot.findMany({
    where: {
      remainingQty: { gt: 0 },
      product: { bulkProductId, isBulk: false, containerSize: { gt: 0 } },
    },
    orderBy: { receivedAt: "asc" },
    include: {
      product: {
        select: { id: true, name: true, containerSize: true },
      },
    },
  });

  for (const lot of candidateLots) {
    if (shortage <= 0) break;
    const salesProduct = lot.product;
    if (!salesProduct) continue;
    const containerSize = Number(salesProduct.containerSize ?? 0);
    if (containerSize <= 0) continue;
    const bottlesNeeded = Math.ceil(shortage / containerSize);
    const bottlesToOpen = Math.min(bottlesNeeded, Number(lot.remainingQty));
    if (bottlesToOpen <= 0) continue;
    const addedQty = bottlesToOpen * containerSize;
    const bulkUnitCost = Number(lot.unitCost) / containerSize;

    // 1. 판매 SKU lot/Inventory 차감
    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: { remainingQty: { decrement: bottlesToOpen } },
    });
    const salesInv = await tx.inventory.update({
      where: { productId: salesProduct.id },
      data: { quantity: { decrement: bottlesToOpen } },
      select: { id: true, quantity: true },
    });
    await tx.inventoryMovement.create({
      data: {
        inventoryId: salesInv.id,
        type: "BOTTLE_OPEN_OUT",
        quantity: -bottlesToOpen,
        balanceAfter: salesInv.quantity,
        memo: `병 따기 → ${displayName}`,
      },
    });

    // 2. 벌크 SKU lot 생성 + Inventory 증가
    await tx.inventoryLot.create({
      data: {
        productId: bulkProductId,
        receivedQty: addedQty,
        remainingQty: addedQty,
        unitCost: bulkUnitCost,
        source: "ADJUSTMENT",
        receivedAt: new Date(),
      },
    });
    const bulkInvUpdated = await tx.inventory.upsert({
      where: { productId: bulkProductId },
      update: { quantity: { increment: addedQty } },
      create: { productId: bulkProductId, quantity: addedQty, safetyStock: 0 },
      select: { id: true, quantity: true },
    });
    await tx.inventoryMovement.create({
      data: {
        inventoryId: bulkInvUpdated.id,
        type: "BOTTLE_OPEN_IN",
        quantity: addedQty,
        balanceAfter: bulkInvUpdated.quantity,
        memo: `${salesProduct.name} 1개 따기`,
      },
    });

    shortage -= addedQty;
  }

  if (shortage > 0) {
    throw new Error(
      `벌크 재고 부족 (${displayName}): ${shortage} 부족. 판매 SKU 입고 후 재시도해주세요.`,
    );
  }
}
