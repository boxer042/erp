import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  computeSupplierProductAvgShipping,
  computeUnitCost,
} from "@/lib/cost-utils";
import { NewProductForm } from "@/components/new-product-form";
import type { ProductOption } from "@/components/product-combobox";
import type { ProductDetail } from "@/components/product/types";
import type { SupplierProduct } from "@/components/new-product-form/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductEditPage({ params }: PageProps) {
  const { id } = await params;

  const [product, suppliers, channels, brands, categories, products] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        inventory: true,
        brandRef: { select: { id: true, name: true, logoUrl: true } },
        category: { select: { id: true, name: true } },
        bulkProduct: {
          select: { id: true, name: true, sku: true, containerSize: true, unitOfMeasure: true, sellingPrice: true },
        },
        productMappings: {
          include: {
            supplierProduct: {
              include: {
                supplier: { select: { id: true, name: true } },
                incomingCosts: { where: { isActive: true } },
              },
            },
          },
        },
        setComponents: {
          include: { component: { select: { id: true, name: true, sku: true } } },
        },
        channelPricings: {
          include: { channel: { select: { id: true, name: true, code: true } } },
        },
        sellingCosts: { where: { isActive: true } },
        media: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    }),
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
      where: { isActive: true, id: { not: id } },
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

  if (!product || !product.isActive) notFound();

  // 매핑된 거래처의 공급상품 풀로드 (combobox 즉시 사용)
  const mappingSupplierId = product.productMappings[0]?.supplierProduct.supplier.id ?? null;
  const supplierProducts = mappingSupplierId
    ? await prisma.supplierProduct.findMany({
        where: { supplierId: mappingSupplierId, isActive: true },
        include: { incomingCosts: { where: { isActive: true } } },
        orderBy: { name: "asc" },
      })
    : [];

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

  // Decimal/Date → string 직렬화
  const productJson = JSON.parse(JSON.stringify(product)) as ProductDetail;
  const supplierProductsJson = JSON.parse(JSON.stringify(supplierProducts)) as SupplierProduct[];

  return (
    <NewProductForm
      mode="edit"
      productId={id}
      initialData={{ product: productJson, supplierProducts: supplierProductsJson }}
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
