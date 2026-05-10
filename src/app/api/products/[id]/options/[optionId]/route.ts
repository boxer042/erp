/**
 * ProductOption 상세 — PATCH / DELETE.
 *
 * PATCH 정책:
 *  - 옵션 슬롯 자체 (name/required/sortOrder/isActive) 수정 가능
 *  - values 배열을 보내면 **upsert + delete** 처리:
 *      · id 가 있으면 update
 *      · id 가 없으면 create
 *      · 기존 DB 에 있던 값 중 payload 에 없는 것은 deactivate (isActive=false) — soft delete
 *  - 이미 OrderItem 에 사용된 값은 삭제 X (참조 안전성)
 *
 * DELETE 정책:
 *  - 옵션 슬롯 soft delete (isActive=false). 값들도 soft delete.
 *  - 이미 OrderItem 에 사용된 옵션은 hard delete 안 함 — 과거 주문의 optionSnapshot 은 그대로 보존.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { productOptionUpdateSchema } from "@/lib/validators/product-option";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  const { id, optionId } = await params;

  const existing = await prisma.productOption.findFirst({
    where: { id: optionId, productId: id },
    include: { values: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "옵션을 찾을 수 없습니다" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = productOptionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // 값 검증 — mappedProductId/mappedVariantId 동시 설정 거부
  if (data.values) {
    for (const v of data.values) {
      if (v.mappedProductId && v.mappedVariantId) {
        return NextResponse.json(
          {
            error: `옵션값 "${v.label}": mappedProductId / mappedVariantId 둘 중 하나만 설정 가능`,
          },
          { status: 400 },
        );
      }
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    // 옵션 슬롯 자체 update
    const u = await tx.productOption.update({
      where: { id: optionId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.required !== undefined ? { required: data.required } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    if (data.values) {
      const incomingIds = new Set(
        data.values
          .map((v) => v.id)
          .filter((id): id is string => typeof id === "string"),
      );

      // payload 에 없는 기존 값 — soft delete (isActive=false)
      const toDeactivate = existing.values.filter(
        (v) => !incomingIds.has(v.id) && v.isActive,
      );
      if (toDeactivate.length > 0) {
        await tx.productOptionValue.updateMany({
          where: { id: { in: toDeactivate.map((v) => v.id) } },
          data: { isActive: false },
        });
      }

      // upsert 처리
      for (const v of data.values) {
        if (v.id) {
          await tx.productOptionValue.update({
            where: { id: v.id },
            data: {
              label: v.label,
              addPrice: v.addPrice,
              sortOrder: v.sortOrder,
              isActive: v.isActive,
              mappedProductId: v.mappedProductId ?? null,
              mappedVariantId: v.mappedVariantId ?? null,
              mappedMode: v.mappedMode,
            },
          });
        } else {
          await tx.productOptionValue.create({
            data: {
              optionId,
              label: v.label,
              addPrice: v.addPrice,
              sortOrder: v.sortOrder,
              isActive: v.isActive,
              mappedProductId: v.mappedProductId ?? null,
              mappedVariantId: v.mappedVariantId ?? null,
              mappedMode: v.mappedMode,
            },
          });
        }
      }
    }

    await recordAudit(tx, {
      userId: user.id,
      entity: "ProductOption",
      entityId: optionId,
      action: "UPDATE",
      meta: {
        productId: id,
        optionName: u.name,
      },
    });

    return u;
  });

  // 갱신된 전체 옵션 반환
  const fresh = await prisma.productOption.findUnique({
    where: { id: optionId },
    include: {
      values: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          mappedProduct: { select: { id: true, name: true, sku: true, sellingPrice: true, listPrice: true, taxType: true } },
          mappedVariant: { select: { id: true, name: true, sku: true } },
        },
      },
    },
  });
  void updated;
  return NextResponse.json(fresh);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  const { id, optionId } = await params;

  const existing = await prisma.productOption.findFirst({
    where: { id: optionId, productId: id },
  });
  if (!existing) {
    return NextResponse.json({ error: "옵션을 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    // 옵션 + 값들 soft delete (isActive=false). 과거 OrderItem.optionSnapshot 보존.
    await tx.productOptionValue.updateMany({
      where: { optionId },
      data: { isActive: false },
    });
    await tx.productOption.update({
      where: { id: optionId },
      data: { isActive: false },
    });

    await recordAudit(tx, {
      userId: user.id,
      entity: "ProductOption",
      entityId: optionId,
      action: "DELETE",
      meta: {
        productId: id,
        optionName: existing.name,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
