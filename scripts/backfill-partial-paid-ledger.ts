/**
 * 일회성 백필 — PARTIAL_PAID 주문의 원장 항목을 신규 정책으로 갱신.
 *
 * 이전 정책 (PARTIAL_PAID 결제 시):
 *   SALE(outstanding) 1행만 — description 에 "잔금" 포함
 *
 * 신규 정책 (a7489fc 이후):
 *   SALE(totalAmount) + RECEIPT(paidAmount) → balance net +outstanding (동일하지만 audit trail 완성)
 *
 * 이 스크립트가 한 일:
 *   - PARTIAL_PAID 주문 중 SALE 의 description 에 "잔금" 포함된 케이스 식별 (구 포맷)
 *   - 해당 SALE 의 debitAmount/description 을 신규 포맷으로 update (총액 + 일반 라벨)
 *   - 같은 주문에 RECEIPT(paid) 행 신규 추가 (없을 때만)
 *   - 영향받은 고객 rebalance (잔액 변화는 0 — net 으로 같음)
 *
 * 멱등성: 이미 신규 포맷이면 skip.
 *
 * 실행:
 *   npx tsx scripts/backfill-partial-paid-ledger.ts                          # dev
 *   PRISMA_ENV_FILE=.env.prod npx tsx scripts/backfill-partial-paid-ledger.ts   # 운영
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
  // PARTIAL_PAID 주문 전체
  const partialOrders = await prisma.order.findMany({
    where: { paymentStatus: "PARTIAL_PAID" },
    select: {
      id: true,
      orderNo: true,
      customerId: true,
      orderDate: true,
      totalAmount: true,
      paidAmount: true,
      partialPaymentKind: true,
    },
  });
  console.log(`PARTIAL_PAID orders: ${partialOrders.length}`);

  const affected = new Set<string>();
  let migrated = 0;

  for (const o of partialOrders) {
    if (!o.customerId) continue;
    const total = Math.round(Number(o.totalAmount));
    const paid = Math.round(Number(o.paidAmount ?? 0));
    if (total <= 0 || paid <= 0) continue;

    const entries = await prisma.customerLedger.findMany({
      where: { referenceId: o.id, referenceType: "ORDER" },
      select: { id: true, type: true, debitAmount: true, description: true },
    });
    const sale = entries.find((e) => e.type === "SALE");
    const receipt = entries.find((e) => e.type === "RECEIPT");

    // 이미 신규 포맷? (SALE.debit == total) → skip
    if (sale && Number(sale.debitAmount) === total && receipt) {
      continue;
    }

    if (sale && sale.description.includes("잔금")) {
      // 구 포맷 — SALE 행을 신규 포맷으로 갱신
      const saleDesc = `POS 주문 ${o.orderNo}`;
      await prisma.customerLedger.update({
        where: { id: sale.id },
        data: { debitAmount: total, description: saleDesc, balance: 0 },
      });
      migrated++;
      console.log(
        `  ${o.orderNo} SALE 갱신: debit ${sale.debitAmount}→${total} desc="${saleDesc}"`,
      );
    } else if (!sale) {
      // SALE 자체가 없는 케이스 — 신규 추가
      const saleDesc = `POS 주문 ${o.orderNo}`;
      await prisma.customerLedger.create({
        data: {
          customerId: o.customerId,
          date: o.orderDate,
          type: "SALE",
          description: saleDesc,
          debitAmount: total,
          creditAmount: 0,
          balance: 0,
          referenceId: o.id,
          referenceType: "ORDER",
        },
      });
      migrated++;
      console.log(`  ${o.orderNo} SALE 신규 추가: total ${total}`);
    } else {
      // SALE 있지만 "잔금" 안 들어가 있고 debit != total → 신규 포맷도 아니고 구 포맷도 아닌 이상 케이스
      console.log(
        `  skip ${o.orderNo} — 알 수 없는 SALE 상태 (debit=${sale.debitAmount}, desc="${sale.description}")`,
      );
      continue;
    }

    if (!receipt) {
      const receiptDesc =
        o.partialPaymentKind === "DEPOSIT"
          ? `POS 주문 ${o.orderNo} 계약금`
          : `POS 주문 ${o.orderNo} 일부결제`;
      await prisma.customerLedger.create({
        data: {
          customerId: o.customerId,
          date: o.orderDate,
          type: "RECEIPT",
          description: receiptDesc,
          debitAmount: 0,
          creditAmount: paid,
          balance: 0,
          referenceId: o.id,
          referenceType: "ORDER",
        },
      });
      console.log(`  ${o.orderNo} RECEIPT 추가: paid ${paid}`);
    }
    affected.add(o.customerId);
  }

  console.log(`\n변환 ${migrated} 건 · 영향 고객 ${affected.size} 명`);
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
