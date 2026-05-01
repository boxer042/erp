import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supplierProductSchema } from "@/lib/validators/product";
import { computeSupplierProductAvgShipping } from "@/lib/cost-utils";
import { computeShippingPerUnitDisplay } from "@/lib/incoming-shipping";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const product = await prisma.supplierProduct.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true } },
      productMappings: {
        include: {
          product: {
            select: {
              id: true, name: true, sku: true, sellingPrice: true, taxType: true,
              sellingCosts: { where: { isActive: true } },
            },
          },
        },
      },
      incomingCosts: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      incomingItems: {
        where: { incoming: { status: "CONFIRMED" } },
        select: {
          id: true, quantity: true, unitPrice: true, totalPrice: true, unitCostSnapshot: true,
          itemShippingCost: true, itemShippingIsTaxable: true,
          incoming: {
            select: {
              id: true, incomingNo: true, incomingDate: true,
              shippingCost: true, shippingIsTaxable: true, shippingDeducted: true,
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
        orderBy: { incoming: { incomingDate: "desc" } },
      },
      priceHistory: { orderBy: { createdAt: "desc" } },
      inventoryLots: {
        where: { remainingQty: { gt: 0 } },
        orderBy: { receivedAt: "asc" }, // FIFO: 가장 오래된 = 다음 소진 대상
        select: {
          id: true,
          productId: true,
          receivedQty: true,
          remainingQty: true,
          unitCost: true,
          receivedAt: true,
          source: true,
          incomingItemId: true,
          product: { select: { id: true, name: true, sku: true } },
          incomingItem: {
            select: {
              id: true,
              quantity: true,
              totalPrice: true,
              itemShippingCost: true,
              itemShippingIsTaxable: true,
              incoming: {
                select: {
                  id: true,
                  incomingNo: true,
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
  });

  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 같은 입고전표 내 아이템을 1행으로 그룹화 (10+1 등 동일 공급상품 복수 행 → 합산)
  const grouped = new Map<string, typeof product.incomingItems>();
  for (const item of product.incomingItems) {
    const key = item.incoming.id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  const incomingRows = Array.from(grouped.values()).map((items) => {
    const totalQty = items.reduce((s, i) => s + parseFloat(i.quantity.toString()), 0);
    const totalPrice = items.reduce((s, i) => s + parseFloat(i.totalPrice.toString()), 0);
    const effectiveUnitPrice = totalQty > 0 ? totalPrice / totalQty : 0;
    const unitCostSnapshot = parseFloat((items[0].unitCostSnapshot ?? 0).toString());

    // 새 우선순위: 품목 itemShippingCost > 분배 (override 제외 분모)
    const sib = items[0].incoming.items;
    const allocBase = sib.reduce((s, x) => {
      return x.itemShippingCost == null || x.itemShippingCost === undefined
        ? s + parseFloat(x.totalPrice.toString())
        : s;
    }, 0);
    const headerShipping = parseFloat(items[0].incoming.shippingCost.toString());

    let shippingAllocation = 0;
    let shippingPercent = 0;
    let shippingIsTaxable = items[0].incoming.shippingIsTaxable;
    let hasItemOverride = false;
    let hasAllocated = false;

    // 그룹 내 모든 행 합산 (10+1 동일 공급상품 묶음)
    for (const it of items) {
      if (it.itemShippingCost != null && it.itemShippingCost !== undefined) {
        shippingAllocation += parseFloat(it.itemShippingCost.toString());
        shippingIsTaxable = it.itemShippingIsTaxable ?? shippingIsTaxable;
        hasItemOverride = true;
      } else if (!items[0].incoming.shippingDeducted && allocBase > 0 && headerShipping > 0) {
        const portion = (parseFloat(it.totalPrice.toString()) / allocBase) * headerShipping;
        shippingAllocation += portion;
        hasAllocated = true;
      } else if (items[0].incoming.shippingDeducted) {
        hasAllocated = true; // 차감 대상 (분배되었어야 할 행)
      }
    }
    if (allocBase > 0) {
      shippingPercent = (totalPrice / allocBase) * 100;
    }

    return {
      id: items[0].id,
      quantity: totalQty,
      unitPrice: effectiveUnitPrice,
      totalPrice,
      unitCostSnapshot,
      shippingAllocation,
      shippingPercent,
      shippingIsTaxable,
      hasItemOverride,
      hasAllocated,
      incoming: {
        id: items[0].incoming.id,
        incomingNo: items[0].incoming.incomingNo,
        incomingDate: items[0].incoming.incomingDate,
        shippingCost: items[0].incoming.shippingCost,
        shippingIsTaxable: items[0].incoming.shippingIsTaxable,
        shippingDeducted: items[0].incoming.shippingDeducted,
      },
    };
  });

  // 평균 배송비 — itemShippingCost override 우선, 분배 다음. 새 통합 헬퍼 사용
  const { avgShippingCost, avgShippingIsTaxable } = computeSupplierProductAvgShipping(
    product.incomingItems
  );

  // productId 별 conversionRate (lot 단위 환산용)
  const convRateByProductId = new Map<string, number>();
  for (const m of product.productMappings) {
    convRateByProductId.set(m.product.id, Number(m.conversionRate) || 1);
  }

  // 잔여 로트에 "어떤 배송비가 적용 중인지" 효과값 + 출처 라벨 부여
  // shippingPerUnit 은 lot 단위(매핑된 lot 이면 product 단위)로 환산 — lot.unitCost 와 단위 일치
  const lotsWithShipping = (product.inventoryLots ?? []).map((lot, idx) => {
    let perUnit = 0;
    let isTaxable = false;
    let source: "ITEM" | "ALLOCATED" | "DEDUCTED" | "ZERO" = "ZERO";
    let incomingId: string | null = null;
    let incomingNo: string | null = null;

    if (lot.incomingItem) {
      const it = lot.incomingItem;
      incomingId = it.incoming.id;
      incomingNo = it.incoming.incomingNo;
      const sib = it.incoming.items.map((s) => ({
        id: s.id,
        quantity: Number(s.quantity),
        totalPrice: Number(s.totalPrice),
        itemShippingCost:
          s.itemShippingCost === null || s.itemShippingCost === undefined ? null : Number(s.itemShippingCost),
        itemShippingIsTaxable: s.itemShippingIsTaxable,
      }));
      const map = computeShippingPerUnitDisplay(sib, {
        shippingCost: Number(it.incoming.shippingCost),
        shippingIsTaxable: it.incoming.shippingIsTaxable,
        shippingDeducted: it.incoming.shippingDeducted,
      });
      const eff = map.get(it.id);
      if (eff) {
        const conv = lot.productId ? convRateByProductId.get(lot.productId) ?? 1 : 1;
        perUnit = eff.perUnit / conv;
        isTaxable = eff.isTaxable;
        source = eff.source;
      }
    }
    // FIFO 첫 행이 다음 소진 대상 (사용 중)
    return {
      id: lot.id,
      receivedAt: lot.receivedAt,
      receivedQty: lot.receivedQty,
      remainingQty: lot.remainingQty,
      unitCost: lot.unitCost,
      source: lot.source,
      product: lot.product,
      incomingId,
      incomingNo,
      shippingPerUnit: perUnit,
      shippingIsTaxable: isTaxable,
      shippingSource: source,
      isCurrentlyConsuming: idx === 0,
    };
  });

  const { incomingItems: _incomingItems, inventoryLots: _il, ...rest } = product;

  return NextResponse.json({
    ...rest,
    incomingItems: incomingRows,
    avgShippingCost,
    avgShippingIsTaxable,
    activeLots: lotsWithShipping,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = supplierProductSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const product = await prisma.supplierProduct.update({
    where: { id },
    data: {
      supplierId: data.supplierId,
      name: data.name,
      spec: data.spec || null,
      supplierCode: data.supplierCode || null,
      unitOfMeasure: data.unitOfMeasure,
      listPrice: parseFloat(data.listPrice ?? data.unitPrice),
      unitPrice: parseFloat(data.unitPrice),
      isTaxable: data.isTaxable,
      currency: data.currency,
      leadTimeDays: data.leadTimeDays,
      minOrderQty: data.minOrderQty,
      memo: data.memo || null,
    },
  });

  return NextResponse.json(product);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.supplierProduct.update({
    where: { id },
    data: { isActive: false },
  });
  return NextResponse.json({ success: true });
}
