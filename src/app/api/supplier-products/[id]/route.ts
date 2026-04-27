import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supplierProductSchema } from "@/lib/validators/product";

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
          incoming: {
            select: {
              id: true, incomingNo: true, incomingDate: true,
              shippingCost: true, shippingIsTaxable: true, shippingDeducted: true,
              items: { select: { totalPrice: true } },
            },
          },
        },
        orderBy: { incoming: { incomingDate: "desc" } },
      },
      priceHistory: { orderBy: { createdAt: "desc" } },
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

    const incomingTotal = items[0].incoming.items.reduce(
      (s, i) => s + parseFloat(i.totalPrice.toString()), 0
    );
    const shippingCost = parseFloat(items[0].incoming.shippingCost.toString());
    let shippingAllocation = 0;
    let shippingPercent = 0;
    if (incomingTotal > 0 && shippingCost > 0) {
      shippingPercent = (totalPrice / incomingTotal) * 100;
      shippingAllocation = (totalPrice / incomingTotal) * shippingCost;
    }

    return {
      id: items[0].id,
      quantity: totalQty,
      unitPrice: effectiveUnitPrice,
      totalPrice,
      unitCostSnapshot,
      shippingAllocation,
      shippingPercent,
      shippingIsTaxable: items[0].incoming.shippingIsTaxable,
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

  // 평균 배송비 — 차감결제(거래처 부담) 건은 제외
  const allocableRows = incomingRows.filter(
    (r) => !r.incoming.shippingDeducted && r.shippingAllocation > 0,
  );
  const perUnitAllocs = allocableRows.map((r) => ({
    perUnit: r.shippingAllocation / (r.quantity || 1),
    isTaxable: r.shippingIsTaxable,
  }));
  const avgShippingCost = perUnitAllocs.length > 0
    ? perUnitAllocs.reduce((sum, v) => sum + v.perUnit, 0) / perUnitAllocs.length
    : null;
  const taxableAmount = perUnitAllocs.reduce((sum, v) => sum + (v.isTaxable ? v.perUnit : 0), 0);
  const totalAmount = perUnitAllocs.reduce((sum, v) => sum + v.perUnit, 0);
  const avgShippingIsTaxable = totalAmount > 0 ? taxableAmount / totalAmount >= 0.5 : false;

  const { incomingItems: _incomingItems, ...rest } = product;

  return NextResponse.json({ ...rest, incomingItems: incomingRows, avgShippingCost, avgShippingIsTaxable });
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
