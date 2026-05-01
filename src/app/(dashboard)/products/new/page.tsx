import { prisma } from "@/lib/prisma";
import { computeUnitCost, computeSupplierProductAvgShipping } from "@/lib/cost-utils";
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
                supplier: { select: { id: true, name: true } },
                incomingCosts: {
                  where: { isActive: true },
                  select: { id: true, name: true, costType: true, value: true, isTaxable: true },
                },
                incomingItems: {
                  where: { incoming: { status: "CONFIRMED" } },
                  select: {
                    id: true,
                    totalPrice: true,
                    quantity: true,
                    itemShippingCost: true,
                    itemShippingIsTaxable: true,
                    incoming: {
                      select: {
                        shippingCost: true,
                        shippingIsTaxable: true,
                        shippingDeducted: true,
                        items: {
                          select: {
                            id: true,
                            totalPrice: true,
                            quantity: true,
                            itemShippingCost: true,
                            itemShippingIsTaxable: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        // 벌크 SKU의 부모 판매용기 매핑(=환산 원가) 동반 조회
        salesContainers: {
          where: { isActive: true },
          take: 1,
          select: {
            containerSize: true,
            productMappings: {
              include: {
                supplierProduct: {
                  include: {
                    supplier: { select: { id: true, name: true } },
                    incomingCosts: {
                      where: { isActive: true },
                      select: { id: true, name: true, costType: true, value: true, isTaxable: true },
                    },
                    incomingItems: {
                      where: { incoming: { status: "CONFIRMED" } },
                      select: {
                        id: true,
                        totalPrice: true,
                        quantity: true,
                        itemShippingCost: true,
                        itemShippingIsTaxable: true,
                        incoming: {
                          select: {
                            shippingCost: true,
                            shippingIsTaxable: true,
                            shippingDeducted: true,
                            items: {
                              select: {
                                id: true,
                                totalPrice: true,
                                quantity: true,
                                itemShippingCost: true,
                                itemShippingIsTaxable: true,
                              },
                            },
                          },
                        },
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
    // 매핑 여러 개일 때 정책은 첫 번째만 사용 (향후 정식 우선 등으로 변경 가능)
    const firstMapping = p.productMappings[0];
    let unitCost: number | null = null;
    let supplierUnitPrice = 0;
    let shippingPerUnit = 0;
    let incomingCostPerUnit = 0;
    let supplierName: string | null = null;
    let supplierProductName: string | null = null;
    let incomingCostList: Array<{ name: string; costType: string; value: number; isTaxable: boolean }> = [];
    if (firstMapping) {
      const sp = firstMapping.supplierProduct;
      const conv = parseFloat(firstMapping.conversionRate.toString()) || 1;
      supplierName = sp.supplier?.name ?? null;
      supplierProductName = sp.name;
      incomingCostList = sp.incomingCosts.map((c) => ({
        name: c.name,
        costType: c.costType,
        value: parseFloat(c.value.toString()),
        isTaxable: c.isTaxable,
      }));
      unitCost = computeUnitCost({
        unitPrice: parseFloat(sp.unitPrice.toString()),
        conversionRate: conv,
        incomingCosts: sp.incomingCosts.map((c) => ({
          costType: c.costType as "FIXED" | "PERCENTAGE",
          value: parseFloat(c.value.toString()),
          isTaxable: c.isTaxable,
        })),
      });
      supplierUnitPrice = parseFloat(sp.unitPrice.toString()) / conv;
      const { avgShippingCost, avgShippingIsTaxable } = computeSupplierProductAvgShipping(sp.incomingItems);
      const avgShipRaw = avgShippingCost !== null ? avgShippingCost / conv : 0;
      shippingPerUnit = avgShippingIsTaxable ? avgShipRaw / 1.1 : avgShipRaw;
      incomingCostPerUnit = unitCost - supplierUnitPrice;
    } else if (p.isBulk && p.salesContainers[0]) {
      const container = p.salesContainers[0];
      const cMapping = container.productMappings[0];
      const containerSizeNum = container.containerSize
        ? parseFloat(container.containerSize.toString())
        : 0;
      if (cMapping && containerSizeNum > 0) {
        const sp = cMapping.supplierProduct;
        const conv = parseFloat(cMapping.conversionRate.toString()) || 1;
        const containerUnitCost = computeUnitCost({
          unitPrice: parseFloat(sp.unitPrice.toString()),
          conversionRate: conv,
          incomingCosts: sp.incomingCosts.map((c) => ({
            costType: c.costType as "FIXED" | "PERCENTAGE",
            value: parseFloat(c.value.toString()),
            isTaxable: c.isTaxable,
          })),
        });
        unitCost = containerUnitCost / containerSizeNum;
        const containerSupplierUnit = parseFloat(sp.unitPrice.toString()) / conv;
        supplierUnitPrice = containerSupplierUnit / containerSizeNum;
        incomingCostPerUnit = unitCost - supplierUnitPrice;
        const { avgShippingCost, avgShippingIsTaxable } = computeSupplierProductAvgShipping(sp.incomingItems);
        const avgShipRaw = avgShippingCost !== null ? avgShippingCost / conv : 0;
        const containerShipping = avgShippingIsTaxable ? avgShipRaw / 1.1 : avgShipRaw;
        shippingPerUnit = containerShipping / containerSizeNum;

        // 벌크 부품의 매핑 정보 — 부모 병에서 환산해서 채움
        supplierName = sp.supplier?.name ?? null;
        supplierProductName = `${sp.name} (벌크 부모)`;
        incomingCostList = sp.incomingCosts.map((c) => ({
          name: c.name,
          costType: c.costType,
          // FIXED 는 컨테이너 사이즈로 환산, PERCENTAGE 는 비율 그대로
          value:
            c.costType === "FIXED"
              ? parseFloat(c.value.toString()) / containerSizeNum
              : parseFloat(c.value.toString()),
          isTaxable: c.isTaxable,
        }));
      }
    }
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      sellingPrice: p.sellingPrice.toString(),
      unitCost: unitCost != null ? String(unitCost) : null,
      supplierUnitPrice,
      shippingPerUnit,
      incomingCostPerUnit,
      supplierName,
      supplierProductName,
      incomingCostList,
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
