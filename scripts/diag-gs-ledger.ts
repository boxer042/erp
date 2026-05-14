import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const supplier = await prisma.supplier.findFirst({
    where: { name: { contains: "GS글로벌 천안" } },
    select: { id: true, name: true, paymentMethod: true, isActive: true },
  });
  if (!supplier) {
    console.log("NOT FOUND");
    return;
  }
  console.log("SUPPLIER:", JSON.stringify(supplier, null, 2));

  console.log("\n=== INCOMING (raw) ===");
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "Incoming" WHERE "supplierId" = $1 ORDER BY "createdAt" DESC LIMIT 3`,
    supplier.id,
  );
  for (const r of rows) {
    console.log(JSON.stringify(r, null, 2));
  }

  if (rows.length > 0) {
    console.log("\n=== INCOMING ITEMS (raw) ===");
    const items = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "IncomingItem" WHERE "incomingId" = $1`,
      rows[0].id,
    );
    for (const it of items) {
      console.log(JSON.stringify(it, null, 2));
    }
  }

  console.log("\n=== LEDGERS ===");
  const ledgers = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id, date, type, description, "debitAmount", "creditAmount", balance, "referenceId", "referenceType", "createdAt"
     FROM "SupplierLedger" WHERE "supplierId" = $1 ORDER BY date DESC, "createdAt" DESC LIMIT 10`,
    supplier.id,
  );
  for (const l of ledgers) {
    console.log(JSON.stringify(l));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
