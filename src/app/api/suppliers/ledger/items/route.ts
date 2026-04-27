import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// 거래처 원장 "품목별" 뷰 — CONFIRMED 입고의 IncomingItem을 펼쳐서 반환
// 결제/조정/환급은 품목 개념이 없으므로 제외
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get("supplierId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const q = searchParams.get("q");

  const incomingWhere: Prisma.IncomingWhereInput = {
    status: "CONFIRMED",
    ...(supplierId ? { supplierId } : {}),
    ...(from || to
      ? {
          incomingDate: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lt: new Date(to) } : {}),
          },
        }
      : {}),
    ...(q ? { supplier: { name: { contains: q, mode: "insensitive" as const } } } : {}),
  };

  const incomings = await prisma.incoming.findMany({
    where: incomingWhere,
    include: {
      supplier: { select: { id: true, name: true } },
      items: {
        include: {
          supplierProduct: {
            select: {
              id: true, name: true, spec: true, supplierCode: true, unitOfMeasure: true, isTaxable: true,
              productMappings: { select: { id: true } },
            },
          },
        },
      },
    },
    orderBy: { incomingDate: "desc" },
    take: 500,
  });

  const items = incomings.flatMap((inc) =>
    inc.items.map((it) => ({
      id: it.id,
      incomingId: inc.id,
      incomingNo: inc.incomingNo,
      incomingDate: inc.incomingDate,
      supplier: inc.supplier,
      supplierProduct: {
        id: it.supplierProduct.id,
        name: it.supplierProduct.name,
        spec: it.supplierProduct.spec,
        supplierCode: it.supplierProduct.supplierCode,
        unitOfMeasure: it.supplierProduct.unitOfMeasure,
        isTaxable: it.supplierProduct.isTaxable,
        mapped: it.supplierProduct.productMappings.length > 0,
      },
      quantity: it.quantity,
      originalPrice: it.originalPrice,
      discountAmount: it.discountAmount,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
      memo: it.memo,
    })),
  );

  return NextResponse.json({ items });
}
