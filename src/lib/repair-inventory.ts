// 수리 부속 추가/제거 시 재고를 즉시 차감/복원하는 헬퍼.
// 정책:
//   - 부속이 RepairTicket에 추가되는 즉시 FIFO로 InventoryLot 차감
//   - LotConsumption(repairPartId 연결) 생성 → 향후 마진 분석/원가 추적
//   - InventoryMovement.OUTGOING 기록 (memo: "수리 #R...")
//   - 부속 행 삭제 시 LotConsumption 역조회 → InventoryLot.remainingQty 복원 + Inventory 복원
//   - status (USED/LOST) 변경은 재고에 영향 없음 (이미 차감된 상태). 청구 여부에만 영향.
//   - RepairPart.unitCostSnapshot 은 같은 행에 누적된 모든 LotConsumption 의 가중평균.
//     카트 패턴(같은 productId 행에 합치기) 으로 다회 차감 시에도 올바른 값이 되도록
//     consume/restore 끝마다 LotConsumption 전체로 재계산해 저장.

import type { Prisma } from "@prisma/client";
import { fifoConsume, ensureBulkStock } from "@/lib/inventory/fifo";

export interface ConsumePartArgs {
  ticketId: string;
  ticketNo: string;
  productId: string;
  productName: string;
  quantity: number;
}

// 해당 RepairPart 의 모든 LotConsumption 으로 단가 가중평균 재계산.
// 다회 차감/부분 복원 후에도 unitCostSnapshot 이 정확한 가중평균이 되도록 보장.
async function recomputeUnitCostSnapshot(
  tx: Prisma.TransactionClient,
  partId: string,
): Promise<number> {
  const all = await tx.lotConsumption.findMany({
    where: { repairPartId: partId },
    select: { quantity: true, unitCost: true },
  });
  if (all.length === 0) return 0;
  let totalQty = 0;
  let totalCost = 0;
  for (const c of all) {
    const q = Number(c.quantity);
    totalQty += q;
    totalCost += q * Number(c.unitCost);
  }
  return totalQty > 0 ? totalCost / totalQty : 0;
}

/**
 * RepairPart 행에 대해 FIFO 차감 + LotConsumption 생성 + Inventory 차감 + Movement 기록.
 * 호출 측에서 RepairPart 자체를 미리 생성한 뒤 그 ID를 넘긴다.
 */
export async function consumeRepairPart(
  tx: Prisma.TransactionClient,
  partId: string,
  args: ConsumePartArgs,
  allowOversell = false,
): Promise<{ unitCostAvg: number }> {
  const { ticketId, ticketNo, productId, productName, quantity } = args;

  await ensureBulkStock(tx, productId, quantity, `수리: ${productName}`, allowOversell);

  const { consumptions, unitCostAvg } = await fifoConsume(
    tx,
    productId,
    quantity,
    `수리: ${productName}`,
    allowOversell,
  );

  // N+1 방지 — createMany 로 한 번에 적재
  if (consumptions.length > 0) {
    await tx.lotConsumption.createMany({
      data: consumptions.map((c) => ({
        repairPartId: partId,
        lotId: c.lotId,
        quantity: c.quantity,
        unitCost: c.unitCost,
      })),
    });
  }

  const inv = await tx.inventory.update({
    where: { productId },
    data: { quantity: { decrement: quantity } },
    select: { id: true, quantity: true },
  });

  await tx.inventoryMovement.create({
    data: {
      inventoryId: inv.id,
      type: "OUTGOING",
      quantity: -quantity,
      balanceAfter: inv.quantity,
      referenceId: ticketId,
      referenceType: "REPAIR_PART",
      memo: `수리 ${ticketNo}: ${productName}`,
    },
  });

  // 행에 누적된 모든 LotConsumption 의 가중평균을 unitCostSnapshot 으로 저장.
  // 첫 차감 때는 unitCostAvg 와 동일하지만, 카트 패턴으로 합쳐질 때는 누적 평균이 된다.
  const weightedAvg = await recomputeUnitCostSnapshot(tx, partId);
  await tx.repairPart.update({
    where: { id: partId },
    data: {
      consumedAt: new Date(),
      unitCostSnapshot: weightedAvg,
    },
  });

  return { unitCostAvg };
}

export interface RestorePartArgs {
  ticketId: string;
  ticketNo: string;
  productId: string;
  productName: string;
  quantity: number;
  reason?: string; // 메모용 (취소/삭제/수량변경 등)
}

/**
 * 차감된 부속을 복원. LotConsumption을 역조회하여 InventoryLot/Inventory 복원.
 * 호출 측에서 RepairPart 행 자체는 따로 처리(삭제 또는 보존)한다.
 */
export async function restoreRepairPart(
  tx: Prisma.TransactionClient,
  partId: string,
  args: RestorePartArgs,
): Promise<void> {
  const { ticketId, ticketNo, productId, productName, quantity, reason } = args;

  const consumptions = await tx.lotConsumption.findMany({
    where: { repairPartId: partId },
    select: { lotId: true, quantity: true },
  });

  // N+1 방지 — Promise.all 로 병렬 increment.
  // 각 update는 lotId가 다르므로 updateMany로 묶을 수 없음.
  await Promise.all(
    consumptions.map((c) =>
      tx.inventoryLot.update({
        where: { id: c.lotId },
        data: { remainingQty: { increment: Number(c.quantity) } },
      }),
    ),
  );

  await tx.lotConsumption.deleteMany({ where: { repairPartId: partId } });

  const inv = await tx.inventory.update({
    where: { productId },
    data: { quantity: { increment: quantity } },
    select: { id: true, quantity: true },
  });

  await tx.inventoryMovement.create({
    data: {
      inventoryId: inv.id,
      type: "RETURN",
      quantity: quantity,
      balanceAfter: inv.quantity,
      referenceId: ticketId,
      referenceType: "REPAIR_PART_RESTORE",
      memo: `수리 ${ticketNo}: ${productName} 복원${reason ? ` (${reason})` : ""}`,
    },
  });
}
