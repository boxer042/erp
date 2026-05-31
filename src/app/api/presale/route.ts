import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { nextUsedItemCode } from "@/lib/used-item-code";
import { z } from "zod";

/**
 * 선판매 정리 — 결제됐지만 미등록인 자유 라인(presaleKind 보유)을 모아
 * 종류별(중고/내상품/수리)로 실제 등록해 연결하는 cross-domain 허브.
 *
 * presaleKind 가 없는 순수 기술료/공임 라인은 등록할 원가·상품이 없어 제외.
 * 현재 "used"(중고)만 활성, "catalog"(내상품)·수리는 향후 확장.
 */

/**
 * GET /api/presale
 * 미정리 선판매 라인 목록 — presaleKind 가 있고 아직 등록(link) 안 된 자유 라인.
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
      serviceName: { not: null },
      // 선판매 마커 있는 라인만 — 순수 기술료(presaleKind=null)는 등록 대상 아님
      presaleKind: { not: null },
      order: {
        orderDate: { gte: since },
        status: { notIn: ["CANCELLED", "RETURNED"] },
      },
    },
    select: {
      id: true,
      serviceName: true,
      presaleKind: true,
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

  // 중고(used) 우선 — 향후 catalog/수리 종류 섞일 때 그룹 정렬 (V8 stable sort 로 날짜 순서 유지)
  items.sort(
    (a, b) =>
      (b.presaleKind === "used" ? 1 : 0) - (a.presaleKind === "used" ? 1 : 0),
  );

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
 * POST /api/presale
 * 선판매 라인을 종류(presaleKind)에 따라 실제 도메인 레코드로 등록 + link.
 *  - "used"    → UsedItem 생성 (status=SOLD, acquiredFrom=EMERGENCY_USE) + OrderItem.unitCostSnapshot 보정
 *  - "catalog" → (향후) 카탈로그 상품 등록/연결
 *  - 그 외/수리 → (향후) 미지원
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
      { error: "이미 등록되어 연결된 라인입니다" },
      { status: 400 },
    );
  }

  // 종류 분기 — 현재 중고만 활성
  if (orderItem.presaleKind !== "used") {
    return NextResponse.json(
      { error: "아직 지원하지 않는 선판매 유형입니다 (내상품·수리는 준비 중)" },
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
    const msg = e instanceof Error ? e.message : "선판매 정리에 실패했습니다";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
