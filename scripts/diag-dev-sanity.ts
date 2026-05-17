import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const [
    suppliers,
    customers,
    products,
    incomings,
    orders,
    ledgers,
    repairs,
  ] = await Promise.all([
    prisma.supplier.count(),
    prisma.customer.count(),
    prisma.product.count(),
    prisma.incoming.count(),
    prisma.order.count(),
    prisma.supplierLedger.count(),
    prisma.repairTicket.count(),
  ]);

  console.log("=== DEV DB row counts ===");
  console.log(`suppliers      ${suppliers}`);
  console.log(`customers      ${customers}`);
  console.log(`products       ${products}`);
  console.log(`incomings      ${incomings}`);
  console.log(`orders         ${orders}`);
  console.log(`supplierLedgers ${ledgers}`);
  console.log(`repairTickets  ${repairs}`);

  const gs = await prisma.supplier.findFirst({
    where: { name: { contains: "GS글로벌 천안" } },
    select: { id: true, name: true, paymentMethod: true },
  });
  console.log("\nGS글로벌 천안센터:", gs);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
