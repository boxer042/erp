import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function run() {
  const inc = await prisma.incoming.findFirst({
    where: { incomingNo: "IN260428-V53Z" },
    include: {
      supplier: { select: { name: true, paymentMethod: true } },
      items: {
        include: {
          supplierProduct: { select: { name: true, isTaxable: true } },
        },
      },
    },
  });
  if (!inc) {
    console.log("[연결 OK] IN260428-V53Z 없음");
    return;
  }
  console.log("[연결 OK]");
  console.log("incomingNo:", inc.incomingNo);
  console.log("status:", inc.status);
  console.log("supplier:", inc.supplier.name, inc.supplier.paymentMethod);
  console.log("totalAmount(DB):", inc.totalAmount.toString());
  console.log("\n--- items ---");
  let supplySum = 0;
  let perItemTaxSum = 0;
  for (const i of inc.items) {
    const supply = Number(i.totalPrice);
    const tax = i.supplierProduct.isTaxable ? Math.round(supply * 0.1) : 0;
    supplySum += supply;
    perItemTaxSum += tax;
    console.log(
      `[${i.supplierProduct.name}] qty=${i.quantity}, unitPrice=${i.unitPrice}, totalPrice=${i.totalPrice}, isTaxable=${i.supplierProduct.isTaxable}`,
    );
  }
  console.log("\n--- 진단 ---");
  console.log("supply 합계:", supplySum);
  console.log("ledger식 합계 (Σ supply + round(supply×0.1)):", supplySum + perItemTaxSum);

  const ledger = await prisma.supplierLedger.findFirst({
    where: { referenceId: inc.id, referenceType: "INCOMING", type: "PURCHASE" },
  });
  if (ledger) {
    console.log("\n--- 원장 PURCHASE entry ---");
    console.log("debitAmount:", ledger.debitAmount.toString());
    console.log("balance:", ledger.balance.toString());
  }
}

run().finally(() => prisma.$disconnect());
