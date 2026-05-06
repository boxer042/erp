import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const [
    suppliers,
    supplierProducts,
    products,
    incomings,
    incomingItems,
    purchaseOrders,
    inventoryLots,
    orders,
    statements,
    quotations,
  ] = await Promise.all([
    prisma.supplier.count({ where: { isActive: true } }),
    prisma.supplierProduct.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.incoming.count(),
    prisma.incomingItem.count(),
    prisma.purchaseOrder.count(),
    prisma.inventoryLot.count(),
    prisma.order.count(),
    prisma.statement.count(),
    prisma.quotation.count(),
  ]);

  console.log("\n=== DB 데이터 카운트 ===\n");
  console.log(`거래처(active):     ${suppliers}`);
  console.log(`공급상품(active):   ${supplierProducts}`);
  console.log(`판매상품(active):   ${products}`);
  console.log(`입고:              ${incomings}`);
  console.log(`입고품목:           ${incomingItems}`);
  console.log(`발주:              ${purchaseOrders}`);
  console.log(`재고로트:           ${inventoryLots}`);
  console.log(`주문:              ${orders}`);
  console.log(`거래명세표:         ${statements}`);
  console.log(`견적서:            ${quotations}`);

  // 최근 입고 5건
  const recentIncomings = await prisma.incoming.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: {
      incomingNo: true,
      status: true,
      createdAt: true,
      supplier: { select: { name: true } },
    },
  });
  console.log("\n최근 입고 5건:");
  for (const inc of recentIncomings) {
    console.log(`  ${inc.incomingNo} ${inc.status} ${inc.supplier.name} ${inc.createdAt.toISOString()}`);
  }

  // 발주 5건
  const recentPos = await prisma.purchaseOrder.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: {
      poNo: true,
      status: true,
      createdAt: true,
      supplier: { select: { name: true } },
    },
  });
  console.log("\n최근 발주 5건:");
  if (recentPos.length === 0) console.log("  (없음)");
  for (const po of recentPos) {
    console.log(`  ${po.poNo} ${po.status} ${po.supplier.name} ${po.createdAt.toISOString()}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
