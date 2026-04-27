import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const products = await prisma.product.findMany({
    where: { brand: { not: null }, brandId: null },
    select: { id: true, brand: true },
  });

  const distinctBrandNames = Array.from(
    new Set(
      products
        .map((p) => (p.brand ?? "").trim())
        .filter((s) => s.length > 0),
    ),
  );

  console.log(`Distinct brands found: ${distinctBrandNames.length}`);

  const existing = await prisma.brand.findMany({
    where: { name: { in: distinctBrandNames } },
    select: { id: true, name: true },
  });
  const existingMap = new Map(existing.map((b) => [b.name, b.id]));

  const toCreate = distinctBrandNames.filter((n) => !existingMap.has(n));
  if (toCreate.length > 0) {
    await prisma.brand.createMany({
      data: toCreate.map((name) => ({ name })),
      skipDuplicates: true,
    });
  }

  const allBrands = await prisma.brand.findMany({
    where: { name: { in: distinctBrandNames } },
    select: { id: true, name: true },
  });
  const brandMap = new Map(allBrands.map((b) => [b.name, b.id]));

  const ops = products.map((p) => {
    const trimmed = (p.brand ?? "").trim();
    const brandId = brandMap.get(trimmed);
    if (!brandId) return null;
    return prisma.product.update({
      where: { id: p.id },
      data: { brandId },
    });
  }).filter((x): x is Exclude<typeof x, null> => x !== null);

  await Promise.all(ops);
  console.log(`Products linked to brands: ${ops.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
