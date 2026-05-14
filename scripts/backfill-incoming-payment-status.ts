/**
 * Incoming.paymentStatus 백필 — supplier FIFO 자동 매칭 도입 시 1회성 실행.
 *
 * 사용:
 *   npx tsx --env-file=.env.local scripts/backfill-incoming-payment-status.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-incoming-payment-status.ts
 *
 * 정책:
 *   1. 비-CREDIT 거래처 (PREPAID/CASH 등) — 모든 confirmed 입고 PAID
 *      (현금/선결제는 입고 시점에 결제 완료라고 가정. SupplierLedger 기록도 안 들어감)
 *   2. CREDIT 거래처 — 결제 합계만큼 가장 오래된 입고부터 fully-paid 마킹 (FIFO)
 *      잔여 결제액은 잔액에만 반영 (Order 도 동일 정책)
 *
 * @default(UNPAID) 로 db push 가 채운 행을 위 규칙으로 정정.
 */
import { prisma } from "../src/lib/prisma";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`[backfill-incoming-payment-status] ${DRY_RUN ? "DRY RUN" : "EXECUTE"}`);

  const suppliers = await prisma.supplier.findMany({
    select: { id: true, name: true, paymentMethod: true },
    where: { isActive: true },
  });
  console.log(`[backfill] 활성 거래처 ${suppliers.length}건`);

  let totalPaidCount = 0;
  let totalIncomingsCount = 0;

  for (const s of suppliers) {
    if (s.paymentMethod !== "CREDIT") {
      // 비-CREDIT: 모든 confirmed 입고 PAID
      const candidates = await prisma.incoming.count({
        where: { supplierId: s.id, status: "CONFIRMED", paymentStatus: "UNPAID" },
      });
      if (candidates === 0) continue;

      if (!DRY_RUN) {
        await prisma.incoming.updateMany({
          where: { supplierId: s.id, status: "CONFIRMED", paymentStatus: "UNPAID" },
          data: { paymentStatus: "PAID" },
        });
      }
      console.log(`[${s.name}] PREPAID/CASH → ${candidates} confirmed 입고 PAID`);
      totalPaidCount += candidates;
      totalIncomingsCount += candidates;
      continue;
    }

    // CREDIT: 결제 합계만큼 가장 오래된 입고부터 fully-paid 마킹
    const paySum = await prisma.supplierPayment.aggregate({
      where: { supplierId: s.id },
      _sum: { amount: true },
    });
    let remaining = Number(paySum._sum.amount ?? 0);

    const incomings = await prisma.incoming.findMany({
      where: { supplierId: s.id, status: "CONFIRMED" },
      orderBy: { incomingDate: "asc" },
      include: {
        items: {
          include: {
            supplierProduct: { select: { isTaxable: true } },
          },
        },
      },
    });

    const paidIds: string[] = [];
    for (const inc of incomings) {
      const total = inc.items.reduce((sum, item) => {
        const supply = Number(item.totalPrice);
        const tax = item.supplierProduct.isTaxable ? Math.round(supply * 0.1) : 0;
        return sum + supply + tax;
      }, 0);
      if (remaining + 0.01 < total) break; // 잔액 부족 — 다음 입고 처리 안 함
      remaining -= total;
      paidIds.push(inc.id);
    }

    if (paidIds.length > 0 && !DRY_RUN) {
      await prisma.incoming.updateMany({
        where: { id: { in: paidIds } },
        data: { paymentStatus: "PAID" },
      });
    }

    console.log(
      `[${s.name}] CREDIT → ${paidIds.length}/${incomings.length} PAID, 잔여 결제 ₩${remaining.toLocaleString("ko-KR")}`,
    );
    totalPaidCount += paidIds.length;
    totalIncomingsCount += incomings.length;
  }

  console.log(
    `\n=== ${DRY_RUN ? "[DRY RUN]" : ""} 완료 — ${totalPaidCount}/${totalIncomingsCount} 입고 PAID 마킹 ===`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
