/**
 * 판매 데이터 리셋 스크립트
 *
 * 보존: User, Supplier, SupplierProduct, Product, Incoming, Expense,
 *       SalesChannel, ChannelFee, ChannelPricing, RentalAsset (pool),
 *       InventoryLot(source=INITIAL/INCOMING), SupplierLedger 전체(기초미지급금 포함)
 *
 * 리셋: Order, Quotation(SALES/type!=PURCHASE), Statement, Customer+관련,
 *       RepairTicket, Rental, SupplierReturn, LotConsumption,
 *       InventoryLot(source=ADJUSTMENT), 판매/조정성 InventoryMovement
 *
 * 재고: 남은 InventoryLot(INITIAL/INCOMING)의 remainingQty를 receivedQty로
 *       복구하고, productId별로 합산해 Inventory.quantity 재설정
 *
 * 실행: npm run db:reset-sales [-- --yes] [-- --dry-run]
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const args = new Set(process.argv.slice(2));
const AUTO_YES = args.has("--yes");
const DRY_RUN = args.has("--dry-run");

function ensureNotProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("production 환경에서는 실행할 수 없습니다.");
  }
  const url = process.env.DATABASE_URL ?? "";
  const lower = url.toLowerCase();
  const prodHints = ["prod", "production"];
  if (prodHints.some((h) => lower.includes(h))) {
    throw new Error(`DATABASE_URL이 production처럼 보입니다 (${url}).`);
  }
}

async function confirmPrompt(): Promise<boolean> {
  if (AUTO_YES || DRY_RUN) return true;
  const rl = readline.createInterface({ input, output });
  const ans = await rl.question(
    "\n위 데이터를 삭제하고 재고를 재계산합니다. 계속하려면 'yes' 입력: "
  );
  rl.close();
  return ans.trim().toLowerCase() === "yes";
}

async function printPreview() {
  const counts = {
    LotConsumption: await prisma.lotConsumption.count(),
    Statement: await prisma.statement.count(),
    Order: await prisma.order.count(),
    RepairTicket: await prisma.repairTicket.count(),
    Rental: await prisma.rental.count(),
    Customer: await prisma.customer.count(),
    "Quotation(SALES/기타)": await prisma.quotation.count({
      where: { NOT: { type: "PURCHASE" } },
    }),
    "Quotation(PURCHASE, 보존)": await prisma.quotation.count({
      where: { type: "PURCHASE" },
    }),
    SupplierReturn: await prisma.supplierReturn.count(),
    "InventoryLot(ADJUSTMENT, 삭제)": await prisma.inventoryLot.count({
      where: { source: "ADJUSTMENT" },
    }),
    "InventoryLot(INITIAL, 보존)": await prisma.inventoryLot.count({
      where: { source: "INITIAL" },
    }),
    "InventoryLot(INCOMING, 보존)": await prisma.inventoryLot.count({
      where: { source: "INCOMING" },
    }),
    "SupplierLedger(INITIAL_BALANCE, 보존)": await prisma.supplierLedger.count({
      where: { referenceType: "INITIAL_BALANCE" },
    }),
    "Incoming(보존)": await prisma.incoming.count(),
    "Expense(보존)": await prisma.expense.count(),
  };

  console.log("\n=== 리셋 대상 및 보존 현황 ===");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(40)} ${v}`);
  }
}

async function run() {
  ensureNotProduction();

  console.log(`모드: ${DRY_RUN ? "DRY-RUN" : "실행"}  자동승인: ${AUTO_YES}`);
  await printPreview();

  if (!(await confirmPrompt())) {
    console.log("취소되었습니다.");
    return;
  }

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] 실제 삭제는 수행하지 않습니다.");
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const del: Record<string, number> = {};

    // 1. 소비/명세 자식부터
    del.lotConsumption = (await tx.lotConsumption.deleteMany({})).count;
    del.statementItem = (await tx.statementItem.deleteMany({})).count;
    del.statement = (await tx.statement.deleteMany({})).count;

    // 2. Order + OrderItem (cascade)
    del.order = (await tx.order.deleteMany({})).count;

    // 3. Repair (RepairPart/RepairLabor cascade)
    del.repairTicket = (await tx.repairTicket.deleteMany({})).count;

    // 4. Rental 트랜잭션만 삭제, RentalAsset은 상태만 리셋
    del.rental = (await tx.rental.deleteMany({})).count;
    const assetReset = await tx.rentalAsset.updateMany({
      where: { status: "RENTED" },
      data: { status: "AVAILABLE" },
    });
    del["rentalAsset.status=RENTED→AVAILABLE"] = assetReset.count;

    // 5. SupplierReturn (FIFO 일관성을 위해 삭제)
    del.supplierReturn = (await tx.supplierReturn.deleteMany({})).count;

    // 6. Customer + 의존 (CustomerLedger/Payment/Note/Machine cascade via Customer)
    //    단 Quotation.customerId, Statement.customerId 참조가 남아있으면 FK로 막힘 →
    //    Quotation(SALES/기타) 삭제 후에 Customer 삭제
    del.quotationNonPurchase = (
      await tx.quotation.deleteMany({ where: { NOT: { type: "PURCHASE" } } })
    ).count;
    del.customer = (await tx.customer.deleteMany({})).count;

    // 7. 재고 재계산 준비
    // 7a. ADJUSTMENT 로트 삭제 (판매 이력 사라지면 보정도 의미 없음)
    del.inventoryLotAdjustment = (
      await tx.inventoryLot.deleteMany({ where: { source: "ADJUSTMENT" } })
    ).count;

    // 7b. INCOMING/INITIAL 이 아닌 InventoryMovement 삭제
    del.inventoryMovementNonIncoming = (
      await tx.inventoryMovement.deleteMany({
        where: { type: { notIn: ["INCOMING", "INITIAL"] } },
      })
    ).count;

    // 7c. 남은 로트의 remainingQty 를 receivedQty 로 복구
    //     (판매/수리/실사/공급반품으로 소진된 부분을 원복)
    const resetLots = await tx.$executeRaw`
      UPDATE inventory_lots
      SET remaining_qty = received_qty
      WHERE remaining_qty <> received_qty
    `;
    del["inventoryLot.remainingQty 복구"] = Number(resetLots);

    // 7d. Inventory.quantity 재계산
    //     productId 별로 InventoryLot.receivedQty 합산 (productId NOT NULL 만)
    const lotSums = await tx.inventoryLot.groupBy({
      by: ["productId"],
      where: { productId: { not: null } },
      _sum: { receivedQty: true },
    });

    // 모든 Inventory 를 0 으로 초기화 후 합산값 반영 (avgCost 캐시도 클리어)
    await tx.inventory.updateMany({
      data: { quantity: 0, avgCost: null, avgCostUpdatedAt: null },
    });

    let inventoryUpdated = 0;
    for (const row of lotSums) {
      if (!row.productId) continue;
      const qty = Number(row._sum.receivedQty ?? 0);
      await tx.inventory.upsert({
        where: { productId: row.productId },
        update: { quantity: qty },
        create: { productId: row.productId, quantity: qty },
      });
      inventoryUpdated += 1;
    }
    del["inventory.quantity 재계산"] = inventoryUpdated;

    return del;
  }, { timeout: 120_000 });

  console.log("\n=== 리셋 완료 ===");
  for (const [k, v] of Object.entries(result)) {
    console.log(`  ${k.padEnd(40)} ${v}`);
  }
  console.log("\n확인: npm run db:studio 로 Supplier/Product/Incoming 보존, Order/Statement/Customer 비어있음, InventoryLot(INITIAL) 유지 확인");
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
