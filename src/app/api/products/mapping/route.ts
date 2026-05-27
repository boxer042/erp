import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productMappingSchema } from "@/lib/validators/product";
import { reconcileOrphanLotsForMapping } from "@/lib/mapping-helpers";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";

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
  const user = await getCurrentUser();

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

    await recordAudit(tx, {
      userId: user?.id,
      entity: "Product",
      entityId: data.productId,
      action: "MAPPING_CREATE",
      meta: {
        mappingId: created.id,
        supplierProductId: data.supplierProductId,
        supplierProductName: created.supplierProduct.name,
        supplierName: created.supplierProduct.supplier?.name ?? null,
        conversionRate: rate,
      },
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

  const user = await getCurrentUser();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.productMapping.findUnique({
      where: { id },
      include: {
        supplierProduct: {
          select: { name: true, supplier: { select: { name: true } } },
        },
      },
    });
    if (!existing) return;
    await tx.productMapping.delete({ where: { id } });
    await recordAudit(tx, {
      userId: user?.id,
      entity: "Product",
      entityId: existing.productId,
      action: "MAPPING_DELETE",
      meta: {
        mappingId: id,
        supplierProductId: existing.supplierProductId,
        supplierProductName: existing.supplierProduct.name,
        supplierName: existing.supplierProduct.supplier?.name ?? null,
        conversionRate: existing.conversionRate.toString(),
      },
    });
  });
  return NextResponse.json({ success: true });
}
