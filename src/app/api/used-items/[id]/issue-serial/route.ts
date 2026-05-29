import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { usedItemIssueSerialSchema } from "@/lib/validators/used-item";
import { nextSerialItemCode } from "@/lib/serial-item-code";
import { randomBytes } from "crypto";

function newToken() {
  return randomBytes(16).toString("base64url");
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/used-items/[id]/issue-serial — 사후 시리얼 발번
 * 매입 시점에 발번 안 한 단품에 나중에 라벨 부여 (단품 판매 결정 시).
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json();
  const parsed = usedItemIssueSerialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.usedItem.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      productId: true,
      displayName: true,
      serialItemId: true,
      acquiredAt: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "단품을 찾을 수 없습니다" }, { status: 404 });
  }
  if (existing.status !== "IN_STOCK") {
    return NextResponse.json(
      { error: "보관 중 상태가 아닌 단품에는 시리얼을 발번할 수 없습니다" },
      { status: 400 },
    );
  }
  if (existing.serialItemId) {
    return NextResponse.json({ error: "이미 시리얼이 발번되어 있습니다" }, { status: 400 });
  }

  const warrantyMonths = parsed.data.warrantyMonths;
  const baseDate = existing.acquiredAt;

  try {
    const serial = await prisma.$transaction(async (tx) => {
      const code = await nextSerialItemCode(tx);
      const warrantyEnds = warrantyMonths
        ? new Date(
            baseDate.getFullYear(),
            baseDate.getMonth() + warrantyMonths,
            baseDate.getDate(),
          )
        : null;
      const created = await tx.serialItem.create({
        data: {
          code,
          accessToken: newToken(),
          productId: existing.productId,
          displayName: existing.productId ? null : existing.displayName,
          customerId: null,
          source: "USED_INTAKE",
          soldAt: null,
          warrantyEnds,
          status: "ACTIVE",
        },
      });
      await tx.usedItem.update({
        where: { id },
        data: { serialItemId: created.id },
      });
      return created;
    });

    return NextResponse.json(serial, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "시리얼 발번에 실패했습니다";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
