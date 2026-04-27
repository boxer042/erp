import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productMappingSchema } from "@/lib/validators/product";
import { computeMovingAverage } from "@/lib/cost";

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

  // 중복 확인
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

    // 미매핑(오르판) 로트 소급 편입
    const orphans = await tx.inventoryLot.findMany({
      where: { supplierProductId: data.supplierProductId, productId: null },
    });

    if (orphans.length > 0) {
      let totalAddQty = 0;
      let totalAddValue = 0;

      for (const lot of orphans) {
        const newReceivedQty = Number(lot.receivedQty) * rate;
        const newRemainingQty = Number(lot.remainingQty) * rate;
        const newUnitCost = Number(lot.unitCost) / rate;

        await tx.inventoryLot.update({
          where: { id: lot.id },
          data: {
            productId: data.productId,
            receivedQty: newReceivedQty,
            remainingQty: newRemainingQty,
            unitCost: newUnitCost,
          },
        });

        totalAddQty += newRemainingQty;
        totalAddValue += newRemainingQty * newUnitCost;
      }

      if (totalAddQty > 0) {
        const existing = await tx.inventory.findUnique({ where: { productId: data.productId } });
        const prevQty = existing ? Number(existing.quantity) : 0;
        const prevAvgCost = existing?.avgCost != null ? Number(existing.avgCost) : null;
        const addAvgUnitCost = totalAddValue / totalAddQty;
        const newAvgCost = computeMovingAverage(prevQty, prevAvgCost, totalAddQty, addAvgUnitCost);

        const inventory = await tx.inventory.upsert({
          where: { productId: data.productId },
          update: {
            quantity: { increment: totalAddQty },
            avgCost: newAvgCost,
            avgCostUpdatedAt: new Date(),
          },
          create: {
            productId: data.productId,
            quantity: totalAddQty,
            avgCost: newAvgCost,
            avgCostUpdatedAt: new Date(),
          },
        });

        await tx.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            type: "INCOMING",
            quantity: totalAddQty,
            balanceAfter: inventory.quantity,
            referenceId: created.id,
            referenceType: "MAPPING_BACKFILL",
            memo: `미매핑 로트 ${orphans.length}건 소급 반영`,
          },
        });
      }
    }

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
