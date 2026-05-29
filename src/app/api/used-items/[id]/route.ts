import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { usedItemSchema } from "@/lib/validators/used-item";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/used-items/[id] — 단품 상세 + 비용 가산 + lineage
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const item = await prisma.usedItem.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      sourceCustomer: { select: { id: true, name: true, phone: true } },
      serialItem: {
        select: {
          id: true,
          code: true,
          warrantyEnds: true,
          customerId: true,
          orderItemId: true,
          status: true,
        },
      },
      addedCosts: { orderBy: { createdAt: "desc" } },
      orderItem: { select: { id: true, orderId: true, order: { select: { orderNo: true } } } },
      rentalAsset: { select: { id: true, assetNo: true, name: true } },
      assemblyConsumption: {
        include: {
          assembly: { select: { id: true, assemblyNo: true, assembledAt: true } },
        },
      },
    },
  });

  if (!item) {
    return NextResponse.json({ error: "단품을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json(item);
}

/**
 * PUT /api/used-items/[id] — 단품 수정 (status, 매입가, 매입처, 사진, 메모 등)
 * 시리얼 발번 토글은 별도 액션 (/issue-serial) 으로 분리.
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json();

  // PUT 은 부분 수정 허용 — usedItemSchema 의 입력 일부만 사용
  const parsed = usedItemSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const existing = await prisma.usedItem.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "단품을 찾을 수 없습니다" }, { status: 404 });
  }
  if (existing.status !== "IN_STOCK") {
    return NextResponse.json(
      { error: "보관 중 상태가 아닌 단품은 수정할 수 없습니다" },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.usedItem.update({
      where: { id },
      data: {
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
        ...(data.productId !== undefined ? { productId: data.productId } : {}),
        ...(data.acquiredFrom !== undefined ? { acquiredFrom: data.acquiredFrom } : {}),
        ...(data.acquiredCost !== undefined ? { acquiredCost: data.acquiredCost } : {}),
        ...(data.isAcquiredTaxable !== undefined ? { isAcquiredTaxable: data.isAcquiredTaxable } : {}),
        ...(data.acquiredAt ? { acquiredAt: new Date(data.acquiredAt) } : {}),
        ...(data.sourceCustomerId !== undefined ? { sourceCustomerId: data.sourceCustomerId } : {}),
        ...(data.sourceMemo !== undefined ? { sourceMemo: data.sourceMemo } : {}),
        ...(data.spec !== undefined ? { spec: data.spec } : {}),
        ...(data.imageUrls !== undefined ? { imageUrls: data.imageUrls ?? undefined } : {}),
        ...(data.memo !== undefined ? { memo: data.memo } : {}),
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        sourceCustomer: { select: { id: true, name: true } },
        serialItem: { select: { id: true, code: true, warrantyEnds: true } },
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "수정에 실패했습니다";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/**
 * DELETE /api/used-items/[id] — IN_STOCK 단품만 hard delete.
 * 폐기(SCRAPPED)는 /scrap 액션 사용 (자동 Expense 생성).
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const existing = await prisma.usedItem.findUnique({
    where: { id },
    select: { status: true, serialItemId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "단품을 찾을 수 없습니다" }, { status: 404 });
  }
  if (existing.status !== "IN_STOCK") {
    return NextResponse.json(
      { error: "보관 중 상태가 아닌 단품은 삭제할 수 없습니다 (대신 폐기 액션 사용)" },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.usedItem.delete({ where: { id } });
    // 연결된 시리얼이 있으면 SCRAPPED 처리 (지운 단품을 표시하던 라벨이라 의미 없음)
    if (existing.serialItemId) {
      await tx.serialItem.update({
        where: { id: existing.serialItemId },
        data: { status: "SCRAPPED" },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
