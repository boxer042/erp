import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { computeMovingAverage } from "@/lib/cost";

type AutoProductInput = {
  name: string;
  spec?: string | null;
  unitOfMeasure: string;
};

export async function createAutoMappedProductForSupplierProduct(
  tx: Prisma.TransactionClient,
  sp: AutoProductInput,
): Promise<{ productId: string; sku: string }> {
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    const sku = `AUTO-${randomBytes(4).toString("hex").toUpperCase()}`;
    try {
      // 자동 매핑 상품은 가격을 생성하지 않는다 — listPrice/sellingPrice 둘 다 0 (default).
      // 운영자가 [검토 완료] 단계에서 직접 가격을 입력한다.
      const p = await tx.product.create({
        data: {
          name: sp.name,
          spec: sp.spec || null,
          sku,
          unitOfMeasure: sp.unitOfMeasure,
          autoMapped: true,
        },
        select: { id: true },
      });
      return { productId: p.id, sku };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("createAutoMappedProductForSupplierProduct failed");
}

export async function reconcileOrphanLotsForMapping(
  tx: Prisma.TransactionClient,
  args: {
    supplierProductId: string;
    productId: string;
    conversionRate: number;
    referenceId: string;
  },
): Promise<{ orphansAbsorbed: number }> {
  const { supplierProductId, productId, conversionRate: rate, referenceId } = args;

  const orphans = await tx.inventoryLot.findMany({
    where: { supplierProductId, productId: null },
  });
  if (orphans.length === 0) return { orphansAbsorbed: 0 };

  let totalAddQty = 0;
  let totalAddValue = 0;

  for (const lot of orphans) {
    const newReceivedQty = Number(lot.receivedQty) * rate;
    const newRemainingQty = Number(lot.remainingQty) * rate;
    const newUnitCost = Number(lot.unitCost) / rate;

    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: {
        productId,
        receivedQty: newReceivedQty,
        remainingQty: newRemainingQty,
        unitCost: newUnitCost,
      },
    });

    totalAddQty += newRemainingQty;
    totalAddValue += newRemainingQty * newUnitCost;
  }

  if (totalAddQty > 0) {
    const existing = await tx.inventory.findUnique({ where: { productId } });
    const prevQty = existing ? Number(existing.quantity) : 0;
    const prevAvgCost = existing?.avgCost != null ? Number(existing.avgCost) : null;
    const addAvgUnitCost = totalAddValue / totalAddQty;
    const newAvgCost = computeMovingAverage(prevQty, prevAvgCost, totalAddQty, addAvgUnitCost);

    const inventory = await tx.inventory.upsert({
      where: { productId },
      update: {
        quantity: { increment: totalAddQty },
        avgCost: newAvgCost,
        avgCostUpdatedAt: new Date(),
      },
      create: {
        productId,
        quantity: totalAddQty,
        avgCost: newAvgCost,
        avgCostUpdatedAt: new Date(),
      },
    });

    await tx.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        type: "INCOMING",
        quantity: totalAddQty,
        balanceAfter: inventory.quantity,
        referenceId,
        referenceType: "MAPPING_BACKFILL",
        memo: `미매핑 로트 ${orphans.length}건 소급 반영`,
      },
    });
  }

  return { orphansAbsorbed: orphans.length };
}

/**
 * 매핑이 없는 SP들을 식별해 자동 Product+Mapping을 만들고 오르판 lot까지 흡수.
 * 입고 확정 안전망 / 백필에서 재사용.
 */
export async function ensureMappingForSupplierProducts(
  tx: Prisma.TransactionClient,
  supplierProductIds: string[],
): Promise<{ created: number }> {
  const ids = Array.from(new Set(supplierProductIds.filter(Boolean)));
  if (ids.length === 0) return { created: 0 };

  const existing = await tx.productMapping.findMany({
    where: { supplierProductId: { in: ids } },
    select: { supplierProductId: true },
  });
  const mappedSet = new Set(existing.map((m) => m.supplierProductId));
  const unmapped = ids.filter((id) => !mappedSet.has(id));
  if (unmapped.length === 0) return { created: 0 };

  const sps = await tx.supplierProduct.findMany({
    where: { id: { in: unmapped } },
    select: { id: true, name: true, spec: true, unitOfMeasure: true },
  });

  let created = 0;
  for (const sp of sps) {
    const { productId } = await createAutoMappedProductForSupplierProduct(tx, sp);
    const mapping = await tx.productMapping.create({
      data: { supplierProductId: sp.id, productId, conversionRate: 1 },
      select: { id: true },
    });
    await reconcileOrphanLotsForMapping(tx, {
      supplierProductId: sp.id,
      productId,
      conversionRate: 1,
      referenceId: mapping.id,
    });
    created++;
  }

  return { created };
}
