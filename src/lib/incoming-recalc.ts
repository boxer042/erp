import type { Prisma, PrismaClient } from "@prisma/client";
import { computeShippingNetPerUnit } from "@/lib/incoming-shipping";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * 입고 1건의 운임 합계를 Expense.SHIPPING 에 통합 기록한다.
 *
 * 합계 = 헤더 운임(`Incoming.shippingCost`) + 그 입고의 모든 `IncomingItem.itemShippingCost` 합
 * - 헤더 차감(`shippingDeducted=true`) + 품목 직접 운임 동시 존재 시 → 두 건 분리 기록 (recoverable 분리)
 * - 그 외 → 단일 행 (헤더+품목 합산, recoverable=헤더 차감 여부)
 * - 합계 0 이면 기존 행 삭제
 */
export async function recalcIncomingExpense(tx: Tx, incomingId: string) {
  const incoming = await tx.incoming.findUnique({
    where: { id: incomingId },
    select: {
      id: true,
      incomingNo: true,
      incomingDate: true,
      supplierId: true,
      shippingCost: true,
      shippingDeducted: true,
      items: { select: { itemShippingCost: true } },
    },
  });
  if (!incoming) return;

  const headerShipping = Number(incoming.shippingCost) || 0;
  const itemShippingSum = incoming.items.reduce((sum, it) => {
    const v = it.itemShippingCost == null ? 0 : Number(it.itemShippingCost);
    return sum + v;
  }, 0);
  const isDeducted = incoming.shippingDeducted;

  // 기존 SHIPPING expense 행 모두 삭제 후 재생성 (단순)
  await tx.expense.deleteMany({
    where: {
      referenceId: incoming.id,
      referenceType: "INCOMING",
      category: "SHIPPING",
    },
  });

  if (isDeducted && headerShipping > 0 && itemShippingSum > 0) {
    // 분리 기록: 헤더(차감) + 품목(우리 부담)
    await tx.expense.create({
      data: {
        date: incoming.incomingDate,
        amount: headerShipping,
        category: "SHIPPING",
        description: `택배비 (입고 ${incoming.incomingNo}) — 거래처 차감`,
        supplierId: incoming.supplierId,
        referenceId: incoming.id,
        referenceType: "INCOMING",
        memo: "거래처 차감",
        recoverable: true,
      },
    });
    await tx.expense.create({
      data: {
        date: incoming.incomingDate,
        amount: itemShippingSum,
        category: "SHIPPING",
        description: `택배비 (입고 ${incoming.incomingNo}) — 품목 직접`,
        supplierId: incoming.supplierId,
        referenceId: incoming.id,
        referenceType: "INCOMING",
        memo: null,
        recoverable: false,
      },
    });
  } else {
    const total = headerShipping + itemShippingSum;
    if (total > 0) {
      await tx.expense.create({
        data: {
          date: incoming.incomingDate,
          amount: total,
          category: "SHIPPING",
          description: `택배비 (입고 ${incoming.incomingNo})`,
          supplierId: incoming.supplierId,
          referenceId: incoming.id,
          referenceType: "INCOMING",
          memo: isDeducted ? "거래처 차감" : null,
          recoverable: isDeducted,
        },
      });
    }
  }
}

/**
 * 입고 1건의 모든 품목 unitCostSnapshot + 관련 InventoryLot.unitCost 를 재계산해서 저장.
 * - itemShippingCost override + 분배 + IncomingCost(부대비용) 모두 반영
 * - 같은 supplierProductId 그룹은 가중평균 (10+1 프로모션 대응)
 * - 호출 전에 Incoming/IncomingItem의 shipping 관련 필드는 이미 저장돼 있어야 함
 */
export async function recalcIncomingShippingSnapshots(tx: Tx, incomingId: string) {
  const incoming = await tx.incoming.findUnique({
    where: { id: incomingId },
    include: {
      items: {
        include: {
          supplierProduct: {
            include: {
              productMappings: { select: { productId: true, conversionRate: true } },
              incomingCosts: { where: { isActive: true } },
            },
          },
        },
      },
    },
  });
  if (!incoming) return;

  const shippingNetMap = computeShippingNetPerUnit(
    incoming.items.map((i) => ({
      id: i.id,
      quantity: Number(i.quantity),
      totalPrice: Number(i.totalPrice),
      itemShippingCost:
        i.itemShippingCost === null || i.itemShippingCost === undefined ? null : Number(i.itemShippingCost),
      itemShippingIsTaxable: i.itemShippingIsTaxable,
    })),
    {
      shippingCost: Number(incoming.shippingCost),
      shippingIsTaxable: incoming.shippingIsTaxable,
      shippingDeducted: incoming.shippingDeducted,
    }
  );

  const baseCalcs = incoming.items.map((item) => {
    const qty = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const shippingNetPerUnit = shippingNetMap.get(item.id) ?? 0;

    const incomingCostPerUnit = item.supplierProduct.incomingCosts
      .filter((c) => c.perUnit)
      .reduce((sum, c) => {
        const raw = c.costType === "FIXED" ? Number(c.value) : (unitPrice * Number(c.value)) / 100;
        return sum + (c.isTaxable ? raw / 1.1 : raw);
      }, 0);

    return { item, qty, baseSnapshot: unitPrice + shippingNetPerUnit + incomingCostPerUnit };
  });

  // SP 그룹 가중평균
  const groups = new Map<string, typeof baseCalcs>();
  for (const c of baseCalcs) {
    const key = c.item.supplierProductId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  const groupAvgBySpId = new Map<string, number>();
  for (const [spId, rows] of groups) {
    const totalQty = rows.reduce((s, r) => s + r.qty, 0);
    const totalCost = rows.reduce((s, r) => s + r.qty * r.baseSnapshot, 0);
    groupAvgBySpId.set(spId, totalQty > 0 ? totalCost / totalQty : 0);
  }

  const itemSnapshots = baseCalcs.map(({ item }) => ({
    item,
    newUnitCostSnapshot: groupAvgBySpId.get(item.supplierProductId)!,
  }));

  const itemIds = itemSnapshots.map((s) => s.item.id);
  const [, allLots] = await Promise.all([
    Promise.all(
      itemSnapshots.map(({ item, newUnitCostSnapshot }) =>
        tx.incomingItem.update({
          where: { id: item.id },
          data: { unitCostSnapshot: newUnitCostSnapshot as unknown as Prisma.Decimal },
        })
      )
    ),
    tx.inventoryLot.findMany({
      where: { incomingItemId: { in: itemIds } },
      select: { id: true, productId: true, incomingItemId: true },
    }),
  ]);

  const snapshotByItemId = new Map(itemSnapshots.map((s) => [s.item.id, s]));
  await Promise.all(
    allLots.map((lot) => {
      const snap = lot.incomingItemId ? snapshotByItemId.get(lot.incomingItemId) : undefined;
      if (!snap) return Promise.resolve();
      let lotUnitCost = snap.newUnitCostSnapshot;
      if (lot.productId) {
        const mapping = snap.item.supplierProduct.productMappings.find((m) => m.productId === lot.productId);
        if (mapping) {
          lotUnitCost = snap.newUnitCostSnapshot / Number(mapping.conversionRate);
        }
      }
      return tx.inventoryLot.update({
        where: { id: lot.id },
        data: { unitCost: lotUnitCost as unknown as Prisma.Decimal },
      });
    })
  );
}
