/**
 * VAT포함 입력으로 인한 1원 누락 보정 스크립트.
 *
 * 원인: 입고 폼이 VAT-incl 입력을 받으면 폼은 round(VAT × qty / 1.1) 로 supply 를
 *       계산해 보여줬으나, API는 qty × round(VAT/1.1) 로 totalPrice 를 다시 계산해
 *       1원씩 누락된 채 저장했음.
 *
 * 사용법:
 *   npx tsx --env-file=.env.local       scripts/fix-vat-rounding.ts          (dev scan)
 *   npx tsx --env-file=.env.local       scripts/fix-vat-rounding.ts --fix    (dev apply)
 *   npx tsx --env-file=.env.prod.tmp    scripts/fix-vat-rounding.ts          (prod scan)
 *   npx tsx --env-file=.env.prod.tmp    scripts/fix-vat-rounding.ts --fix    (prod apply)
 *   npx tsx --env-file=.env.local       scripts/fix-vat-rounding.ts --id IN260428-V53Z [--fix]
 *
 * 보정 절차 (--fix 시, incoming 단위 트랜잭션):
 *   1. 영향받은 IncomingItem.totalPrice 를 정정값으로 업데이트
 *   2. Incoming.totalAmount 를 모든 items 합계로 재계산
 *   3. CONFIRMED 이고 거래처가 CREDIT 이면 해당 입고의 PURCHASE SupplierLedger.debitAmount 재계산
 *   4. rebalanceSupplierLedger 로 거래처 잔액 일관성 회복
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { rebalanceSupplierLedger } from "../src/lib/supplier-ledger";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type Affected = {
  itemId: string;
  supplierProductName: string;
  qty: number;
  unitPrice: number;
  discountAmount: number;
  currentTotal: number;
  expectedTotal: number;
  candidateVat: number;
  diff: number;
};

function detectAffected(item: {
  id: string;
  quantity: { toString(): string };
  unitPrice: { toString(): string };
  totalPrice: { toString(): string };
  discountAmount: { toString(): string } | null;
  supplierProduct: { name: string };
}): Affected | null {
  const qty = parseFloat(item.quantity.toString());
  const unitPrice = parseFloat(item.unitPrice.toString());
  const totalPrice = parseFloat(item.totalPrice.toString());
  const disc = item.discountAmount ? parseFloat(item.discountAmount.toString()) : 0;

  // qty 가 1 이면 가능한 모든 식이 일치 → 누락 없음
  if (qty < 2) return null;

  // 단가 + 할인 이 어떤 VAT-incl 정수의 1.1 분의 1 이라고 가정했을 때,
  // 그 VAT-incl 정수를 candidateVat 로 추정.
  const beforeDisc = unitPrice + disc;
  const candidateVat = Math.round(beforeDisc * 1.1);
  // candidateVat 가 100 의 배수가 아니면 사용자가 VAT-incl 로 입력했을 가능성이 낮음 → skip.
  if (candidateVat % 100 !== 0) return null;
  // 역산 검증: round(candidateVat / 1.1) 이 beforeDisc 와 일치해야 일관됨
  if (Math.round(candidateVat / 1.1) !== beforeDisc) return null;

  // VAT-incl 가정 시 폼이 계산했을 정답 supply
  const expectedSupplyBeforeDisc = Math.round((candidateVat * qty) / 1.1);
  const expectedTotal = expectedSupplyBeforeDisc - disc * qty;

  if (expectedTotal === totalPrice) return null; // 누락 없음

  return {
    itemId: item.id,
    supplierProductName: item.supplierProduct.name,
    qty,
    unitPrice,
    discountAmount: disc,
    currentTotal: totalPrice,
    expectedTotal,
    candidateVat,
    diff: expectedTotal - totalPrice,
  };
}

async function run() {
  const args = process.argv.slice(2);
  const fix = args.includes("--fix");
  const idIdx = args.indexOf("--id");
  const targetIncomingNo = idIdx >= 0 ? args[idIdx + 1] : null;

  const where = targetIncomingNo ? { incomingNo: targetIncomingNo } : {};
  const incomings = await prisma.incoming.findMany({
    where,
    include: {
      supplier: { select: { paymentMethod: true, name: true } },
      items: {
        include: {
          supplierProduct: { select: { name: true, isTaxable: true } },
        },
      },
    },
    orderBy: { incomingDate: "asc" },
  });

  if (incomings.length === 0) {
    console.log(targetIncomingNo ? `${targetIncomingNo} 없음` : "입고 레코드 없음");
    return;
  }

  console.log(`[${fix ? "FIX" : "SCAN"}] 검사 대상: ${incomings.length} 건\n`);

  let totalAffectedIncomings = 0;
  let totalAffectedItems = 0;
  let totalDiff = 0;
  const supplierIdsToRebalance = new Set<string>();

  for (const inc of incomings) {
    const affectedItems: Affected[] = [];
    for (const it of inc.items) {
      const a = detectAffected(it);
      if (a) affectedItems.push(a);
    }
    if (affectedItems.length === 0) continue;

    totalAffectedIncomings++;
    totalAffectedItems += affectedItems.length;
    const incomingDiff = affectedItems.reduce((s, a) => s + a.diff, 0);
    totalDiff += incomingDiff;

    console.log(
      `▶ ${inc.incomingNo} (${inc.supplier.name}, ${inc.status}, paymentMethod=${inc.supplier.paymentMethod})`,
    );
    for (const a of affectedItems) {
      console.log(
        `   ◦ [${a.supplierProductName}] qty=${a.qty} unitPrice=${a.unitPrice} (VAT추정=${a.candidateVat})  totalPrice ${a.currentTotal} → ${a.expectedTotal}  (diff=${a.diff > 0 ? "+" : ""}${a.diff})`,
      );
    }
    console.log(`   합계 변화: ${incomingDiff > 0 ? "+" : ""}${incomingDiff}원\n`);

    if (!fix) continue;

    // === 실제 보정 ===
    await prisma.$transaction(async (tx) => {
      // 1. 각 IncomingItem.totalPrice 갱신
      for (const a of affectedItems) {
        await tx.incomingItem.update({
          where: { id: a.itemId },
          data: { totalPrice: a.expectedTotal },
        });
      }

      // 2. Incoming.totalAmount 재계산 (모든 items 의 totalPrice 합)
      const items = await tx.incomingItem.findMany({
        where: { incomingId: inc.id },
        select: { totalPrice: true },
      });
      const newTotalAmount = items.reduce((s, i) => s + Number(i.totalPrice), 0);
      await tx.incoming.update({
        where: { id: inc.id },
        data: { totalAmount: newTotalAmount },
      });

      // 3. CONFIRMED + CREDIT 이면 SupplierLedger.PURCHASE 재계산
      if (inc.status === "CONFIRMED" && inc.supplier.paymentMethod === "CREDIT") {
        // tax 포함 합계 (입고 확정 시 로직과 동일하게 per-item round)
        const itemsForTax = await tx.incomingItem.findMany({
          where: { incomingId: inc.id },
          include: {
            supplierProduct: { select: { isTaxable: true } },
          },
        });
        const totalWithTax = itemsForTax.reduce((sum, item) => {
          const supply = Number(item.totalPrice);
          const tax = item.supplierProduct.isTaxable ? Math.round(supply * 0.1) : 0;
          return sum + supply + tax;
        }, 0);

        const ledger = await tx.supplierLedger.findFirst({
          where: { referenceId: inc.id, referenceType: "INCOMING", type: "PURCHASE" },
        });
        if (ledger) {
          await tx.supplierLedger.update({
            where: { id: ledger.id },
            data: { debitAmount: totalWithTax },
          });
        }
        // 거래처 잔액 재계산은 incoming 루프 끝난 뒤 한 번만
        const supplierIdRow = await tx.incoming.findUnique({
          where: { id: inc.id },
          select: { supplierId: true },
        });
        if (supplierIdRow) supplierIdsToRebalance.add(supplierIdRow.supplierId);
      }
    });
  }

  console.log(`\n=== ${fix ? "보정 완료" : "스캔 결과"} ===`);
  console.log(`영향 입고: ${totalAffectedIncomings} 건`);
  console.log(`영향 품목: ${totalAffectedItems} 건`);
  console.log(`총 차액: ${totalDiff > 0 ? "+" : ""}${totalDiff} 원`);

  if (fix && supplierIdsToRebalance.size > 0) {
    console.log(`\n거래처 잔액 재계산: ${supplierIdsToRebalance.size} 건`);
    for (const supplierId of supplierIdsToRebalance) {
      await prisma.$transaction(async (tx) => {
        await rebalanceSupplierLedger(tx, supplierId);
      });
    }
    console.log("거래처 잔액 재계산 완료");
  }

  if (!fix) {
    console.log("\n→ 적용하려면 같은 명령에 --fix 를 붙여주세요.");
  }
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
