/**
 * 일회성 정리 — backfill-customer-ledger 실수 보정.
 *
 * 문제:
 *   backfill 이 paymentStatus=PAID 인 모든 Order 에 SALE + RECEIPT 쌍을 추가했는데,
 *   이미 customer-payment(/api/customer-payments) 로 외상이 정산된 주문은
 *   RECEIPT(referenceType=CUSTOMER_PAYMENT) 가 별도로 존재함.
 *   → 같은 주문에 RECEIPT 2개 (CUSTOMER_PAYMENT + ORDER) 가 생기면서 잔액이 음수로 빠짐.
 *
 * 식별 기준:
 *   RECEIPT(referenceType=ORDER) 행 중 같은 Order 의 SALE 이 60초 이상 일찍 생성된 것 →
 *   원래 UNPAID 였던 주문에 backfill 이 잘못 추가한 RECEIPT 임.
 *   (정상: POS 결제로 갓 만든 PAID 주문은 SALE/RECEIPT 가 같은 트랜잭션에서 ~ms 차이로 생성됨)
 *
 * 동작:
 *   1. 위 기준의 RECEIPT 행 모두 찾음
 *   2. 해당 고객에게 CUSTOMER_PAYMENT RECEIPT 가 있는지 확인 (있어야 backfill 실수임)
 *   3. 만족하는 RECEIPT 삭제
 *   4. 영향받은 고객 rebalance
 *
 * 실행:
 *   npx tsx scripts/cleanup-duplicate-receipts.ts                        # dev
 *   PRISMA_ENV_FILE=.env.prod npx tsx scripts/cleanup-duplicate-receipts.ts   # 운영
 */
import dotenv from "dotenv";
dotenv.config({ path: process.env.PRISMA_ENV_FILE ?? ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { rebalanceCustomerLedger } from "@/lib/customer-ledger";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // ORDER 참조 RECEIPT 전체
  const orderReceipts = await prisma.customerLedger.findMany({
    where: { type: "RECEIPT", referenceType: "ORDER" },
    select: {
      id: true,
      customerId: true,
      referenceId: true,
      createdAt: true,
      creditAmount: true,
    },
  });
  console.log(`ORDER 참조 RECEIPT: ${orderReceipts.length} 건`);

  const toDelete: string[] = [];
  const affected = new Set<string>();

  for (const r of orderReceipts) {
    if (!r.referenceId) continue;
    // 같은 주문의 SALE
    const sale = await prisma.customerLedger.findFirst({
      where: {
        type: "SALE",
        referenceType: "ORDER",
        referenceId: r.referenceId,
      },
      select: { id: true, createdAt: true },
    });
    if (!sale) continue;
    const diffSec =
      (r.createdAt.getTime() - sale.createdAt.getTime()) / 1000;
    // SALE 이 RECEIPT 보다 60초 이상 일찍 있었으면 — 원래 UNPAID 였던 주문
    if (diffSec < 60) continue;
    // 그 고객이 customer-payment 로 정산한 흔적이 있는지
    const hasCustomerPayment = await prisma.customerLedger.findFirst({
      where: {
        customerId: r.customerId,
        type: "RECEIPT",
        referenceType: "CUSTOMER_PAYMENT",
      },
      select: { id: true },
    });
    if (!hasCustomerPayment) continue;
    // 모든 조건 만족 → backfill 중복
    toDelete.push(r.id);
    affected.add(r.customerId);
    console.log(
      `  → 삭제 후보 RECEIPT ${r.id} (Order ${r.referenceId}, 고객 ${r.customerId}, -${r.creditAmount}원)`,
    );
  }

  console.log(`\n삭제 대상: ${toDelete.length} 건`);
  if (toDelete.length === 0) {
    console.log("정리할 항목 없음. 종료.");
    return;
  }

  await prisma.customerLedger.deleteMany({
    where: { id: { in: toDelete } },
  });
  console.log(`삭제 완료: ${toDelete.length} 건`);

  console.log(`\nrebalance 대상 고객: ${affected.size} 명`);
  for (const customerId of affected) {
    await prisma.$transaction(async (tx) => {
      await rebalanceCustomerLedger(tx, customerId);
    });
  }
  console.log("완료.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
