/**
 * supplier-payment FIFO 자동 매칭 동작 테스트.
 *
 * 시나리오:
 *   1. 보쉬코리아 (CREDIT) 의 현재 입고 paymentStatus 상태 출력
 *   2. 추가 결제로 다음 UNPAID 입고를 PAID 처리할 수 있는 금액 등록
 *   3. recompute 결과 — 새 PAID 입고 늘었는지 확인
 *   4. 테스트 결제 삭제
 *   5. recompute 후 원상 복귀 확인
 *
 * 사용:
 *   npx tsx --env-file=.env.local scripts/test-fifo-matching.ts
 */
import { prisma } from "../src/lib/prisma";
import { recomputeIncomingPaymentStatus } from "../src/lib/supplier-ledger";

const TARGET_NAME = "보쉬코리아";

async function snapshot(supplierId: string, label: string) {
  const incomings = await prisma.incoming.findMany({
    where: { supplierId, status: "CONFIRMED" },
    orderBy: { incomingDate: "asc" },
    include: {
      items: {
        include: { supplierProduct: { select: { isTaxable: true } } },
      },
    },
  });
  const paySum = await prisma.supplierPayment.aggregate({
    where: { supplierId },
    _sum: { amount: true },
  });

  console.log(`\n─── ${label} ───`);
  console.log(`  결제 합계: ₩${Number(paySum._sum.amount ?? 0).toLocaleString("ko-KR")}`);
  incomings.forEach((inc) => {
    const total = inc.items.reduce((sum, item) => {
      const supply = Number(item.totalPrice);
      const tax = item.supplierProduct.isTaxable ? Math.round(supply * 0.1) : 0;
      return sum + supply + tax;
    }, 0);
    const date = inc.incomingDate.toISOString().slice(0, 10);
    console.log(
      `  ${date}  ${inc.incomingNo}  ₩${total.toLocaleString("ko-KR").padStart(12)}  [${inc.paymentStatus}]`,
    );
  });
}

async function main() {
  console.log(`=== supplier-payment FIFO 매칭 테스트 — ${TARGET_NAME} ===`);

  const supplier = await prisma.supplier.findFirst({
    where: { name: TARGET_NAME },
    select: { id: true, name: true, paymentMethod: true },
  });
  if (!supplier) {
    console.error(`거래처 ${TARGET_NAME} 를 찾을 수 없습니다`);
    process.exit(1);
  }
  console.log(`거래처: ${supplier.name} (${supplier.paymentMethod})`);

  // 시스템 user 가 필요 — 첫 번째 user 사용
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) {
    console.error("user 가 없습니다");
    process.exit(1);
  }

  await snapshot(supplier.id, "초기 상태");

  // 다음 UNPAID 입고 1건의 total 계산해서 그만큼 결제
  const nextUnpaid = await prisma.incoming.findFirst({
    where: { supplierId: supplier.id, status: "CONFIRMED", paymentStatus: "UNPAID" },
    orderBy: { incomingDate: "asc" },
    include: {
      items: { include: { supplierProduct: { select: { isTaxable: true } } } },
    },
  });
  if (!nextUnpaid) {
    console.log("\n다음 UNPAID 입고 없음 — 테스트 종료");
    return;
  }
  const totalForNext = nextUnpaid.items.reduce((sum, item) => {
    const supply = Number(item.totalPrice);
    const tax = item.supplierProduct.isTaxable ? Math.round(supply * 0.1) : 0;
    return sum + supply + tax;
  }, 0);
  console.log(
    `\n다음 UNPAID 입고: ${nextUnpaid.incomingNo} (₩${totalForNext.toLocaleString("ko-KR")})`,
  );

  // 결제 합계 - (이미 fully-paid 매칭된 입고 합) 의 차이를 보강해서 다음 입고도 PAID 되게 만듦
  // 단순화: 다음 입고의 total 만큼 결제 추가
  const testAmount = totalForNext;
  console.log(`\n[STEP 1] 테스트 결제 ₩${testAmount.toLocaleString("ko-KR")} 추가`);

  let testPaymentId = "";
  await prisma.$transaction(async (tx) => {
    const created = await tx.supplierPayment.create({
      data: {
        supplierId: supplier.id,
        amount: testAmount,
        paymentDate: new Date(),
        method: "TRANSFER",
        memo: "[TEST] FIFO 매칭 동작 검증용",
        createdById: user.id,
      },
    });
    testPaymentId = created.id;

    // ledger 도 함께 기록 (실제 API 와 동일하게)
    const lastLedger = await tx.supplierLedger.findFirst({
      where: { supplierId: supplier.id },
      orderBy: { createdAt: "desc" },
    });
    const prev = lastLedger ? Number(lastLedger.balance) : 0;
    await tx.supplierLedger.create({
      data: {
        supplierId: supplier.id,
        date: new Date(),
        type: "PAYMENT",
        description: "결제 — [TEST]",
        debitAmount: 0,
        creditAmount: testAmount,
        balance: prev - testAmount,
        referenceId: created.id,
        referenceType: "SUPPLIER_PAYMENT",
      },
    });

    // FIFO 재매칭
    const result = await recomputeIncomingPaymentStatus(tx, supplier.id);
    console.log(`  recompute → ${result.paidCount}/${result.totalCount} PAID`);
  });

  await snapshot(supplier.id, "[STEP 1 후] 결제 추가 + 재매칭");

  console.log(`\n[STEP 2] 테스트 결제 삭제 → rollback 확인`);
  await prisma.$transaction(async (tx) => {
    await tx.supplierLedger.deleteMany({
      where: { referenceId: testPaymentId, referenceType: "SUPPLIER_PAYMENT" },
    });
    await tx.supplierPayment.delete({ where: { id: testPaymentId } });

    // ledger balance 재계산 (실제 API 의 rebalanceSupplierLedger 와 동일)
    const ledgers = await tx.supplierLedger.findMany({
      where: { supplierId: supplier.id },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { id: true, debitAmount: true, creditAmount: true },
    });
    let balance = 0;
    for (const l of ledgers) {
      balance += Number(l.debitAmount) - Number(l.creditAmount);
      await tx.supplierLedger.update({ where: { id: l.id }, data: { balance } });
    }

    const result = await recomputeIncomingPaymentStatus(tx, supplier.id);
    console.log(`  recompute → ${result.paidCount}/${result.totalCount} PAID`);
  });

  await snapshot(supplier.id, "[STEP 2 후] 결제 삭제 + 재매칭");

  console.log("\n=== 테스트 완료 ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
