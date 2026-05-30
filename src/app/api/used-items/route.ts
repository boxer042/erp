import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { usedItemSchema } from "@/lib/validators/used-item";
import { nextUsedItemCode } from "@/lib/used-item-code";
import { nextSerialItemCode } from "@/lib/serial-item-code";
import { randomBytes } from "crypto";

function newToken() {
  return randomBytes(16).toString("base64url");
}

/**
 * GET /api/used-items
 * Query params:
 *   - status: UsedItemStatus filter (default: 모든 status, 단 페이지가 보통 IN_STOCK 만 요청)
 *   - productId: 특정 카탈로그 모델의 중고만
 *   - search: displayName / internalCode 부분일치
 *   - acquiredFrom: 출처 필터
 *   - includeCosts: true 시 addedCosts 포함
 *   - limit: 기본 200
 *   (product 정보는 항상 포함 — 표시 이름을 카탈로그 product.name 으로 끌어오기 위함)
 */
export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status");
  const productId = sp.get("productId");
  const search = sp.get("search")?.trim();
  const acquiredFrom = sp.get("acquiredFrom");
  const includeCosts = sp.get("includeCosts") === "true";
  const limit = Math.min(parseInt(sp.get("limit") ?? "200", 10) || 200, 500);

  const where: Parameters<typeof prisma.usedItem.findMany>[0] = {
    where: {
      ...(status ? { status: status as never } : {}),
      ...(productId ? { productId } : {}),
      ...(acquiredFrom ? { acquiredFrom: acquiredFrom as never } : {}),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: "insensitive" } },
              { internalCode: { contains: search, mode: "insensitive" } },
              // 카탈로그 매칭 중고는 displayName 이 옛 스냅샷일 수 있으니 live product.name 으로도 검색
              { product: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    include: {
      // product 는 항상 포함 — 카탈로그 매칭 시 표시 이름을 product.name(live) 으로 끌어옴 (옵션 B).
      // categoryId 는 중고 조립 슬롯의 카테고리 제약 필터링에 사용.
      product: { select: { id: true, name: true, sku: true, categoryId: true } },
      sourceCustomer: { select: { id: true, name: true } },
      serialItem: { select: { id: true, code: true, warrantyEnds: true } },
      addedCosts: includeCosts ? { orderBy: { createdAt: "desc" } } : false,
    },
  };

  const items = await prisma.usedItem.findMany(where);
  return NextResponse.json(items);
}

/**
 * POST /api/used-items — 매입 등록
 * 동시 시리얼 발번 가능 (issueSerial: true).
 */
export async function POST(request: NextRequest) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const body = await request.json();
  const parsed = usedItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const acquiredAt = new Date(data.acquiredAt);
  if (isNaN(acquiredAt.getTime())) {
    return NextResponse.json({ error: "매입일이 올바르지 않습니다" }, { status: 400 });
  }

  // 카탈로그 매칭 검증
  if (data.productId) {
    const exists = await prisma.product.findUnique({
      where: { id: data.productId },
      select: { id: true, name: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "카탈로그 상품을 찾을 수 없습니다" }, { status: 400 });
    }
  }

  // 매입처 등록 고객 검증
  if (data.sourceCustomerId) {
    const c = await prisma.customer.findUnique({
      where: { id: data.sourceCustomerId },
      select: { id: true },
    });
    if (!c) {
      return NextResponse.json({ error: "매입처 고객을 찾을 수 없습니다" }, { status: 400 });
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const internalCode = await nextUsedItemCode(tx, acquiredAt);

      let serialItemId: string | null = null;
      if (data.issueSerial) {
        const code = await nextSerialItemCode(tx, acquiredAt);
        const warrantyMonths = data.warrantyMonths ?? 0;
        const warrantyEnds = warrantyMonths
          ? new Date(
              acquiredAt.getFullYear(),
              acquiredAt.getMonth() + warrantyMonths,
              acquiredAt.getDate(),
            )
          : null;
        const serial = await tx.serialItem.create({
          data: {
            code,
            accessToken: newToken(),
            productId: data.productId ?? null,
            displayName: data.productId ? null : data.displayName,
            customerId: null,
            source: "USED_INTAKE",
            soldAt: null,
            warrantyEnds,
            status: "ACTIVE",
          },
        });
        serialItemId = serial.id;
      }

      const created = await tx.usedItem.create({
        data: {
          internalCode,
          displayName: data.displayName,
          productId: data.productId ?? null,
          acquiredFrom: data.acquiredFrom,
          acquiredCost: data.acquiredCost,
          isAcquiredTaxable: data.isAcquiredTaxable,
          acquiredAt,
          sourceCustomerId: data.sourceCustomerId ?? null,
          sourceMemo: data.sourceMemo ?? null,
          status: "IN_STOCK",
          spec: data.spec ?? null,
          imageUrls: data.imageUrls ?? undefined,
          memo: data.memo ?? null,
          serialItemId,
          createdById: user!.id,
        },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          sourceCustomer: { select: { id: true, name: true } },
          serialItem: { select: { id: true, code: true, warrantyEnds: true } },
        },
      });

      return created;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "매입 등록에 실패했습니다";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
