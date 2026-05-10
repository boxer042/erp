/**
 * BundleProduct (추가구매 추천) — list + create.
 *
 * 메인 상품 [id] 의 추가구매 추천 카탈로그 관리.
 * - GET: 활성 추천 목록 (sortOrder 순) + bundleProduct 정보 포함
 * - POST: 새 추천 매핑 생성
 *
 * 정책:
 *  - main = bundle 자기 자신 매핑 거부 (자기 추천은 의미 없음)
 *  - (mainProductId, bundleProductId) unique — 중복 차단 (DB 측에서 자동)
 *  - bundleProduct 가 OPTION_PARENT 인 경우 거부 — placeholder 라 단독 결제 못함
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { bundleProductCreateSchema } from "@/lib/validators/bundle-product";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const bundles = await prisma.bundleProduct.findMany({
    where: { mainProductId: id, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      bundleProduct: {
        select: {
          id: true,
          name: true,
          sku: true,
          sellingPrice: true,
          listPrice: true,
          imageUrl: true,
          taxType: true,
          productType: true,
        },
      },
    },
  });
  return NextResponse.json(bundles);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  const { id } = await params;

  const main = await prisma.product.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!main) {
    return NextResponse.json({ error: "메인 상품을 찾을 수 없습니다" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = bundleProductCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  if (data.bundleProductId === id) {
    return NextResponse.json(
      { error: "메인 상품 자신을 추가구매로 매핑할 수 없습니다" },
      { status: 400 },
    );
  }

  const bundle = await prisma.product.findUnique({
    where: { id: data.bundleProductId },
    select: { id: true, productType: true, isActive: true },
  });
  if (!bundle || !bundle.isActive) {
    return NextResponse.json({ error: "추가 상품을 찾을 수 없습니다" }, { status: 404 });
  }
  if (bundle.productType === "OPTION_PARENT") {
    return NextResponse.json(
      { error: "옵션 대표 상품은 추가구매로 매핑 불가 (자체 결제 불가능)" },
      { status: 400 },
    );
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.bundleProduct.create({
        data: {
          mainProductId: id,
          bundleProductId: data.bundleProductId,
          defaultQuantity: data.defaultQuantity,
          discountAmount: data.discountAmount ?? null,
          recommendMessage: data.recommendMessage ?? null,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
        },
        include: {
          bundleProduct: {
            select: {
              id: true,
              name: true,
              sku: true,
              sellingPrice: true,
              listPrice: true,
              imageUrl: true,
              taxType: true,
              productType: true,
            },
          },
        },
      });
      await recordAudit(tx, {
        userId: user.id,
        entity: "BundleProduct",
        entityId: row.id,
        action: "CREATE",
        meta: {
          mainProductId: id,
          mainProductName: main.name,
          bundleProductId: data.bundleProductId,
        },
      });
      return row;
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "추가구매 등록 실패";
    if (msg.includes("Unique") || msg.includes("unique")) {
      return NextResponse.json(
        { error: "이미 같은 추가구매가 등록되어 있습니다" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
