import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 장바구니 부활 — parkedAt 을 null 로 풀고 라인의 가격을 현재 sellingPrice 로 다시 계산.
 *
 * 가격 갱신 룰:
 *   - productId 있는 product 라인: Product.sellingPrice 로 unitPrice/listPrice 갱신
 *   - 자유 입력 라인 (productId 없음): 그대로
 *   - 수리/임대 라인: 그대로 (참조 엔터티에 가격이 박혀있음)
 */
type CartItem = {
  itemType: string;
  productId?: string | null;
  unitPrice?: string;
  listPrice?: string;
  [key: string]: unknown;
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sid: string }> },
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;
  const { sid: id } = await params;

  const existing = await prisma.posSession.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "세션을 찾을 수 없습니다" },
      { status: 404 },
    );
  }
  if (!existing.parkedAt) {
    return NextResponse.json(
      { error: "저장된 세션이 아닙니다" },
      { status: 400 },
    );
  }

  const items = (existing.items as unknown as CartItem[]) ?? [];
  const productIds = Array.from(
    new Set(
      items
        .filter((it) => it.itemType === "product" && it.productId)
        .map((it) => it.productId as string),
    ),
  );

  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, sellingPrice: true, listPrice: true },
      })
    : [];
  const priceById = new Map(
    products.map((p) => [
      p.id,
      {
        sellingPrice: p.sellingPrice.toString(),
        listPrice: p.listPrice?.toString() ?? null,
      },
    ]),
  );

  const refreshed = items.map((it) => {
    if (it.itemType !== "product" || !it.productId) return it;
    const fresh = priceById.get(it.productId);
    if (!fresh) return it;
    return {
      ...it,
      unitPrice: fresh.sellingPrice,
      listPrice: fresh.listPrice ?? fresh.sellingPrice,
    };
  });

  const updated = await prisma.posSession.update({
    where: { id },
    data: {
      parkedAt: null,
      items: refreshed as unknown as object[],
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({
    sessionId: updated.id,
    customerId: updated.customerId,
    customerName: updated.customerName,
    customerPhone: updated.customerPhone,
  });
}
