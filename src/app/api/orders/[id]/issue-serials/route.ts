import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { nextSerialItemCode } from "@/lib/serial-item-code";
import { generateAccessToken } from "@/lib/serial-token";

/**
 * 과거 주문에 시리얼 라벨 소급 발번.
 * trackable=true 인 OrderItem 마다 (수량 − 이미 발번된 SerialItem 수) 만큼 발번하고
 * SerialItem.orderItemId 로 해당 OrderItem 에 연결한다.
 *
 * 코드·soldAt·보증 기준일은 주문일(orderDate) — 실제 판매 시점 기준.
 * 두 번 호출해도 이미 발번된 수만큼 제외하므로 중복 발번되지 않는다.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      orderDate: true,
      customerId: true,
      customer: { select: { serialServiceConsent: true } },
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          product: {
            select: {
              id: true,
              name: true,
              trackable: true,
              warrantyMonths: true,
            },
          },
        },
      },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
  }
  if (order.status === "CANCELLED") {
    return NextResponse.json(
      { error: "취소된 주문은 시리얼을 발번할 수 없습니다" },
      { status: 400 },
    );
  }

  // 발번 대상 — trackable 상품 라인만
  const trackableItems = order.items.filter((it) => it.product?.trackable);
  if (trackableItems.length === 0) {
    return NextResponse.json(
      { error: "이 주문에는 시리얼 발번 대상(트래커블) 상품이 없습니다" },
      { status: 400 },
    );
  }

  // 각 OrderItem 의 기존 SerialItem 수 일괄 조회 (N+1 회피)
  const existing = await prisma.serialItem.groupBy({
    by: ["orderItemId"],
    where: { orderItemId: { in: trackableItems.map((it) => it.id) } },
    _count: { _all: true },
  });
  const issuedByItem = new Map(
    existing.map((e) => [e.orderItemId, e._count._all]),
  );

  // 발번 계획 — OrderItem 별 부족분
  const plans = trackableItems
    .map((it) => ({
      orderItemId: it.id,
      productId: it.productId!,
      warrantyMonths: it.product!.warrantyMonths,
      count:
        Math.floor(Number(it.quantity)) - (issuedByItem.get(it.id) ?? 0),
    }))
    .filter((p) => p.count > 0);

  if (plans.length === 0) {
    return NextResponse.json(
      { error: "이미 모든 트래커블 상품에 시리얼이 발번되어 있습니다" },
      { status: 400 },
    );
  }

  const consent = order.customer?.serialServiceConsent ?? false;
  const issueDate = order.orderDate;

  const codes: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const plan of plans) {
      const warrantyEnds = plan.warrantyMonths
        ? new Date(
            issueDate.getFullYear(),
            issueDate.getMonth() + plan.warrantyMonths,
            issueDate.getDate(),
          )
        : null;
      for (let i = 0; i < plan.count; i++) {
        const code = await nextSerialItemCode(tx, issueDate);
        await tx.serialItem.create({
          data: {
            code,
            accessToken: consent ? generateAccessToken() : null,
            productId: plan.productId,
            orderItemId: plan.orderItemId,
            customerId: order.customerId ?? null,
            source: "SALE",
            soldAt: issueDate,
            warrantyEnds,
            status: "ACTIVE",
          },
        });
        codes.push(code);
      }
    }
  });

  return NextResponse.json(
    {
      labels: codes.map((code) => ({ code })),
      consentMissing: !!order.customerId && !consent,
    },
    { status: 201 },
  );
}
