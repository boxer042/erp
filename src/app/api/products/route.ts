import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productSchema } from "@/lib/validators/product";
import { computeUnitCost, computeSupplierProductAvgShipping } from "@/lib/cost-utils";
import { guardUser } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const isSet = searchParams.get("isSet");
  const isBulk = searchParams.get("isBulk"); // "true" | "false" | null (기본: false 필터)
  const categoryId = searchParams.get("categoryId");
  const excludeVariants = searchParams.get("excludeVariants") === "true"; // POS 등에서 변형 상품 가리기

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { sku: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(isSet !== null ? { isSet: isSet === "true" } : {}),
      // 기본은 벌크 SKU 제외. 명시적으로 isBulk=true로 요청해야 벌크만, isBulk=all로 전체
      ...(isBulk === "true"
        ? { isBulk: true }
        : isBulk === "all"
          ? {}
          : { isBulk: false }),
      ...(categoryId ? { categoryId } : {}),
      ...(excludeVariants ? { canonicalProductId: null } : {}),
    },
    include: {
      inventory: { select: { quantity: true, safetyStock: true } },
      channelPricings: { include: { channel: { select: { name: true } } } },
      setComponents: {
        include: { component: { select: { name: true, sku: true } } },
      },
      variants: {
        select: {
          id: true,
          name: true,
          sku: true,
          inventory: { select: { quantity: true } },
        },
      },
      canonicalProduct: { select: { id: true, name: true, sku: true } },
      productMappings: {
        include: {
          supplierProduct: {
            include: {
              supplier: { select: { name: true } },
              incomingCosts: {
                where: { isActive: true },
                select: { costType: true, value: true, isTaxable: true },
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
      // 벌크 SKU는 자체 매핑이 없으므로 부모 판매용기에서 단위 원가 환산
      salesContainers: {
        where: { isActive: true },
        take: 1,
        select: {
          containerSize: true,
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
    orderBy: { createdAt: "desc" },
  });

  const productsWithUnitCost = products.map((p) => {
    // 한 상품에 매핑이 여러 개면 첫 번째만 표시값(unitCost/공급단가/배송비/부대비용)에 반영
    // 향후 정책 결정 필요: 정식(isProvisional=false) 우선 / createdAt asc 등
    const firstMapping = p.productMappings[0];
    let unitCost: number | null = null;
    let supplierUnitPrice = 0;
    let shippingPerUnit = 0;
    let incomingCostPerUnit = 0;
    if (firstMapping) {
      const sp = firstMapping.supplierProduct;
      const conv = parseFloat(firstMapping.conversionRate.toString()) || 1;
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
      incomingCostPerUnit = unitCost - supplierUnitPrice; // 부대비용 = 전체 - 공급단가
      // 단, computeUnitCost 는 배송비 미포함이므로 unitCost 자체는 supplier+incomingCost 만 합산 → 분리 정확
      // shippingPerUnit 는 unitCost 와 별개로 추가 비용
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
      }
    }

    const sanitizedMappings = p.productMappings.map((m) => {
      const { incomingCosts: _ic, incomingItems: _ii, ...spRest } = m.supplierProduct;
      return { ...m, supplierProduct: spRest };
    });

    const { salesContainers: _sc, ...rest } = p;
    return {
      ...rest,
      productMappings: sanitizedMappings,
      unitCost,
      supplierUnitPrice,
      shippingPerUnit,
      incomingCostPerUnit,
    };
  });

  return NextResponse.json(productsWithUnitCost);
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const body = await request.json();
  const parsed = productSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // SKU 중복 확인
  const existing = await prisma.product.findUnique({ where: { sku: data.sku } });
  if (existing) {
    return NextResponse.json({ error: "이미 존재하는 SKU입니다" }, { status: 409 });
  }

  const isSet = data.productType === "SET" || data.productType === "ASSEMBLED";

  // 대표 상품 / 변형 정합성 체크
  if (data.isCanonical && data.canonicalProductId) {
    return NextResponse.json(
      { error: "대표 상품은 다른 대표 상품의 변형이 될 수 없습니다" },
      { status: 400 },
    );
  }

  const product = await prisma.$transaction(async (tx) => {
    // 1. createBulk가 지정되면 벌크 SKU 먼저 생성 — 가격은 병 sellingPrice ÷ containerSize 자동 환산
    let resolvedBulkProductId: string | null = null;
    if (data.createBulk) {
      const bottlePrice = parseFloat(data.sellingPrice);
      const containerSizeNum = data.containerSize ? parseFloat(data.containerSize) : 0;
      const bulkPrice =
        containerSizeNum > 0 && bottlePrice > 0 ? bottlePrice / containerSizeNum : 0;
      const bulkSku = `BULK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const bulk = await tx.product.create({
        data: {
          name: data.createBulk.name,
          sku: bulkSku,
          unitOfMeasure: data.createBulk.unitOfMeasure,
          productType: "PARTS",
          taxType: data.taxType,
          taxRate: parseFloat(data.taxRate),
          listPrice: bulkPrice,
          sellingPrice: bulkPrice,
          isBulk: true,
          inventory: { create: { quantity: 0, safetyStock: 0 } },
        },
      });
      resolvedBulkProductId = bulk.id;
    }

    // 2. 판매 SKU 생성
    const containerSize = data.containerSize ? parseFloat(data.containerSize) : null;
    return tx.product.create({
      data: {
        name: data.name,
        brand: data.brand || null,
        brandId: data.brandId || null,
        modelName: data.modelName || null,
        spec: data.spec || null,
        sku: data.sku,
        description: data.description || null,
        unitOfMeasure: data.unitOfMeasure,
        productType: data.productType,
        taxType: data.taxType,
        taxRate: parseFloat(data.taxRate),
        listPrice: parseFloat(data.listPrice ?? data.sellingPrice),
        sellingPrice: parseFloat(data.sellingPrice),
        isSet,
        isCanonical: data.isCanonical ?? false,
        canonicalProductId: data.canonicalProductId || null,
        containerSize: containerSize && containerSize > 0 ? containerSize : null,
        bulkProductId: resolvedBulkProductId,
        memo: data.memo || null,
        categoryId: data.categoryId || null,
        assemblyTemplateId: data.assemblyTemplateId || null,
        zeroRateEligible: data.zeroRateEligible ?? false,
        inventory: data.isCanonical
          ? undefined  // canonical은 자체 재고를 갖지 않음
          : { create: { quantity: 0, safetyStock: 1 } },
      },
    });
  });

  return NextResponse.json(product, { status: 201 });
}
