import type { Prisma } from "@prisma/client";

/**
 * 진단↔부속/공임 frequency 매핑의 idempotent sync 헬퍼.
 *
 * 원칙: 한 RepairTicket 은 자기의 (diagnosis × unique productId / laborName) 페어 당
 *      DiagnosisPartUsage / DiagnosisLaborUsage 의 occurrenceCount 에 +1 만 기여.
 *      증가/감소는 ticket 의 "기여 set" 변화에서 도출 — 토글·중복 추가에 robust.
 *
 * 사용 패턴 (각 mutation API 안에서):
 *   ① `snapshotTicketUsage(tx, ticketId)` 로 변경 전 상태 캡쳐
 *   ② mutation 실행 (parts.create / update / delete / labor 동일)
 *   ③ `snapshotTicketUsage` 재호출로 변경 후 상태 얻음
 *   ④ `applyUsageDelta(tx, before, after)` 호출 → 차이만큼 aggregate update
 */

export interface TicketUsageSnapshot {
  diagnosisId: string | null;
  /** 활성(USED) 부속의 고유 productId set */
  partProductIds: Set<string>;
  /** 공임의 고유 name set */
  laborNames: Set<string>;
}

/** 티켓의 현재 진단·고유 부속·고유 공임 set 을 캡쳐. */
export async function snapshotTicketUsage(
  tx: Prisma.TransactionClient,
  ticketId: string,
): Promise<TicketUsageSnapshot> {
  const ticket = await tx.repairTicket.findUnique({
    where: { id: ticketId },
    select: {
      diagnosisTemplateId: true,
      parts: {
        where: { status: "USED" },
        select: { productId: true },
      },
      labors: { select: { name: true } },
    },
  });
  if (!ticket) {
    return {
      diagnosisId: null,
      partProductIds: new Set(),
      laborNames: new Set(),
    };
  }
  return {
    diagnosisId: ticket.diagnosisTemplateId,
    partProductIds: new Set(ticket.parts.map((p) => p.productId)),
    laborNames: new Set(ticket.labors.map((l) => l.name)),
  };
}

/**
 * before/after 두 snapshot 의 차이를 aggregate(DiagnosisPartUsage·LaborUsage) 에 반영.
 *  - 진단이 같으면 부속·공임 set 차이만 적용 (added → +1, removed → −1).
 *  - 진단이 바뀌면 before 진단 전부 −1, after 진단 전부 +1.
 *  - 감소는 floor 0 (음수 안 만듦).
 *  - 공임 unitRate 는 별도 보존 (이 함수는 카운트만 다룸).
 */
export async function applyUsageDelta(
  tx: Prisma.TransactionClient,
  before: TicketUsageSnapshot,
  after: TicketUsageSnapshot,
): Promise<void> {
  const diagnosisChanged = before.diagnosisId !== after.diagnosisId;

  // 진단 변경 — before 진단 전부 −1, after 진단 전부 +1
  if (diagnosisChanged) {
    if (before.diagnosisId) {
      await decrementBatch(
        tx,
        before.diagnosisId,
        before.partProductIds,
        before.laborNames,
      );
    }
    if (after.diagnosisId) {
      await incrementBatch(
        tx,
        after.diagnosisId,
        after.partProductIds,
        after.laborNames,
      );
    }
    return;
  }

  // 같은 진단 — set 차이만 적용
  if (!after.diagnosisId) return; // 진단 없으면 학습 안 함

  const partsAdded = diff(after.partProductIds, before.partProductIds);
  const partsRemoved = diff(before.partProductIds, after.partProductIds);
  const laborsAdded = diff(after.laborNames, before.laborNames);
  const laborsRemoved = diff(before.laborNames, after.laborNames);

  await Promise.all([
    incrementBatch(tx, after.diagnosisId, partsAdded, laborsAdded),
    decrementBatch(tx, after.diagnosisId, partsRemoved, laborsRemoved),
  ]);
}

function diff<T>(a: Set<T>, b: Set<T>): Set<T> {
  return new Set([...a].filter((x) => !b.has(x)));
}

async function incrementBatch(
  tx: Prisma.TransactionClient,
  diagnosisId: string,
  productIds: Set<string>,
  laborNames: Set<string>,
): Promise<void> {
  await Promise.all([
    ...Array.from(productIds).map((productId) =>
      tx.diagnosisPartUsage.upsert({
        where: { diagnosisId_productId: { diagnosisId, productId } },
        create: { diagnosisId, productId, occurrenceCount: 1 },
        update: {
          occurrenceCount: { increment: 1 },
          lastOccurredAt: new Date(),
        },
      }),
    ),
    ...Array.from(laborNames).map((laborName) =>
      tx.diagnosisLaborUsage.upsert({
        where: { diagnosisId_laborName: { diagnosisId, laborName } },
        create: {
          diagnosisId,
          laborName,
          occurrenceCount: 1,
          unitRate: 0, // 단가는 라벨 추가 hook 에서 별도 갱신
        },
        update: {
          occurrenceCount: { increment: 1 },
          lastOccurredAt: new Date(),
        },
      }),
    ),
  ]);
}

async function decrementBatch(
  tx: Prisma.TransactionClient,
  diagnosisId: string,
  productIds: Set<string>,
  laborNames: Set<string>,
): Promise<void> {
  // floor 0 보장 — 음수 방지하려면 raw SQL 또는 decrement 후 0 미만 row 정리 필요.
  // 여기선 단순화: occurrenceCount > 0 인 행만 decrement, 그래도 정확도 100% 는 아니지만
  // 실제 카운트가 0 미만으로 갈 경로는 매우 드묾 (set semantics 가 일관되게 유지되는 한).
  await Promise.all([
    ...Array.from(productIds).map((productId) =>
      tx.diagnosisPartUsage.updateMany({
        where: { diagnosisId, productId, occurrenceCount: { gt: 0 } },
        data: {
          occurrenceCount: { decrement: 1 },
          lastOccurredAt: new Date(),
        },
      }),
    ),
    ...Array.from(laborNames).map((laborName) =>
      tx.diagnosisLaborUsage.updateMany({
        where: { diagnosisId, laborName, occurrenceCount: { gt: 0 } },
        data: {
          occurrenceCount: { decrement: 1 },
          lastOccurredAt: new Date(),
        },
      }),
    ),
  ]);
}

/**
 * 공임 unitRate 만 별도 갱신 (occurrenceCount 는 건드리지 않음).
 * Labor POST hook 에서 호출 — 마지막으로 사용된 단가가 추천 기본값이 됨.
 */
export async function updateLaborUsageRate(
  tx: Prisma.TransactionClient,
  diagnosisId: string,
  laborName: string,
  unitRate: number,
): Promise<void> {
  await tx.diagnosisLaborUsage
    .updateMany({
      where: { diagnosisId, laborName },
      data: { unitRate },
    })
    .catch(() => {});
}

/**
 * 세트 학습 — RepairTicket 의 PICKED_UP 전이 시점에만 호출 (확정된 케이스만).
 * 작업 중 토글이 통계 오염하지 않게 종결 시점에 1회 집계.
 *
 * Set normalize:
 *   - productIds 는 USED 부속의 unique 정렬 배열
 *   - laborNames 도 unique 정렬 배열
 *   - 같은 productId 가 여러 행이면 수량 합산해서 평균에 반영
 *   - 부속·공임 모두 비어 있으면 세트 학습 skip (의미 없음)
 *
 * 평균 누적: new_avg = (old_avg × old_count + new_value) / (old_count + 1)
 */
export async function learnDiagnosisPartSet(
  tx: Prisma.TransactionClient,
  ticketId: string,
): Promise<void> {
  const ticket = await tx.repairTicket.findUnique({
    where: { id: ticketId },
    select: {
      diagnosisTemplateId: true,
      parts: {
        where: { status: "USED" },
        select: { productId: true, quantity: true },
      },
      labors: { select: { name: true, unitRate: true } },
    },
  });
  if (!ticket || !ticket.diagnosisTemplateId) return;

  // productId 별 수량 합 (같은 productId 가 여러 행이면 합산)
  const partQtyByProduct = new Map<string, number>();
  for (const p of ticket.parts) {
    const cur = partQtyByProduct.get(p.productId) ?? 0;
    partQtyByProduct.set(p.productId, cur + Number(p.quantity));
  }
  // 공임 — 같은 name 이 여러 행이면 단가 평균
  const laborRateByName = new Map<string, { sum: number; count: number }>();
  for (const l of ticket.labors) {
    const cur = laborRateByName.get(l.name) ?? { sum: 0, count: 0 };
    cur.sum += Number(l.unitRate);
    cur.count += 1;
    laborRateByName.set(l.name, cur);
  }

  if (partQtyByProduct.size === 0 && laborRateByName.size === 0) return;

  // 정렬된 키 배열 — unique constraint key
  const productIds = Array.from(partQtyByProduct.keys()).sort();
  const laborNames = Array.from(laborRateByName.keys()).sort();
  // 정렬된 순서대로 수량·단가 배열
  const newQuantities = productIds.map((id) => partQtyByProduct.get(id) ?? 0);
  const newLaborRates = laborNames.map((name) => {
    const v = laborRateByName.get(name);
    return v && v.count > 0 ? v.sum / v.count : 0;
  });

  // upsert — (diagnosisId, productIds, laborNames) unique
  const existing = await tx.diagnosisPartSet.findFirst({
    where: {
      diagnosisId: ticket.diagnosisTemplateId,
      productIds: { equals: productIds },
      laborNames: { equals: laborNames },
    },
  });

  const now = new Date();
  if (existing) {
    // 평균 누적 — 인덱스 순서대로 (productIds 정렬이 동일하므로 안전)
    const newCount = existing.occurrenceCount + 1;
    const mergedQty = existing.avgQuantities.map(
      (oldAvg, i) => (oldAvg * existing.occurrenceCount + newQuantities[i]) / newCount,
    );
    const mergedRate = existing.avgLaborRates.map(
      (oldAvg, i) => (oldAvg * existing.occurrenceCount + newLaborRates[i]) / newCount,
    );
    await tx.diagnosisPartSet.update({
      where: { id: existing.id },
      data: {
        avgQuantities: mergedQty,
        avgLaborRates: mergedRate,
        occurrenceCount: newCount,
        lastOccurredAt: now,
      },
    });
  } else {
    await tx.diagnosisPartSet.create({
      data: {
        diagnosisId: ticket.diagnosisTemplateId,
        productIds,
        laborNames,
        avgQuantities: newQuantities,
        avgLaborRates: newLaborRates,
        occurrenceCount: 1,
        lastOccurredAt: now,
      },
    });
  }
}
