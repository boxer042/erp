import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function run() {
  const inventories = await prisma.inventory.findMany({
    include: { product: { select: { name: true, sku: true } } },
  });

  console.log("\n=== Inventory 현황 ===");
  for (const inv of inventories) {
    const lotSum = await prisma.inventoryLot.aggregate({
      where: { productId: inv.productId },
      _sum: { receivedQty: true, remainingQty: true },
    });
    console.log(
      `[${inv.product.sku ?? "-"}] ${inv.product.name}`
    );
    console.log(
      `  Inventory.quantity=${inv.quantity}  avgCost=${inv.avgCost ?? "null"}`
    );
    console.log(
      `  Lot Σ receivedQty=${lotSum._sum.receivedQty ?? 0}  Σ remainingQty=${lotSum._sum.remainingQty ?? 0}`
    );
  }

  console.log("\n=== 오르판 로트 (productId=null, 매핑 전) ===");
  const orphans = await prisma.inventoryLot.findMany({
    where: { productId: null },
    include: { supplierProduct: { select: { name: true, supplierCode: true } } },
  });
  for (const lot of orphans) {
    console.log(
      `  [${lot.supplierProduct?.supplierCode ?? "-"}] ${lot.supplierProduct?.name ?? "-"}  received=${lot.receivedQty} remaining=${lot.remainingQty} source=${lot.source}`
    );
  }

  console.log("\n=== 보존 확인 ===");
  console.log(`  Suppliers:        ${await prisma.supplier.count()}`);
  console.log(`  SupplierProducts: ${await prisma.supplierProduct.count()}`);
  console.log(`  Products:         ${await prisma.product.count()}`);
  console.log(`  Incomings:        ${await prisma.incoming.count()}`);
  console.log(`  IncomingItems:    ${await prisma.incomingItem.count()}`);
  console.log(`  InventoryLots:    ${await prisma.inventoryLot.count()}`);
  console.log(`  InventoryMovements: ${await prisma.inventoryMovement.count()}`);
  console.log(`  SupplierLedgers:  ${await prisma.supplierLedger.count()}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
