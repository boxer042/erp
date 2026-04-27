import { prisma } from "@/lib/prisma";
import {
  computeSupplierProductAvgShipping,
  computeUnitCost,
} from "@/lib/cost-utils";
import { NewProductForm } from "@/components/new-product-form";
import type { ProductOption } from "@/components/product-combobox";

export default async function NewProductPage() {
  const [suppliers, channels, brands, categories, products] = await Promise.all([
    prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true, businessNumber: true },
      orderBy: { name: "asc" },
    }),
    prisma.salesChannel.findMany({
      where: { isActive: true },
      select: { id: true, name: true, commissionRate: true },
      orderBy: { name: "asc" },
    }),
    prisma.brand.findMany({
      where: { isActive: true },
      select: { id: true, name: true, logoUrl: true },
      orderBy: { name: "asc" },
    }),
    prisma.productCategory.findMany({
      where: { isActive: true, parentId: null },
      include: {
        children: {
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
        },
      },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
    prisma.product.findMany({
      where: { isActive: true },
      include: {
        productMappings: {
          include: {
            supplierProduct: {
              include: {
                incomingCosts: {
                  where: { isActive: true },
                  select: { costType: true, value: true, isTaxable: true },
                },
                incomingItems: {
                  where: { incoming: { status: "CONFIRMED" } },
                  select: {
                    totalPrice: true,
                    quantity: true,
                    incoming: {
                      select: {
                        shippingCost: true,
                        shippingIsTaxable: true,
                        shippingDeducted: true,
                        items: { select: { totalPrice: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const existingProducts: ProductOption[] = products.map((p) => {
    const firstMapping = p.productMappings[0];
    let unitCost: number | null = null;
    if (firstMapping) {
      const sp = firstMapping.supplierProduct;
      const { avgShippingCost, avgShippingIsTaxable } =
        computeSupplierProductAvgShipping(sp.incomingItems);
      unitCost = computeUnitCost({
        unitPrice: parseFloat(sp.unitPrice.toString()),
        conversionRate: parseFloat(firstMapping.conversionRate.toString()),
        incomingCosts: sp.incomingCosts.map((c) => ({
          costType: c.costType as "FIXED" | "PERCENTAGE",
          value: parseFloat(c.value.toString()),
          isTaxable: c.isTaxable,
        })),
        avgShippingCost,
        avgShippingIsTaxable,
      });
    }
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      sellingPrice: p.sellingPrice.toString(),
      unitCost: unitCost != null ? String(unitCost) : null,
      unitOfMeasure: p.unitOfMeasure,
      isSet: p.isSet,
      isCanonical: p.isCanonical,
      canonicalProductId: p.canonicalProductId,
    };
  });

  return (
    <NewProductForm
      suppliers={suppliers}
      brands={brands}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: null,
        children: c.children,
      }))}
      channels={channels.map((c) => ({
        id: c.id,
        name: c.name,
        commissionRate: c.commissionRate.toString(),
      }))}
      existingProducts={existingProducts}
    />
  );
}
