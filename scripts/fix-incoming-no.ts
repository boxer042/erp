import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const oldNo = "IN260420-JD8S";
  const newNo = "IN260318-JD8S";

  const incoming = await prisma.incoming.updateMany({
    where: { incomingNo: oldNo },
    data: { incomingNo: newNo },
  });
  console.log(`Incoming updated: ${incoming.count}`);

  const ledger = await prisma.supplierLedger.updateMany({
    where: { description: { contains: oldNo } },
    data: { description: `입고 ${newNo}` },
  });
  console.log(`SupplierLedger updated: ${ledger.count}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
