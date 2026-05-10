import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 출고 SKU 확정: OrderItem.productId 를 실제 출고할 SKU 로 교체.
//   - canonical(대표상품) → variant(변형상품): variantProductId 로 swap
//   - OPTION_PARENT(옵션 placeholder) → SWAP 옵션값의 mappedProduct: 동일 endpoint, variantProductId 로 swap
//     (호출 측에서 ProductOption.values[].mappedProductId 를 골라 그대로 보냄)
// PENDING 상태에서만 가능.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id: orderId, itemId } = await params;
  const body = await request.json();
  const { variantProductId } = body as { variantProductId: string };

  if (!variantProductId) {
    return NextResponse.json({ error: "variantProductId가 필요합니다" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
  }
  if (order.status !== "PENDING") {
    return NextResponse.json(
      { error: "PENDING 상태 주문만 출고 SKU 를 변경할 수 있습니다" },
      { status: 400 },
    );
  }

  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    include: {
      product: {
        select: {
          id: true,
          isCanonical: true,
          canonicalProductId: true,
          productType: true,
        },
      },
    },
  });
  if (!item || item.orderId !== orderId) {
    return NextResponse.json({ error: "주문 항목을 찾을 수 없습니다" }, { status: 404 });
  }

  const variant = await prisma.product.findUnique({
    where: { id: variantProductId },
    select: {
      id: true,
      isCanonical: true,
      canonicalProductId: true,
      productType: true,
    },
  });
  if (!variant) {
    return NextResponse.json({ error: "출고 상품을 찾을 수 없습니다" }, { status: 404 });
  }
  if (variant.isCanonical) {
    return NextResponse.json(
      { error: "대표 상품은 출고 SKU 로 선택할 수 없습니다" },
      { status: 400 },
    );
  }
  if (variant.productType === "OPTION_PARENT") {
    return NextResponse.json(
      { error: "옵션 대표상품(placeholder) 은 출고 SKU 로 선택할 수 없습니다" },
      { status: 400 },
    );
  }

  // 캐노니컬 ID 보존: 원래 productId가 canonical이었다면 그것을, 변형이었다면 그 변형의 canonicalProductId 를
  const originalCanonical = item.product?.isCanonical
    ? item.product.id
    : item.canonicalProductId ?? variant.canonicalProductId;

  const updated = await prisma.orderItem.update({
    where: { id: itemId },
    data: {
      productId: variant.id,
      canonicalProductId: originalCanonical ?? null,
    },
  });

  return NextResponse.json(updated);
}
