import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 고객의 구매·수리 이력 기반 기기 후보 목록.
 * - 그 고객의 OrderItem.product (구매한 상품)
 * - 그 고객의 RepairTicket.repairProduct (가져왔던 기기)
 * 둘을 합쳐 distinct Product 반환. categoryId 필터 옵션.
 *
 * 새 수리 접수 시 "이 고객이 가져온 적 있는 기기" 우선 노출에 사용.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id: customerId } = await params;
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");

  // 구매 이력 → product
  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: { customerId },
      productId: { not: null },
      ...(categoryId ? { product: { categoryId } } : {}),
    },
    select: {
      product: { select: { id: true, name: true, sku: true } },
    },
    take: 100,
  });

  // 수리 이력 → repairProduct
  const tickets = await prisma.repairTicket.findMany({
    where: {
      customerId,
      repairProductId: { not: null },
      ...(categoryId ? { repairProduct: { categoryId } } : {}),
    },
    select: {
      repairProduct: { select: { id: true, name: true, sku: true } },
    },
    take: 100,
  });

  // distinct
  const map = new Map<string, { id: string; name: string; sku: string }>();
  for (const oi of orderItems) {
    if (oi.product) map.set(oi.product.id, oi.product);
  }
  for (const t of tickets) {
    if (t.repairProduct) map.set(t.repairProduct.id, t.repairProduct);
  }

  return NextResponse.json(Array.from(map.values()));
}
