import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supplierProductSchema } from "@/lib/validators/product";
import { computeSupplierProductAvgShipping } from "@/lib/cost-utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get("supplierId");
  const search = searchParams.get("search") || "";

  const products = await prisma.supplierProduct.findMany({
    where: {
      ...(supplierId ? { supplierId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { supplierCode: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      isActive: true,
    },
    include: {
      supplier: { select: { name: true } },
      productMappings: {
        select: {
          id: true,
          conversionRate: true,
          product: { select: { id: true, name: true, sku: true, sellingPrice: true } },
        },
      },
      _count: { select: { incomingItems: true } },
      incomingCosts: { where: { isActive: true }, select: { id: true, name: true, costType: true, value: true, perUnit: true, isTaxable: true } },
      priceHistory: { orderBy: { createdAt: "desc" }, take: 1, select: { oldPrice: true, newPrice: true } },
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
    orderBy: { createdAt: "desc" },
  });

  const productsWithAvgShipping = products.map((p) => {
    const { avgShippingCost } = computeSupplierProductAvgShipping(p.incomingItems);
    const { incomingItems, ...rest } = p;
    return { ...rest, avgShippingCost };
  });

  return NextResponse.json(productsWithAvgShipping);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = supplierProductSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const product = await prisma.supplierProduct.create({
    data: {
      supplierId: data.supplierId,
      name: data.name,
      spec: data.spec || null,
      supplierCode: data.supplierCode || null,
      unitOfMeasure: data.unitOfMeasure,
      listPrice: parseFloat(data.listPrice ?? data.unitPrice),
      unitPrice: parseFloat(data.unitPrice),
      isTaxable: data.isTaxable,
      isProvisional: data.isProvisional,
      currency: data.currency,
      leadTimeDays: data.leadTimeDays,
      minOrderQty: data.minOrderQty,
      memo: data.memo || null,
    },
  });

  return NextResponse.json(product, { status: 201 });
}
