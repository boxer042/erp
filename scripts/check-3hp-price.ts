import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const p = await prisma.product.findUnique({
    where: { id: "fc8d59c3-2dac-475a-b5eb-363f2c344f8d" },
    select: {
      id: true,
      name: true,
      sku: true,
      productType: true,
      isCanonical: true,
      sellingPrice: true,
      listPrice: true,
      taxRate: true,
      taxType: true,
      categoryId: true,
      assemblyTemplateId: true,
    },
  });
  console.log("3HP canonical:", p);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
