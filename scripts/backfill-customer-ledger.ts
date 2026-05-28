/**
 * 일회성 백필 — 기존 PAID/PARTIAL_PAID Order/Repair/Rental 에 누락된 customerLedger 항목 생성.
 *
 * 변경 정책 (a7489fc 이후): 모든 거래는 SALE + RECEIPT 쌍으로 원장 기록.
 *   PAID:        SALE(total) + RECEIPT(total)         → balance 변화 0
 *   PARTIAL_PAID: SALE(total) + RECEIPT(paid)          → balance +outstanding
 *   UNPAID:      SALE(total) 만                        → balance +total
 *
 * 기존 데이터는 이 정책 적용 전이라 PAID 는 ledger 진입 없음 / PARTIAL 은 SALE(잔금) 만 있음.
 * 이 스크립트가 각각 보강:
 *   - PAID 주문/수리/임대로 ledger row 가 0개인 경우 → SALE + RECEIPT 한 쌍 추가
 *   - PARTIAL_PAID 주문은 그대로 둠 (수동 정리 필요 — 잔금 SALE 을 분해해야 함, 자동 위험)
 *
 * 멱등성: 같은 referenceId+referenceType+type 의 entry 가 이미 존재하면 skip.
 * 마지막에 customer 별 rebalanceCustomerLedger 호출.
 *
 * 실행:
 *   npx tsx scripts/backfill-customer-ledger.ts                  # .env.local (dev)
 *   PRISMA_ENV_FILE=.env.prod npx tsx scripts/backfill-customer-ledger.ts   # 운영
 */
import dotenv from "dotenv";
dotenv.config({ path: process.env.PRISMA_ENV_FILE ?? ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { rebalanceCustomerLedger } from "@/lib/customer-ledger";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type ReferenceType = "ORDER" | "REPAIR_TICKET" | "RENTAL";

async function ensurePaidPair(
  customerId: string,
  referenceId: string,
  referenceType: ReferenceType,
  date: Date,
  amount: number,
  saleDesc: string,
  receiptDesc: string,
  changedCustomers: Set<string>,
) {
  if (amount <= 0) return false;
  // 기존 ledger 상태 확인
  const existing = await prisma.customerLedger.findMany({
    where: { referenceId, referenceType },
    select: { type: true, createdAt: true },
  });
  const existingSale = existing.find((e) => e.type === "SALE");
  const existingReceipt = existing.find((e) => e.type === "RECEIPT");

  // 이미 SALE+RECEIPT 둘 다 있으면 끝
  if (existingSale && existingReceipt) return false;

  // SALE 만 있는 케이스 — 원래 UNPAID 였다가 다른 경로(customer-payment) 로
  // 정산된 주문일 수 있음. 외부 결제 흔적 있으면 RECEIPT 추가 금지 (중복 RECEIPT 방지).
  if (existingSale && !existingReceipt) {
    const hasCustomerPayment = await prisma.customerLedger.findFirst({
      where: {
        customerId,
        type: "RECEIPT",
        referenceType: "CUSTOMER_PAYMENT",
      },
      select: { id: true },
    });
    if (hasCustomerPayment) {
      console.log(
        `  skip ${referenceId} — SALE 단독이지만 customer-payment 정산 흔적 있음 (중복 위험)`,
      );
      return false;
    }
    // customer-payment 도 없는데 SALE 만? 백필이 부분 적용된 상태일 가능성.
    // RECEIPT 만 추가하면 위험하니 skip — 수동 검토 권장.
    console.log(
      `  skip ${referenceId} — SALE 단독, customer-payment 없음 (수동 검토 필요)`,
    );
    return false;
  }

  // 둘 다 없는 케이스 — 새로 한 쌍 생성 (PAID 주문 흔적 없음 → backfill 의 본래 목적)
  let touched = false;
  if (!existingSale) {
    await prisma.customerLedger.create({
      data: {
        customerId,
        date,
        type: "SALE",
        description: saleDesc,
        debitAmount: amount,
        creditAmount: 0,
        balance: 0,
        referenceId,
        referenceType,
      },
    });
    touched = true;
  }
  if (!existingReceipt) {
    await prisma.customerLedger.create({
      data: {
        customerId,
        date,
        type: "RECEIPT",
        description: receiptDesc,
        debitAmount: 0,
        creditAmount: amount,
        balance: 0,
        referenceId,
        referenceType,
      },
    });
    touched = true;
  }
  if (touched) changedCustomers.add(customerId);
  return touched;
}

async function main() {
  const changed = new Set<string>();

  // ── 1) PAID Orders ───────────────────────────────────────────────────
  const paidOrders = await prisma.order.findMany({
    where: {
      paymentStatus: "PAID",
      status: { not: "CANCELLED" },
    },
    select: { id: true, orderNo: true, customerId: true, orderDate: true, totalAmount: true },
  });
  console.log(`PAID orders: ${paidOrders.length}`);
  let oOk = 0;
  for (const o of paidOrders) {
    if (!o.customerId) continue;
    const touched = await ensurePaidPair(
      o.customerId,
      o.id,
      "ORDER",
      o.orderDate,
      Math.round(Number(o.totalAmount)),
      `POS 주문 ${o.orderNo}`,
      `POS 주문 ${o.orderNo} 결제`,
      changed,
    );
    if (touched) oOk++;
  }
  console.log(`  보강: ${oOk} 건`);

  // ── 2) PAID Repair Tickets (Order link 없는 ERP-only 픽업) ───────────
  // Order 가 있는 수리는 이미 위 #1 에서 처리됨. 여기는 orderId 없이 직접 픽업된 케이스.
  // paymentMethod 가 UNPAID 도 null 도 아닌 (실제 결제됨) 케이스만 — 코드에서 필터.
  const pickedUpRepairs = await prisma.repairTicket.findMany({
    where: {
      status: "PICKED_UP",
      orderId: null,
    },
    select: {
      id: true,
      ticketNo: true,
      customerId: true,
      pickedUpAt: true,
      finalAmount: true,
      quoteRejectedAt: true,
      paymentMethod: true,
    },
  });
  const paidRepairs = pickedUpRepairs.filter(
    (t) => t.paymentMethod != null && t.paymentMethod !== "UNPAID",
  );
  console.log(`PAID repairs (orderless): ${paidRepairs.length} (of ${pickedUpRepairs.length} picked-up)`);
  let rOk = 0;
  for (const t of paidRepairs) {
    if (!t.customerId || !t.pickedUpAt) continue;
    // finalAmount 는 NET 저장. ledger 는 VAT 포함.
    const amount = Math.round(Number(t.finalAmount) * 1.1);
    const desc = t.quoteRejectedAt
      ? `수리 ${t.ticketNo} (거절·진단비)`
      : `수리 ${t.ticketNo}`;
    const touched = await ensurePaidPair(
      t.customerId,
      t.id,
      "REPAIR_TICKET",
      t.pickedUpAt,
      amount,
      desc,
      `${desc} 결제`,
      changed,
    );
    if (touched) rOk++;
  }
  console.log(`  보강: ${rOk} 건`);

  // ── 3) PAID Rentals ─────────────────────────────────────────────────
  const allRentals = await prisma.rental.findMany({
    where: {
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      rentalNo: true,
      customerId: true,
      startDate: true,
      finalAmount: true,
      paymentMethod: true,
    },
  });
  const paidRentals = allRentals.filter(
    (r) => r.paymentMethod != null && r.paymentMethod !== "UNPAID",
  );
  console.log(`PAID rentals: ${paidRentals.length} (of ${allRentals.length})`);
  let lOk = 0;
  for (const r of paidRentals) {
    if (!r.customerId) continue;
    // 동일하게 VAT 포함으로 환산
    const amount = Math.round(Number(r.finalAmount) * 1.1);
    const touched = await ensurePaidPair(
      r.customerId,
      r.id,
      "RENTAL",
      r.startDate,
      amount,
      `임대 ${r.rentalNo}`,
      `임대 ${r.rentalNo} 결제`,
      changed,
    );
    if (touched) lOk++;
  }
  console.log(`  보강: ${lOk} 건`);

  // ── 4) Rebalance 영향받은 고객 ───────────────────────────────────────
  console.log(`\nrebalance 대상 고객: ${changed.size} 명`);
  let bal = 0;
  for (const customerId of changed) {
    await prisma.$transaction(async (tx) => {
      await rebalanceCustomerLedger(tx, customerId);
    });
    bal++;
    if (bal % 50 === 0) console.log(`  진행: ${bal} / ${changed.size}`);
  }
  console.log(`\n완료 — 주문 ${oOk} · 수리 ${rOk} · 임대 ${lOk} · rebalance ${bal} 명`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
