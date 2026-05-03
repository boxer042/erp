// 수리 부속 추가/제거 시 재고를 즉시 차감/복원하는 헬퍼.
// 정책:
//   - 부속이 RepairTicket에 추가되는 즉시 FIFO로 InventoryLot 차감
//   - LotConsumption(repairPartId 연결) 생성 → 향후 마진 분석/원가 추적
//   - InventoryMovement.OUTGOING 기록 (memo: "수리 #R...")
//   - 부속 행 삭제 시 LotConsumption 역조회 → InventoryLot.remainingQty 복원 + Inventory 복원
//   - status (USED/LOST) 변경은 재고에 영향 없음 (이미 차감된 상태). 청구 여부에만 영향.

import type { Prisma } from "@prisma/client";
import { fifoConsume, ensureBulkStock } from "@/lib/inventory/fifo";

export interface ConsumePartArgs {
  ticketId: string;
  ticketNo: string;
  productId: string;
  productName: string;
  quantity: number;
}

/**
 * RepairPart 행에 대해 FIFO 차감 + LotConsumption 생성 + Inventory 차감 + Movement 기록.
 * 호출 측에서 RepairPart 자체를 미리 생성한 뒤 그 ID를 넘긴다.
 */
export async function consumeRepairPart(
  tx: Prisma.TransactionClient,
  partId: string,
  args: ConsumePartArgs,
): Promise<{ unitCostAvg: number }> {
  const { ticketId, ticketNo, productId, productName, quantity } = args;

  await ensureBulkStock(tx, productId, quantity, `수리: ${productName}`);

  const { consumptions, unitCostAvg } = await fifoConsume(
    tx,
    productId,
    quantity,
    `수리: ${productName}`,
  );

  for (const c of consumptions) {
    await tx.lotConsumption.create({
      data: {
        repairPartId: partId,
        lotId: c.lotId,
        quantity: c.quantity,
        unitCost: c.unitCost,
      },
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

  await tx.repairPart.update({
    where: { id: partId },
    data: {
      consumedAt: new Date(),
      unitCostSnapshot: unitCostAvg,
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
  });

  for (const c of consumptions) {
    await tx.inventoryLot.update({
      where: { id: c.lotId },
      data: { remainingQty: { increment: Number(c.quantity) } },
    });
  }

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
