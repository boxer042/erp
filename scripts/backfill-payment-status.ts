/**
 * paymentStatus 백필 — 결제 축 도입 시 1회성 실행.
 *
 * 사용:
 *   npx tsx --env-file=.env.local scripts/backfill-payment-status.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-payment-status.ts
 *
 * 정책 (paymentStatus 신규 도입 — 기존 데이터 추정):
 *   1. status=RETURNED                       → REFUNDED   (반품 완료는 환불 가정)
 *   2. paymentMethod=UNPAID OR null          → UNPAID
 *   3. 그 외 (CASH/CARD/TRANSFER/MIXED 결제) → PAID
 *
 * @default(UNPAID) 로 db push 가 채운 행을 위 규칙으로 정정.
 */
import { prisma } from "../src/lib/prisma";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const total = await prisma.order.count();
  console.log(`[backfill] 전체 주문 ${total}건`);

  const refunded = await prisma.order.count({ where: { status: "RETURNED" } });
  const unpaidOrNull = await prisma.order.count({
    where: {
      OR: [{ paymentMethod: "UNPAID" }, { paymentMethod: null }],
      status: { not: "RETURNED" },
    },
  });
  const paid = total - refunded - unpaidOrNull;

  console.log(`  → REFUNDED 후보: ${refunded}건 (status=RETURNED)`);
  console.log(`  → UNPAID 후보:   ${unpaidOrNull}건 (외상/미입력)`);
  console.log(`  → PAID 후보:     ${paid}건 (결제 완료)`);

  if (DRY_RUN) {
    console.log("\n[dry-run] 실제 변경 없음. 인자 빼고 다시 실행해 적용하세요.");
    return;
  }

  console.log("\n[backfill] 적용 시작...");
  const r1 = await prisma.order.updateMany({
    where: { status: "RETURNED" },
    data: { paymentStatus: "REFUNDED" },
  });
  console.log(`  ✓ REFUNDED ${r1.count}건`);

  const r2 = await prisma.order.updateMany({
    where: {
      OR: [{ paymentMethod: "UNPAID" }, { paymentMethod: null }],
      status: { not: "RETURNED" },
    },
    data: { paymentStatus: "UNPAID" },
  });
  console.log(`  ✓ UNPAID ${r2.count}건`);

  const r3 = await prisma.order.updateMany({
    where: {
      paymentMethod: { in: ["CASH", "CARD", "TRANSFER", "MIXED"] },
      status: { not: "RETURNED" },
    },
    data: { paymentStatus: "PAID" },
  });
  console.log(`  ✓ PAID ${r3.count}건`);

  console.log("\n[backfill] 완료");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
