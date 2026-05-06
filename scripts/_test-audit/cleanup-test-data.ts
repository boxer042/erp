/**
 * 테스트 데이터 정리 — [T] prefix 가 붙은 모든 데이터 삭제.
 * 의존성 역순으로 삭제: child rows → parent rows.
 *
 * 실행: npx tsx scripts/_test-audit/cleanup-test-data.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenv } from "dotenv";

dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const T = "[T]";

async function main() {
  // ── 의존성 역순 삭제 ────────────────────────────────────────────

  // 1. CustomerLedger of test customers
  const testCustomers = await prisma.customer.findMany({
    where: { name: { startsWith: T } },
    select: { id: true },
  });
  const testCustomerIds = testCustomers.map((c) => c.id);

  // 2. CustomerLedger
  if (testCustomerIds.length > 0) {
    const led = await prisma.customerLedger.deleteMany({
      where: { customerId: { in: testCustomerIds } },
    });
    console.log(`✓ CustomerLedger: ${led.count}건 삭제`);
  }

  // 3. SerialItem (test customers OR code starts with T)
  const ser = await prisma.serialItem.deleteMany({
    where: {
      OR: [
        { customerId: { in: testCustomerIds } },
        { code: { startsWith: "T" } },
      ],
    },
  });
  console.log(`✓ SerialItem: ${ser.count}건`);

  // 4. Statements
  const statements = await prisma.statement.findMany({
    where: { customerId: { in: testCustomerIds } },
    select: { id: true },
  });
  if (statements.length > 0) {
    const ids = statements.map((s) => s.id);
    await prisma.statementItem.deleteMany({
      where: { statementId: { in: ids } },
    });
    await prisma.statement.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(`✓ Statement: ${statements.length}건`);

  // 5. Quotations
  const qs = await prisma.quotation.findMany({
    where: {
      OR: [
        { customerId: { in: testCustomerIds } },
        { title: { startsWith: T } },
      ],
    },
    select: { id: true },
  });
  if (qs.length > 0) {
    const ids = qs.map((q) => q.id);
    await prisma.quotationItem.deleteMany({
      where: { quotationId: { in: ids } },
    });
    await prisma.quotation.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(`✓ Quotation: ${qs.length}건`);

  // 6. Rentals (test customers)
  const rentalsDeleted = await prisma.rental.deleteMany({
    where: {
      OR: [
        { customerId: { in: testCustomerIds } },
        { rentalNo: { startsWith: "REN" }, memo: { startsWith: T } },
      ],
    },
  });
  console.log(`✓ Rental: ${rentalsDeleted.count}건`);

  // 7. RentalAsset
  const rentalAssetsDeleted = await prisma.rentalAsset.deleteMany({
    where: { name: { startsWith: T } },
  });
  console.log(`✓ RentalAsset: ${rentalAssetsDeleted.count}건`);

  // 8. RepairTicket (test customers OR repairProductText starts with T)
  const tickets = await prisma.repairTicket.findMany({
    where: {
      OR: [
        { customerId: { in: testCustomerIds } },
        { repairProductText: { startsWith: T } },
      ],
    },
    select: { id: true },
  });
  if (tickets.length > 0) {
    const ids = tickets.map((t) => t.id);
    // RepairPart, RepairLabor → cascade onDelete
    await prisma.repairTicket.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(`✓ RepairTicket: ${tickets.length}건`);

  // 9. Order (memo starts with T OR customer is test)
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { memo: { startsWith: T } },
        { customerId: { in: testCustomerIds } },
      ],
    },
    select: { id: true },
  });
  if (orders.length > 0) {
    const ids = orders.map((o) => o.id);
    // OrderItem → cascade
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(`✓ Order: ${orders.length}건`);

  // 10. Customer
  const cust = await prisma.customer.deleteMany({
    where: { name: { startsWith: T } },
  });
  console.log(`✓ Customer: ${cust.count}건`);

  // 11. ProductCategory
  const cats = await prisma.productCategory.deleteMany({
    where: { name: { startsWith: T } },
  });
  console.log(`✓ ProductCategory: ${cats.count}건`);

  console.log("\n✅ Cleanup 완료");
}

main()
  .catch((e) => {
    console.error("❌ Cleanup 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
