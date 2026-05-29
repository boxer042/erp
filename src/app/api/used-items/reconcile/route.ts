import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { nextUsedItemCode } from "@/lib/used-item-code";
import { z } from "zod";

/**
 * GET /api/used-items/reconcile
 * 미정리 OrderItem 목록 — productId 없고 serviceName 있는 자유 라인 중
 * 아직 UsedItem 으로 link 안 된 것. EMERGENCY_USE 사후 정리 대상.
 *
 * 정책: 최근 30일 + 매장 직원이 "중고였음" 표시할 만한 후보.
 * (productId 없는 모든 OrderItem 이 자동 후보지만 실제로는 매장 직원 판단으로 등록)
 */
export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const sp = request.nextUrl.searchParams;
  const days = Math.min(parseInt(sp.get("days") ?? "30", 10) || 30, 180);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const items = await prisma.orderItem.findMany({
    where: {
      productId: null,
      // 이미 link 된 OrderItem 은 제외 (UsedItem.orderItemId @unique)
      soldUsedItem: null,
      // 서비스 라인 외에 service line (수리/임대 등) 도 productId=null 일 수 있어
      // serviceName 만 있는 가장 단순한 라인 위주
      serviceName: { not: null },
      order: {
        orderDate: { gte: since },
        // 취소/환불은 제외
        status: { notIn: ["CANCELLED", "RETURNED"] },
      },
    },
    select: {
      id: true,
      serviceName: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      order: {
        select: {
          id: true,
          orderNo: true,
          orderDate: true,
          customerId: true,
          customerName: true,
        },
      },
    },
    orderBy: [{ order: { orderDate: "desc" } }],
    take: 100,
  });

  return NextResponse.json(items);
}

const reconcileSchema = z.object({
  orderItemId: z.string().min(1),
  displayName: z.string().min(1, "품명을 입력해주세요"),
  acquiredCost: z.string().regex(/^-?\d+(\.\d+)?$/).default("0"),
  productId: z.string().nullish(),
  sourceCustomerId: z.string().nullish(),
  sourceMemo: z.string().nullish(),
  memo: z.string().nullish(),
});

/**
 * POST /api/used-items/reconcile
 * 미정리 OrderItem 을 UsedItem 으로 사후 등록 + status=SOLD + orderItemId link.
 * acquiredFrom=EMERGENCY_USE 고정.
 *
 * 부가 효과: OrderItem.unitCostSnapshot 도 함께 갱신해 마진 리포트 정합성 회복.
 */
export async function POST(request: NextRequest) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const body = await request.json();
  const parsed = reconcileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const orderItem = await prisma.orderItem.findUnique({
    where: { id: data.orderItemId },
    include: {
      order: { select: { orderDate: true, customerId: true } },
      soldUsedItem: { select: { id: true } },
    },
  });
  if (!orderItem) {
    return NextResponse.json({ error: "주문 항목을 찾을 수 없습니다" }, { status: 404 });
  }
  if (orderItem.soldUsedItem) {
    return NextResponse.json(
      { error: "이미 중고 단품이 연결되어 있습니다" },
      { status: 400 },
    );
  }

  const acquiredAt = orderItem.order.orderDate;
  const acquiredCost = parseFloat(data.acquiredCost) || 0;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const internalCode = await nextUsedItemCode(tx, acquiredAt);

      const usedItem = await tx.usedItem.create({
        data: {
          internalCode,
          displayName: data.displayName,
          productId: data.productId ?? null,
          acquiredFrom: "EMERGENCY_USE",
          acquiredCost,
          isAcquiredTaxable: false,
          acquiredAt,
          sourceCustomerId: data.sourceCustomerId ?? null,
          sourceMemo: data.sourceMemo ?? null,
          memo: data.memo ?? null,
          status: "SOLD",
          orderItemId: orderItem.id,
          createdById: user!.id,
        },
      });

      // OrderItem.unitCostSnapshot 갱신 — 마진 리포트 정합성
      await tx.orderItem.update({
        where: { id: orderItem.id },
        data: {
          unitCostSnapshot: acquiredCost / Math.max(1, Number(orderItem.quantity)),
        },
      });

      return usedItem;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "사후 정리에 실패했습니다";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
