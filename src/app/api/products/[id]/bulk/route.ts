import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

const bulkSchema = z.object({
  name: z.string().min(1, "벌크 SKU 이름을 입력해주세요"),
  unitOfMeasure: z.string().min(1, "벌크 단위를 입력해주세요").default("mL"),
  containerSize: z
    .string()
    .min(1, "컨테이너 크기를 입력해주세요")
    .refine((v) => {
      const n = parseFloat(v);
      return !isNaN(n) && n > 0;
    }, "컨테이너 크기는 0보다 커야 합니다"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { id } = await params;
  const body = await request.json();
  const parsed = bulkSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const containerSize = parseFloat(data.containerSize);

  const bottle = await prisma.product.findUnique({
    where: { id },
    select: { id: true, sku: true, isBulk: true, bulkProductId: true, sellingPrice: true, taxType: true, taxRate: true },
  });

  if (!bottle) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }
  if (bottle.isBulk) {
    return NextResponse.json({ error: "벌크 SKU는 자체 벌크를 만들 수 없습니다" }, { status: 400 });
  }
  if (bottle.bulkProductId) {
    return NextResponse.json({ error: "이미 벌크 SKU가 연결되어 있습니다" }, { status: 409 });
  }

  const bottlePrice = parseFloat(bottle.sellingPrice.toString());
  const bulkSellingPrice = bottlePrice / containerSize;

  const result = await prisma.$transaction(async (tx) => {
    const bulkSku = `${bottle.sku}-BULK`;
    const skuExists = await tx.product.findUnique({ where: { sku: bulkSku }, select: { id: true } });
    const finalSku = skuExists
      ? `${bottle.sku}-BULK-${Date.now().toString(36).toUpperCase()}`
      : bulkSku;

    const bulk = await tx.product.create({
      data: {
        name: data.name,
        sku: finalSku,
        unitOfMeasure: data.unitOfMeasure,
        productType: "PARTS",
        taxType: bottle.taxType,
        taxRate: bottle.taxRate,
        listPrice: bulkSellingPrice,
        sellingPrice: bulkSellingPrice,
        isBulk: true,
        inventory: { create: { quantity: 0, safetyStock: 0 } },
      },
    });

    await tx.product.update({
      where: { id },
      data: { containerSize, bulkProductId: bulk.id },
    });

    return bulk;
  });

  return NextResponse.json(result, { status: 201 });
}
