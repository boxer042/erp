import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const ids = [
    "28de9722-f5d5-439c-9dd2-f393aeaf916a",
    "72f62545-d77e-49b0-bd34-39b7941403be",
    "fc8d59c3-2dac-475a-b5eb-363f2c344f8d",
  ];

  const parents = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: {
      inventory: { select: { quantity: true } },
      assemblyTemplate: {
        include: {
          slots: {
            include: { slotLabel: { select: { name: true } } },
            orderBy: { order: "asc" },
          },
        },
      },
      canonicalProduct: { select: { id: true, name: true, sku: true } },
      variants: { select: { id: true, name: true, sku: true } },
      setComponents: {
        include: {
          component: { select: { name: true, sku: true } },
          slotLabel: { select: { name: true } },
        },
      },
    },
  });

  for (const p of parents) {
    if (!p.isCanonical) continue;
    console.log("\n===", p.name, "(", p.sku, ") — Slot 디테일 ===");
    console.log(
      JSON.stringify(
        p.assemblyTemplate?.slots.map((s) => ({
          label: s.label,
          slotLabel: s.slotLabel?.name,
          isVariable: s.isVariable,
        })),
        null,
        2,
      ),
    );
    continue;
    console.log({
      isCanonical: p.isCanonical,
      canonicalProductId: p.canonicalProductId,
      canonicalProduct: p.canonicalProduct,
      variantsCount: p.variants.length,
      inventory: p.inventory?.quantity?.toString(),
      assemblyTemplate: p.assemblyTemplate
        ? {
            name: p.assemblyTemplate.name,
            slots: p.assemblyTemplate.slots.map((s) => ({
              label: s.label,
              slotLabel: s.slotLabel?.name,
              isVariable: s.isVariable,
            })),
          }
        : null,
      bom: p.setComponents.map((sc) => ({
        component: sc.component?.name,
        sku: sc.component?.sku,
        slotLabel: sc.slotLabel?.name,
        qty: sc.quantity.toString(),
      })),
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
