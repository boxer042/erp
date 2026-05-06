/**
 * 발주 시드 [테스트] 데이터 + 모든 부수 효과 안전 정리.
 *
 * 정리 대상:
 *   - PurchaseOrder + PurchaseOrderItem (memo 가 [테스트] 로 시작)
 *   - 그 발주에 연결된 Incoming + IncomingItem
 *   - 입고에서 파생된 InventoryLot (LotConsumption 도 함께)
 *   - 입고에서 파생된 InventoryMovement (referenceType=INCOMING)
 *   - 입고에서 파생된 SupplierLedger (referenceType=INCOMING)
 *   - 입고에서 파생된 Expense (referenceType=INCOMING)
 *   - 영향받은 Inventory.quantity 재계산 (남은 lot 합계)
 *
 * 실행: npx tsx scripts/cleanup-purchase-order-test.ts
 */

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  console.log("\n=== [테스트] 발주 데이터 정리 ===\n");

  const pos = await prisma.purchaseOrder.findMany({
    where: { memo: { startsWith: "[테스트]" } },
    select: {
      id: true,
      poNo: true,
      incomings: {
        select: {
          id: true,
          incomingNo: true,
          status: true,
          items: { select: { id: true } },
        },
      },
    },
  });

  if (pos.length === 0) {
    console.log("정리할 [테스트] 발주 없음");
    return;
  }

  const incomingIds = pos.flatMap((p) => p.incomings.map((i) => i.id));
  const incomingItemIds = pos.flatMap((p) => p.incomings.flatMap((i) => i.items.map((it) => it.id)));

  // 1. InventoryLot — 그 입고에서 생성된 lot
  const lots = await prisma.inventoryLot.findMany({
    where: { incomingItemId: { in: incomingItemIds } },
    select: { id: true, productId: true, supplierProductId: true },
  });
  if (lots.length > 0) {
    // LotConsumption 먼저
    await prisma.lotConsumption.deleteMany({
      where: { lotId: { in: lots.map((l) => l.id) } },
    });
    await prisma.inventoryLot.deleteMany({ where: { id: { in: lots.map((l) => l.id) } } });
    console.log(`InventoryLot ${lots.length}건 삭제 (LotConsumption 동반)`);
  }

  // 2. InventoryMovement — referenceType=INCOMING, referenceId=incomingId
  const movements = await prisma.inventoryMovement.deleteMany({
    where: {
      referenceType: "INCOMING",
      referenceId: { in: incomingIds },
    },
  });
  if (movements.count > 0) console.log(`InventoryMovement ${movements.count}건 삭제`);

  // 3. SupplierLedger — referenceType=INCOMING
  const ledgers = await prisma.supplierLedger.deleteMany({
    where: {
      referenceType: "INCOMING",
      referenceId: { in: incomingIds },
    },
  });
  if (ledgers.count > 0) console.log(`SupplierLedger ${ledgers.count}건 삭제`);

  // 4. Expense — referenceType=INCOMING (택배비 자동 기록)
  const expenses = await prisma.expense.deleteMany({
    where: {
      referenceType: "INCOMING",
      referenceId: { in: incomingIds },
    },
  });
  if (expenses.count > 0) console.log(`Expense ${expenses.count}건 삭제`);

  // 5. Incoming 삭제 (IncomingItem cascade)
  const incomings = await prisma.incoming.deleteMany({ where: { id: { in: incomingIds } } });
  console.log(`Incoming ${incomings.count}건 삭제`);

  // 6. PurchaseOrder 삭제 (PurchaseOrderItem cascade)
  const poDel = await prisma.purchaseOrder.deleteMany({
    where: { id: { in: pos.map((p) => p.id) } },
  });
  console.log(`PurchaseOrder ${poDel.count}건 삭제`);

  // 7. 영향받은 상품의 Inventory.quantity 재계산 (lot 변동이 있었던 경우만)
  const affectedProductIds = Array.from(
    new Set(lots.map((l) => l.productId).filter((id): id is string => !!id))
  );
  if (affectedProductIds.length > 0) {
    for (const pid of affectedProductIds) {
      const agg = await prisma.inventoryLot.aggregate({
        where: { productId: pid },
        _sum: { remainingQty: true },
      });
      const total = Number(agg._sum.remainingQty ?? 0);
      await prisma.inventory.update({
        where: { productId: pid },
        data: { quantity: total },
      });
    }
    console.log(`Inventory ${affectedProductIds.length}개 상품 quantity 재계산`);
  }

  console.log("\n정리 완료.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
