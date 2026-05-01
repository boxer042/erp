import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

export async function PUT(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const body = await request.json();
  const { productId, safetyStock } = body as {
    productId: string;
    safetyStock: string;
  };

  if (!productId) {
    return NextResponse.json({ error: "상품ID가 필요합니다" }, { status: 400 });
  }

  const inventory = await prisma.inventory.upsert({
    where: { productId },
    update: { safetyStock: parseFloat(safetyStock || "0") },
    create: { productId, quantity: 0, safetyStock: parseFloat(safetyStock || "0") },
  });

  return NextResponse.json(inventory);
}
