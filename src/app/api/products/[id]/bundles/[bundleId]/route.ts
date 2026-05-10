/**
 * BundleProduct 상세 — PATCH / DELETE.
 *
 * PATCH: 수량/할인/메시지/순서/활성 부분 갱신
 * DELETE: hard delete (참조 제약 없음 — OrderItem 은 상품 직접 참조라 cascade 안 됨)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { bundleProductUpdateSchema } from "@/lib/validators/bundle-product";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bundleId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  const { id, bundleId } = await params;

  const existing = await prisma.bundleProduct.findFirst({
    where: { id: bundleId, mainProductId: id },
  });
  if (!existing) {
    return NextResponse.json({ error: "추가구매를 찾을 수 없습니다" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = bundleProductUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.bundleProduct.update({
      where: { id: bundleId },
      data: {
        ...(data.defaultQuantity !== undefined ? { defaultQuantity: data.defaultQuantity } : {}),
        ...(data.discountAmount !== undefined ? { discountAmount: data.discountAmount } : {}),
        ...(data.recommendMessage !== undefined ? { recommendMessage: data.recommendMessage } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
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
      entityId: bundleId,
      action: "UPDATE",
      meta: { mainProductId: id },
    });
    return row;
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; bundleId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  const { id, bundleId } = await params;

  const existing = await prisma.bundleProduct.findFirst({
    where: { id: bundleId, mainProductId: id },
  });
  if (!existing) {
    return NextResponse.json({ error: "추가구매를 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.bundleProduct.delete({ where: { id: bundleId } });
    await recordAudit(tx, {
      userId: user.id,
      entity: "BundleProduct",
      entityId: bundleId,
      action: "DELETE",
      meta: { mainProductId: id, bundleProductId: existing.bundleProductId },
    });
  });

  return NextResponse.json({ ok: true });
}
