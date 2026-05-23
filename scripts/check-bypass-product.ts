import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const id = "78af733e-9eee-4b3c-9d94-38cf229b106f";

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      brandRef: { select: { name: true } },
      category: { select: { name: true } },
      inventory: { select: { quantity: true, safetyStock: true } },
      assemblyTemplate: {
        include: {
          slots: {
            include: {
              slotLabel: { select: { name: true } },
            },
            orderBy: { order: "asc" },
          },
        },
      },
      // 이 상품의 BOM (이 상품이 조립으로 만들어진다면 자식 부속)
      setComponents: {
        include: {
          component: { select: { id: true, name: true, sku: true, productType: true } },
          slotLabel: { select: { name: true } },
        },
      },
      // 이 상품이 다른 조립상품의 부속으로 들어가는 경우 (부모)
      partOfSets: {
        include: {
          setProduct: { select: { id: true, name: true, sku: true, productType: true } },
          slotLabel: { select: { name: true } },
        },
      },
      // canonical/variant
      canonicalProduct: { select: { id: true, name: true, sku: true } },
      variants: { select: { id: true, name: true, sku: true } },
    },
  });

  if (!product) {
    console.log("NOT FOUND");
    return;
  }

  console.log("=== 상품 기본 ===");
  console.log({
    id: product.id,
    name: product.name,
    sku: product.sku,
    productType: product.productType,
    brand: product.brandRef?.name,
    category: product.category?.name,
    listPrice: product.listPrice?.toString(),
    sellingPrice: product.sellingPrice?.toString(),
    isActive: product.isActive,
    inventory: product.inventory,
    canonicalProductId: product.canonicalProductId,
    isCanonical: product.isCanonical,
  });

  console.log("\n=== Canonical/Variant 관계 ===");
  console.log({
    canonicalProduct: product.canonicalProduct,
    variants: product.variants,
  });

  console.log("\n=== AssemblyTemplate (이 상품이 조립으로 만들어진다면) ===");
  if (product.assemblyTemplate) {
    console.log({
      id: product.assemblyTemplate.id,
      slots: product.assemblyTemplate.slots.map((s) => ({
        slotLabel: s.slotLabel?.name,
        order: s.order,
      })),
    });
  } else {
    console.log("없음 (완제품이라 슬롯 정의 안 됨)");
  }

  console.log("\n=== 이 상품의 BOM (자식 부속들) ===");
  console.log(
    product.setComponents.map((sc) => ({
      component: sc.component,
      slotLabel: sc.slotLabel?.name,
      quantity: sc.quantity?.toString(),
    })),
  );

  console.log("\n=== 이 상품이 부속으로 들어가는 조립상품들 (부모) ===");
  console.log(
    product.partOfSets.map((sc) => ({
      parent: sc.setProduct,
      slotLabel: sc.slotLabel?.name,
      quantity: sc.quantity?.toString(),
    })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
