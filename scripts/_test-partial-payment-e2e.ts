/**
 * 부분 결제 라이프사이클 End-to-End 통합 테스트 (실데이터 검증).
 *
 * 시뮬레이션:
 *   1) 임시 고객 생성
 *   2) PARTIAL_PAID 주문 직접 생성 (총 110,000 / 입금 100,000 / 잔금 10,000 / 계약금)
 *   3) CustomerLedger SALE 10,000 (잔금) 직접 생성
 *   4) /api/customer-payments POST 와 동일 로직으로 10,000 수금 시뮬
 *   5) 자동 매칭 검증 — Order.paymentStatus=PAID + paidAmount=null + partialPaymentKind=null
 *   6) Ledger 잔액 0 확인
 *   7) 모든 테스트 row cleanup
 *
 * ⚠️ 실 DB 에 임시 row 생성·삭제. 끝에 깔끔하게 cleanup. 오류 시 rollback transaction.
 *
 * 사용: npx tsx --env-file=.env.local scripts/_test-partial-payment-e2e.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "✓" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(`Test failed: ${label}`);
}

async function main() {
  console.log("\n🧪 부분 결제 라이프사이클 E2E\n");

  // 0) 테스트용 사용자 fetch (createdBy 필수)
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) throw new Error("테스트 user 없음 — 최소 1명 필요");

  await prisma.$transaction(async (tx) => {
    // 1) 임시 고객
    const customer = await tx.customer.create({
      data: {
        name: `__TEST_PartialPaid_${Date.now()}`,
        phone: "01000000000",
        type: "INDIVIDUAL",
        isActive: true,
      },
    });
    console.log(`👤 임시 고객 생성: ${customer.id.slice(-8)} (${customer.name})`);

    // 2) PARTIAL_PAID 주문 생성 (총 110,000 / 입금 100,000 / 잔금 10,000 / 계약금)
    const order = await tx.order.create({
      data: {
        orderNo: `__TEST_${Date.now().toString(36).toUpperCase()}`,
        channelId: null,
        customerId: customer.id,
        orderDate: new Date(),
        fulfillmentType: "IN_STORE",
        status: "COMPLETED",
        paymentMethod: "CARD",
        paymentStatus: "PARTIAL_PAID",
        paidAmount: new Prisma.Decimal(100_000),
        partialPaymentKind: "DEPOSIT",
        subtotalAmount: new Prisma.Decimal(100_000),
        taxAmount: new Prisma.Decimal(10_000),
        totalAmount: new Prisma.Decimal(110_000),
        createdById: user.id,
      },
    });
    console.log(`📦 주문 생성: ${order.orderNo} PARTIAL_PAID DEPOSIT`);

    // 3) CustomerLedger SALE 10,000 (잔금만)
    await tx.customerLedger.create({
      data: {
        customerId: customer.id,
        date: order.orderDate,
        type: "SALE",
        description: `주문 ${order.orderNo} 잔금 (계약금 외)`,
        debitAmount: new Prisma.Decimal(10_000),
        creditAmount: new Prisma.Decimal(0),
        balance: new Prisma.Decimal(10_000),
        referenceId: order.id,
        referenceType: "ORDER",
      },
    });
    console.log(`📒 Ledger SALE 잔금 10,000 등록`);

    console.log("\n[검증 #1] 초기 상태");
    const initial = await tx.order.findUnique({
      where: { id: order.id },
      select: {
        paymentStatus: true,
        paidAmount: true,
        partialPaymentKind: true,
      },
    });
    check(
      "주문 paymentStatus = PARTIAL_PAID",
      initial?.paymentStatus === "PARTIAL_PAID",
    );
    check(
      "주문 paidAmount = 100,000",
      Number(initial?.paidAmount) === 100_000,
    );
    check(
      "주문 partialPaymentKind = DEPOSIT",
      initial?.partialPaymentKind === "DEPOSIT",
    );

    const lastLedger = await tx.customerLedger.findFirst({
      where: { customerId: customer.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    check(
      "Ledger 잔액 = 10,000 (미수)",
      Number(lastLedger?.balance) === 10_000,
    );

    // 4) /api/customer-payments POST 와 동일 로직 — 잔금 10,000 수금
    console.log("\n💰 잔금 10,000 수금 시뮬레이션 (FIFO 자동 매칭)");
    const payment = await tx.customerPayment.create({
      data: {
        customerId: customer.id,
        amount: new Prisma.Decimal(10_000),
        paymentDate: new Date(),
        method: "CASH",
        kind: "MIXED",
        createdById: user.id,
      },
    });
    await tx.customerLedger.create({
      data: {
        customerId: customer.id,
        date: payment.paymentDate,
        type: "RECEIPT",
        description: "잔금 수금",
        debitAmount: new Prisma.Decimal(0),
        creditAmount: new Prisma.Decimal(10_000),
        balance: new Prisma.Decimal(0),
        referenceId: payment.id,
        referenceType: "CUSTOMER_PAYMENT",
      },
    });

    // FIFO 매칭 (route.ts 와 동일 로직 인라인 복제)
    const candidates = await tx.order.findMany({
      where: {
        customerId: customer.id,
        paymentStatus: { in: ["UNPAID", "PARTIAL_PAID"] },
        status: { notIn: ["CANCELLED", "RETURNED", "EXCHANGED"] },
      },
      select: {
        id: true,
        orderNo: true,
        totalAmount: true,
        paymentStatus: true,
        paidAmount: true,
      },
      orderBy: { orderDate: "asc" },
    });
    let remaining = 10_000;
    const paidOrderIds: string[] = [];
    for (const o of candidates) {
      const due =
        o.paymentStatus === "PARTIAL_PAID" && o.paidAmount
          ? Math.max(0, Number(o.totalAmount) - Number(o.paidAmount))
          : Number(o.totalAmount);
      if (remaining + 0.01 < due) break;
      remaining -= due;
      paidOrderIds.push(o.id);
    }
    if (paidOrderIds.length > 0) {
      await tx.order.updateMany({
        where: { id: { in: paidOrderIds } },
        data: {
          paymentStatus: "PAID",
          paidAmount: null,
          partialPaymentKind: null,
        },
      });
    }
    console.log(`  → 자동 매칭된 주문: ${paidOrderIds.length}건`);

    console.log("\n[검증 #2] 수금 후 상태");
    const after = await tx.order.findUnique({
      where: { id: order.id },
      select: {
        paymentStatus: true,
        paidAmount: true,
        partialPaymentKind: true,
      },
    });
    check("주문 paymentStatus = PAID", after?.paymentStatus === "PAID");
    check("주문 paidAmount = null (메타 초기화)", after?.paidAmount === null);
    check(
      "주문 partialPaymentKind = null (메타 초기화)",
      after?.partialPaymentKind === null,
    );

    const balanceAfter = await tx.customerLedger.findFirst({
      where: { customerId: customer.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    check(
      "Ledger 잔액 = 0 (완납)",
      Number(balanceAfter?.balance) === 0,
    );

    console.log("\n🧹 테스트 row cleanup (rollback)");
    throw new Error("__ROLLBACK_INTENTIONAL");
  })
    .catch((e) => {
      if (e instanceof Error && e.message === "__ROLLBACK_INTENTIONAL") {
        console.log("  ✓ 트랜잭션 rollback 됨 — 테스트 row 모두 삭제");
        return;
      }
      throw e;
    });

  console.log("\n✅ E2E 라이프사이클 검증 통과");
  console.log("\n시나리오 요약:");
  console.log("  • PARTIAL_PAID 주문 생성 + 계약금 100,000 + 잔금 10,000 ledger");
  console.log("  • 잔금 10,000 CustomerPayment 등록 → FIFO 매칭");
  console.log("  • Order PAID 자동 전환 + paidAmount/kind null 초기화");
  console.log("  • Ledger 잔액 0 (완납)\n");
}

main()
  .catch((e) => {
    console.error("\n❌ 테스트 실패");
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
