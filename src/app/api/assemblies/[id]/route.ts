import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const assembly = await prisma.assembly.findUnique({
    where: { id },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          isCanonical: true,
          canonicalProductId: true,
          canonicalProduct: { select: { id: true, name: true, sku: true } },
        },
      },
      consumptions: {
        include: { component: { select: { id: true, name: true, sku: true } } },
      },
      reverseOf: {
        select: { id: true, assemblyNo: true, assembledAt: true },
      },
      reversedBy: {
        select: { id: true, assemblyNo: true, assembledAt: true },
      },
    },
  });
  if (!assembly) {
    return NextResponse.json({ error: "조립 실적을 찾을 수 없습니다" }, { status: 404 });
  }

  const lotIds = Array.from(
    new Set([
      ...assembly.consumptions.map((c) => c.lotId),
      ...(assembly.producedLotId ? [assembly.producedLotId] : []),
    ]),
  );
  const lots = lotIds.length
    ? await prisma.inventoryLot.findMany({
        where: { id: { in: lotIds } },
        select: {
          id: true,
          receivedAt: true,
          source: true,
          remainingQty: true,
          receivedQty: true,
          unitCost: true,
        },
      })
    : [];
  const lotById = new Map(lots.map((l) => [l.id, l]));

  return NextResponse.json({
    ...assembly,
    producedLot: assembly.producedLotId ? lotById.get(assembly.producedLotId) ?? null : null,
    consumptions: assembly.consumptions.map((c) => ({
      ...c,
      lot: lotById.get(c.lotId) ?? null,
    })),
  });
}
