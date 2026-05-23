import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type FifoConsumption = {
  lotId: string;
  quantity: number;
  unitCost: number;
};

export type FifoResult = {
  consumptions: FifoConsumption[];
  unitCostAvg: number;
};

/**
 * 회사 설정 "재고 부족 판매 허용"(CompanyInfo.allowNegativeStock) 조회.
 * 설정 row 가 없으면 기본 ON (true). 트랜잭션 시작 전에 1회 호출해 결과를 fifoConsume 에 전달.
 */
export async function isOversellAllowed(): Promise<boolean> {
  const c = await prisma.companyInfo.findUnique({
    where: { id: "singleton" },
    select: { allowNegativeStock: true },
  });
  return c?.allowNegativeStock ?? true;
}

/**
 * 재고 부족분(소진할 로트가 없는 수량)의 추정 원가.
 * 1순위: 가장 최근 입고 로트 단가 → 2순위: 거래처 매입단가(매핑 환산) → 없으면 0.
 */
export async function estimateUnitCost(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<number> {
  const lastLot = await tx.inventoryLot.findFirst({
    where: { productId },
    orderBy: { receivedAt: "desc" },
    select: { unitCost: true },
  });
  if (lastLot) return Number(lastLot.unitCost);

  const mapping = await tx.productMapping.findFirst({
    where: { productId },
    orderBy: { createdAt: "desc" },
    select: {
      conversionRate: true,
      supplierProduct: { select: { unitPrice: true } },
    },
  });
  if (mapping) {
    const rate = Number(mapping.conversionRate) || 1;
    return Number(mapping.supplierProduct.unitPrice) / rate;
  }
  return 0;
}

export async function fifoConsume(
  tx: Prisma.TransactionClient,
  productId: string,
  qty: number,
  displayName: string,
  allowOversell = false,
): Promise<FifoResult> {
  const lots = await tx.inventoryLot.findMany({
    where: { productId, remainingQty: { gt: 0 } },
    orderBy: { receivedAt: "asc" },
  });
  const available = lots.reduce((s, l) => s + Number(l.remainingQty), 0);
  if (available < qty && !allowOversell) {
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
  // 재고 부족분 — 음수 재고 허용 시 적자(deficit) 로트를 만들어 소진.
  // 로트는 remainingQty 가 음수가 되어 (받은 적 없는 재고를 판 표시),
  // Inventory.quantity 와 Σ remainingQty 가 함께 음수로 정합. 추후 재고조정으로 정산.
  if (need > 0) {
    const estCost = await estimateUnitCost(tx, productId);
    const deficitLot = await tx.inventoryLot.create({
      data: {
        productId,
        receivedQty: 0,
        remainingQty: 0,
        unitCost: estCost,
        source: "ADJUSTMENT",
        receivedAt: new Date(),
      },
    });
    await tx.inventoryLot.update({
      where: { id: deficitLot.id },
      data: { remainingQty: { decrement: need } },
    });
    consumptions.push({ lotId: deficitLot.id, quantity: need, unitCost: estCost });
    totalCost += need * estCost;
    need = 0;
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
  allowOversell = false,
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

  if (shortage > 0 && !allowOversell) {
    throw new Error(
      `벌크 재고 부족 (${displayName}): ${shortage} 부족. 판매 SKU 입고 후 재시도해주세요.`,
    );
  }
  // allowOversell 이면 남은 부족분은 막지 않음 — 이어지는 fifoConsume 이 적자 로트로 처리한다.
}
