import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productMappingSchema } from "@/lib/validators/product";
import { reconcileOrphanLotsForMapping } from "@/lib/mapping-helpers";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const supplierProductId = searchParams.get("supplierProductId");

  const mappings = await prisma.productMapping.findMany({
    where: {
      ...(productId ? { productId } : {}),
      ...(supplierProductId ? { supplierProductId } : {}),
    },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      supplierProduct: {
        select: {
          id: true,
          name: true,
          supplierCode: true,
          unitPrice: true,
          supplier: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(mappings);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = productMappingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const existing = await prisma.productMapping.findUnique({
    where: {
      supplierProductId_productId: {
        supplierProductId: data.supplierProductId,
        productId: data.productId,
      },
    },
  });

  if (existing) {
    return NextResponse.json({ error: "이미 매핑이 존재합니다" }, { status: 409 });
  }

  const rate = parseFloat(data.conversionRate);

  const mapping = await prisma.$transaction(async (tx) => {
    if (data.isProvisional) {
      await tx.supplierProduct.update({
        where: { id: data.supplierProductId },
        data: { isProvisional: true },
      });
    }

    const created = await tx.productMapping.create({
      data: {
        supplierProductId: data.supplierProductId,
        productId: data.productId,
        conversionRate: rate,
      },
      include: {
        product: { select: { name: true, sku: true, sellingPrice: true } },
        supplierProduct: {
          select: {
            name: true,
            supplierCode: true,
            supplier: { select: { name: true } },
          },
        },
      },
    });

    await reconcileOrphanLotsForMapping(tx, {
      supplierProductId: data.supplierProductId,
      productId: data.productId,
      conversionRate: rate,
      referenceId: created.id,
    });

    return created;
  });

  return NextResponse.json(mapping, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID가 필요합니다" }, { status: 400 });
  }

  await prisma.productMapping.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
