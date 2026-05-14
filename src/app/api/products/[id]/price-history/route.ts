import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await prisma.productPriceHistory.findMany({
    where: { productId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { changedBy: { select: { name: true, email: true } } },
  });
  return NextResponse.json(rows);
}
