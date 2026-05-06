import type { Prisma } from "@prisma/client";

/**
 * 발주서의 receivedQty 와 status 를 입고 내역 기반으로 재계산.
 *
 * 두 가지 카운트 분리:
 * - **receivedQty** = sum(CONFIRMED 입고 quantity) — 재고 반영 완료된 양
 * - **committed**   = sum(non-CANCELLED 입고 quantity) — 등록된 모든 양 (PENDING + CONFIRMED)
 *
 * 자동 전환 규칙 (사용자 명시 상태는 건드리지 않음):
 *
 *   사용자 명시 상태 (보호): CLOSED, CANCELLED, PARTIAL_RESENT, PARTIAL_REACCEPTED
 *
 *   committed === 0:
 *     PARTIAL/RECEIVED/PARTIAL_COMPLETED → CONFIRMED 로 강등.
 *     PARTIAL_RESENT/PARTIAL_REACCEPTED 는 사용자 액션 단계이므로 유지.
 *     그 외 기존 유지.
 *
 *   receivedQty >= ordered (모두 충족):
 *     PARTIAL → PARTIAL_COMPLETED  (부분입고 이력 보존)
 *     PARTIAL_RESENT/PARTIAL_REACCEPTED → PARTIAL_COMPLETED  (재요청 사이클 거침)
 *     DRAFT/SENT/CONFIRMED → RECEIVED  (한 번에 모두 받은 정상 케이스)
 *
 *   committed > 0 && receivedQty < ordered (일부 진행):
 *     DRAFT/SENT/CONFIRMED → PARTIAL  (처음 입고 시작)
 *     PARTIAL/PARTIAL_RESENT/PARTIAL_REACCEPTED 는 그대로 유지 (사용자가 사이클 관리 중)
 *     PARTIAL_COMPLETED 였다가 receivedQty 차감되면 → PARTIAL 강등 (입고 취소 케이스)
 *
 * 호출 시점:
 * - 입고 등록(POST PENDING) — 진행 시작
 * - 입고 확정(PUT confirm) — receivedQty 누적, 완료 시 RECEIVED/PARTIAL_COMPLETED
 * - 입고 취소(PUT cancel) — committed/received 차감
 * - 입고 삭제(DELETE PENDING) — committed 차감
 */
export async function recalcPurchaseOrderProgress(
  tx: Prisma.TransactionClient,
  purchaseOrderId: string
): Promise<void> {
  const po = await tx.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: {
      items: {
        include: {
          incomingItems: {
            include: { incoming: { select: { status: true } } },
          },
        },
      },
    },
  });

  if (!po) return;
  // 종결 상태 — 절대 자동 변경 안 함
  if (po.status === "CLOSED" || po.status === "CANCELLED") return;

  let totalOrdered = 0;
  let totalReceived = 0;     // CONFIRMED 만
  let totalCommitted = 0;    // PENDING + CONFIRMED (= non-CANCELLED)
  const itemUpdates: Promise<unknown>[] = [];

  for (const item of po.items) {
    const ordered = Number(item.quantity);
    let confirmed = 0;
    let committed = 0;
    for (const ii of item.incomingItems) {
      if (ii.incoming.status === "CANCELLED") continue;
      const q = Number(ii.quantity);
      committed += q;
      if (ii.incoming.status === "CONFIRMED") confirmed += q;
    }

    totalOrdered += ordered;
    totalReceived += confirmed;
    totalCommitted += committed;

    if (Number(item.receivedQty) !== confirmed) {
      itemUpdates.push(
        tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQty: confirmed },
        })
      );
    }
  }

  await Promise.all(itemUpdates);

  // 사용자 명시 단계 — 진행률은 갱신하되 status 자동 변경하지 않음
  // 단, 완료 조건(receivedQty >= ordered)은 PARTIAL_RESENT/REACCEPTED 에서도 PARTIAL_COMPLETED 로 자동
  const inPartialCycle = po.status === "PARTIAL" || po.status === "PARTIAL_RESENT" || po.status === "PARTIAL_REACCEPTED";

  let nextStatus = po.status;

  if (totalCommitted <= 0) {
    // 입고 모두 사라짐 — 진행 상태/완료 상태 모두 CONFIRMED 로 강등
    if (po.status === "PARTIAL" || po.status === "RECEIVED" || po.status === "PARTIAL_COMPLETED") {
      nextStatus = "CONFIRMED";
    }
    // PARTIAL_RESENT/REACCEPTED 는 사용자 액션이므로 유지 (사용자가 직접 정리)
  } else if (totalReceived >= totalOrdered) {
    // 모두 충족
    if (inPartialCycle) {
      nextStatus = "PARTIAL_COMPLETED";  // 부분입고 이력 보존
    } else if (po.status === "DRAFT" || po.status === "SENT" || po.status === "CONFIRMED") {
      nextStatus = "RECEIVED";  // 정상 한 번에 받음
    }
    // PARTIAL_COMPLETED 는 유지
  } else {
    // 일부 진행
    if (po.status === "DRAFT" || po.status === "SENT" || po.status === "CONFIRMED") {
      nextStatus = "PARTIAL";  // 처음 입고 시작
    } else if (po.status === "PARTIAL_COMPLETED" || po.status === "RECEIVED") {
      // 입고 취소로 부족해진 경우 → PARTIAL 강등
      nextStatus = "PARTIAL";
    }
    // PARTIAL/PARTIAL_RESENT/PARTIAL_REACCEPTED 는 사용자 사이클 관리 중이므로 유지
  }

  if (nextStatus !== po.status) {
    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: nextStatus },
    });
  }
}
