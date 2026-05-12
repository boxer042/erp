import type { Prisma } from "@prisma/client";

/**
 * 이 입고로 인해 만들어진 SupplierProductPriceHistory 행들을 처리하고
 * 가능한 경우 SP.unitPrice/listPrice 를 입고 직전 값으로 원복한다.
 *
 * - 이 입고 history 가 SP 의 마지막 변경이면 → unitPrice/listPrice 원복 + history 삭제
 * - 이 입고 이후 다른 입고가 또 갱신했으면 → 가격은 그대로, history 행만 삭제
 * - listPrice 의 oldListPrice 는 schema 에 직접 컬럼이 없으므로 같은 SP 의 이 입고 직전 history.originalPrice 로 추론
 *   추론 불가능한 경우(첫 history) listPrice 는 그대로 둠
 */
export async function restorePriceHistoryForIncoming(
  tx: Prisma.TransactionClient,
  incomingId: string
): Promise<void> {
  const histories = await tx.supplierProductPriceHistory.findMany({
    where: { incomingId },
    select: {
      id: true,
      supplierProductId: true,
      oldPrice: true,
      originalPrice: true,
      createdAt: true,
    },
  });

  if (histories.length === 0) return;

  // SP 별로 그룹화 — 같은 SP 의 history 가 여러 건일 수도 있어 그중 가장 오래된 것을 기준점으로 사용
  type H = (typeof histories)[number];
  const groupsBySpId = new Map<string, H[]>();
  for (const h of histories) {
    if (!groupsBySpId.has(h.supplierProductId)) groupsBySpId.set(h.supplierProductId, []);
    groupsBySpId.get(h.supplierProductId)!.push(h);
  }

  for (const [spId, rows] of groupsBySpId) {
    // SP 의 모든 history 시간순 정렬
    const allHistory = await tx.supplierProductPriceHistory.findMany({
      where: { supplierProductId: spId },
      orderBy: { createdAt: "asc" },
      select: { id: true, oldPrice: true, originalPrice: true, createdAt: true, incomingId: true },
    });

    const ownIds = new Set(rows.map((r) => r.id));
    const ownHistory = allHistory.filter((h) => ownIds.has(h.id));
    const laterByOther = allHistory.find(
      (h) => !ownIds.has(h.id) && h.createdAt > ownHistory[ownHistory.length - 1].createdAt
    );

    if (!laterByOther) {
      // 이 입고가 마지막 변경 — 가격 원복
      const oldestOwn = ownHistory[0];
      const priorHistory = allHistory.find((h) => !ownIds.has(h.id) && h.createdAt < oldestOwn.createdAt);
      // 그룹 내에서 가장 이전의 oldPrice 가 진짜 oldPrice (그룹 내 newPrice 의 연쇄 변경 가능성)
      const restoreUnitPrice = Number(oldestOwn.oldPrice);
      // listPrice 원복: 직전 history.originalPrice 가 있으면 그것으로 추론
      const restoreListPrice = priorHistory?.originalPrice != null ? Number(priorHistory.originalPrice) : null;

      await tx.supplierProduct.update({
        where: { id: spId },
        data: {
          unitPrice: restoreUnitPrice,
          ...(restoreListPrice !== null ? { listPrice: restoreListPrice } : {}),
        },
      });
    }
    // history 행 삭제 (두 경우 모두)
    await tx.supplierProductPriceHistory.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
  }
}

/**
 * autoMapped=true Product 가 다른 곳에서 참조되지 않으면 hard delete.
 * Inventory 행도 함께 삭제. InventoryMovement 가 남아있으면 삭제 못 함 (안전 보장).
 */
export async function cleanupOrphanedAutoProduct(
  tx: Prisma.TransactionClient,
  productId: string
): Promise<boolean> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { autoMapped: true },
  });
  if (!product || !product.autoMapped) return false;

  // 모든 참조 카운트 일괄 조회
  const [
    mappingCnt,
    lotCnt,
    orderItemCnt,
    repairPartCnt,
    repairPackagePartCnt,
    channelPricingCnt,
    mediaCnt,
    specValueCnt,
    setParentCnt,
    setChildCnt,
  ] = await Promise.all([
    tx.productMapping.count({ where: { productId } }),
    tx.inventoryLot.count({ where: { productId } }),
    tx.orderItem.count({ where: { productId } }),
    tx.repairPart.count({ where: { productId } }),
    tx.repairPackagePart.count({ where: { productId } }),
    tx.channelPricing.count({ where: { productId } }),
    tx.productMedia.count({ where: { productId } }),
    tx.productSpecValue.count({ where: { productId } }),
    tx.setComponent.count({ where: { setProductId: productId } }),
    tx.setComponent.count({ where: { componentId: productId } }),
  ]);

  if (
    mappingCnt > 0 ||
    lotCnt > 0 ||
    orderItemCnt > 0 ||
    repairPartCnt > 0 ||
    repairPackagePartCnt > 0 ||
    channelPricingCnt > 0 ||
    mediaCnt > 0 ||
    specValueCnt > 0 ||
    setParentCnt > 0 ||
    setChildCnt > 0
  ) {
    return false;
  }

  // Inventory + Movement 정리 (Movement 가 남아있으면 Inventory 삭제 못 함 → 검사 후 막음)
  const inventory = await tx.inventory.findUnique({
    where: { productId },
    select: { id: true, _count: { select: { movements: true } } },
  });
  if (inventory) {
    if (inventory._count.movements > 0) return false;
    await tx.inventory.delete({ where: { id: inventory.id } });
  }

  await tx.product.delete({ where: { id: productId } });
  return true;
}

/**
 * SupplierProduct 가 다른 곳에서 참조되지 않으면 hard delete.
 * SP 삭제 시 cascade 로 mappings / incomingCosts / priceHistory 자동 삭제됨.
 * 매핑이 가리키던 autoMapped Product 들은 SP 삭제 후 cleanupOrphanedAutoProduct 로 정리 시도.
 */
export async function cleanupOrphanedSupplierProduct(
  tx: Prisma.TransactionClient,
  supplierProductId: string
): Promise<boolean> {
  const [
    incomingItemCnt,
    returnItemCnt,
    quotationItemCnt,
    poItemCnt,
    lotCnt,
  ] = await Promise.all([
    tx.incomingItem.count({ where: { supplierProductId } }),
    tx.supplierReturnItem.count({ where: { supplierProductId } }),
    tx.quotationItem.count({ where: { supplierProductId } }),
    tx.purchaseOrderItem.count({ where: { supplierProductId } }),
    tx.inventoryLot.count({ where: { supplierProductId } }),
  ]);

  if (incomingItemCnt > 0 || returnItemCnt > 0 || quotationItemCnt > 0 || poItemCnt > 0 || lotCnt > 0) {
    return false;
  }

  // SP 가 매핑한 자동 Product 들 식별 (SP delete 전에 미리 저장 — cascade 로 매핑이 사라지므로)
  const mappedProductIds = (
    await tx.productMapping.findMany({
      where: { supplierProductId },
      select: { productId: true },
    })
  ).map((m) => m.productId);

  await tx.supplierProduct.delete({ where: { id: supplierProductId } });

  // 매핑 cascade 삭제 후 자동 Product 들 정리 시도
  for (const productId of mappedProductIds) {
    await cleanupOrphanedAutoProduct(tx, productId);
  }

  return true;
}
