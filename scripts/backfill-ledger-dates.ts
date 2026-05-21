/**
 * CustomerLedger 의 SALE 행 date 백필 — 1회성.
 *
 * 사용:
 *   npx tsx --env-file=.env.local scripts/backfill-ledger-dates.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-ledger-dates.ts
 *
 * 배경:
 *   외상 주문/수리/임대의 SALE customerLedger 행은 과거 `date` 필드를 명시하지 않아
 *   Prisma 기본값 `now()` (트랜잭션 실행 시각 timestamp) 로 저장됨.
 *   반면 RECEIPT (CustomerPayment) / ADJUSTMENT 는 사용자 입력 일자(자정 00:00:00) 로 저장.
 *   같은 날 발생한 매출(시간 timestamp) 과 수금(자정) 이 섞이면 `date asc` 정렬에서
 *   수금이 먼저 처리되어 `balance` 가 음수로 잘못 재계산되는 버그.
 *
 * 백필 정책:
 *   1. SALE + referenceType=ORDER         → date = order.orderDate
 *   2. SALE + referenceType=REPAIR_TICKET → date = repairTicket.pickedUpAt ?? 기존값
 *   3. SALE + referenceType=RENTAL        → date = rental.startDate
 *   그 후 영향받은 모든 고객의 ledger 를 rebalance.
 *
 * 안전:
 *   - DRY_RUN 모드로 수정 카운트만 출력
 *   - 이미 정확한 행(date 가 이미 참조 엔티티의 날짜와 동일)은 건너뜀
 */
import { prisma } from "../src/lib/prisma";
import { rebalanceCustomerLedger } from "../src/lib/customer-ledger";

const DRY_RUN = process.argv.includes("--dry-run");

function sameInstant(a: Date, b: Date) {
  return a.getTime() === b.getTime();
}

async function main() {
  console.log(`[backfill-ledger-dates] DRY_RUN=${DRY_RUN}`);

  const saleLedgers = await prisma.customerLedger.findMany({
    where: { type: "SALE", referenceId: { not: null } },
    select: {
      id: true,
      customerId: true,
      date: true,
      referenceId: true,
      referenceType: true,
    },
  });
  console.log(`[scan] SALE ledger 총 ${saleLedgers.length}건`);

  // 참조 entity batch fetch — N+1 회피
  const orderIds = saleLedgers
    .filter((l) => l.referenceType === "ORDER" && l.referenceId)
    .map((l) => l.referenceId!);
  const repairIds = saleLedgers
    .filter((l) => l.referenceType === "REPAIR_TICKET" && l.referenceId)
    .map((l) => l.referenceId!);
  const rentalIds = saleLedgers
    .filter((l) => l.referenceType === "RENTAL" && l.referenceId)
    .map((l) => l.referenceId!);

  const [orders, repairs, rentals] = await Promise.all([
    orderIds.length
      ? prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, orderDate: true },
        })
      : Promise.resolve([]),
    repairIds.length
      ? prisma.repairTicket.findMany({
          where: { id: { in: repairIds } },
          select: { id: true, pickedUpAt: true, createdAt: true },
        })
      : Promise.resolve([]),
    rentalIds.length
      ? prisma.rental.findMany({
          where: { id: { in: rentalIds } },
          select: { id: true, startDate: true },
        })
      : Promise.resolve([]),
  ]);
  const orderMap = new Map(orders.map((o) => [o.id, o.orderDate]));
  const repairMap = new Map(
    repairs.map((r) => [r.id, r.pickedUpAt ?? r.createdAt]),
  );
  const rentalMap = new Map(rentals.map((r) => [r.id, r.startDate]));

  const affectedCustomers = new Set<string>();
  let toUpdate = 0;
  let unchanged = 0;
  let orphaned = 0;

  for (const l of saleLedgers) {
    let target: Date | null = null;
    if (l.referenceType === "ORDER") target = orderMap.get(l.referenceId!) ?? null;
    else if (l.referenceType === "REPAIR_TICKET") target = repairMap.get(l.referenceId!) ?? null;
    else if (l.referenceType === "RENTAL") target = rentalMap.get(l.referenceId!) ?? null;

    if (!target) {
      orphaned += 1;
      continue;
    }
    if (sameInstant(l.date, target)) {
      unchanged += 1;
      continue;
    }
    toUpdate += 1;
    affectedCustomers.add(l.customerId);
    if (!DRY_RUN) {
      await prisma.customerLedger.update({
        where: { id: l.id },
        data: { date: target },
      });
    }
  }

  console.log(`[plan] 갱신 ${toUpdate}건 / 변경 없음 ${unchanged}건 / 참조 끊김 ${orphaned}건`);
  console.log(`[plan] 영향받는 고객 ${affectedCustomers.size}명`);

  if (DRY_RUN) {
    console.log("[dry-run] date 갱신·rebalance 모두 스킵");
    return;
  }

  // 영향받은 고객 ledger 일괄 rebalance
  let rebalanced = 0;
  for (const customerId of affectedCustomers) {
    await prisma.$transaction(async (tx) => {
      await rebalanceCustomerLedger(tx, customerId);
    });
    rebalanced += 1;
    if (rebalanced % 50 === 0) {
      console.log(`  ... ${rebalanced}/${affectedCustomers.size} 명 rebalance 완료`);
    }
  }
  console.log(`[done] ${rebalanced}명 ledger rebalance 완료`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
