import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const products = await prisma.product.findMany({
    where: { name: { contains: "7HP" } },
    select: {
      id: true,
      name: true,
      sku: true,
      productType: true,
      isCanonical: true,
      canonicalProductId: true,
      sellingPrice: true,
      isActive: true,
      categoryId: true,
      assemblyTemplateId: true,
      inventory: { select: { quantity: true } },
    },
  });
  console.log("=== 7HP 검색 결과 ===");
  for (const p of products) {
    console.log({
      id: p.id,
      name: p.name,
      sku: p.sku,
      type: p.productType,
      isCanonical: p.isCanonical,
      canonicalProductId: p.canonicalProductId,
      price: p.sellingPrice?.toString(),
      inv: p.inventory?.quantity?.toString(),
      tplId: p.assemblyTemplateId,
      isActive: p.isActive,
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
