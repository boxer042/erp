import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { InventoryUsageReason } from "@prisma/client";

const USAGE_REASONS = ["SAMPLE", "SELF_USE", "DAMAGE", "LOSS", "SUPPLIES"] as const;
type UsageReasonKey = (typeof USAGE_REASONS)[number];
const TARGET_REQUIRED: UsageReasonKey[] = ["SAMPLE"];

type Body = {
  date: string;
  productId: string;
  quantity: number | string;
  usageReason: UsageReasonKey;
  supplierId?: string | null;
  customerId?: string | null;
  description?: string;
  memo?: string;
  attachmentUrl?: string;
  attachmentPath?: string;
  attachmentName?: string;
};

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body: Body = await request.json();

  if (!body.date || !body.productId || !body.quantity || !body.usageReason) {
    return NextResponse.json(
      { error: "날짜, 상품, 수량, 용도는 필수입니다" },
      { status: 400 },
    );
  }
  if (!USAGE_REASONS.includes(body.usageReason)) {
    return NextResponse.json({ error: "잘못된 용도입니다" }, { status: 400 });
  }
  const qty = Number(body.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: "수량은 0보다 커야 합니다" }, { status: 400 });
  }

  const needsTarget = TARGET_REQUIRED.includes(body.usageReason);
  const supplierId = body.supplierId || null;
  const customerId = body.customerId || null;
  if (needsTarget && !supplierId && !customerId) {
    return NextResponse.json(
      { error: "샘플 용도는 거래처 또는 고객을 선택해야 합니다" },
      { status: 400 },
    );
  }
  if (supplierId && customerId) {
    return NextResponse.json(
      { error: "거래처와 고객은 동시에 선택할 수 없습니다" },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: body.productId },
        select: { id: true, name: true },
      });
      if (!product) throw new Error("상품을 찾을 수 없습니다");

      const inventory = await tx.inventory.findUnique({
        where: { productId: product.id },
      });
      if (!inventory) throw new Error("재고 정보를 찾을 수 없습니다");
      if (Number(inventory.quantity) < qty) {
        throw new Error(
          `재고 부족: 현재 ${Number(inventory.quantity)}, 요청 ${qty}`,
        );
      }

      const lots = await tx.inventoryLot.findMany({
        where: { productId: product.id, remainingQty: { gt: 0 } },
        orderBy: { receivedAt: "asc" },
      });
      const available = lots.reduce((s, l) => s + Number(l.remainingQty), 0);
      if (available < qty) {
        throw new Error(
          `로트 잔량 부족: 가용 ${available}, 요청 ${qty}. 실사보정으로 재고를 맞춘 뒤 다시 시도해주세요.`,
        );
      }

      let need = qty;
      let totalCost = 0;
      for (const lot of lots) {
        if (need <= 0) break;
        const take = Math.min(need, Number(lot.remainingQty));
        await tx.inventoryLot.update({
          where: { id: lot.id },
          data: { remainingQty: { decrement: take } },
        });
        totalCost += take * Number(lot.unitCost);
        need -= take;
      }

      const newQty = Number(inventory.quantity) - qty;
      await tx.inventory.update({
        where: { id: inventory.id },
        data: { quantity: newQty },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          type: "INTERNAL_USE",
          quantity: -qty,
          balanceAfter: newQty,
          usageReason: body.usageReason as InventoryUsageReason,
          memo: body.memo ?? null,
        },
      });

      const description =
        body.description?.trim() ||
        `${product.name} 사용 (${REASON_LABELS[body.usageReason]})`;

      const expense = await tx.expense.create({
        data: {
          date: new Date(body.date),
          amount: totalCost,
          category: "INVENTORY_USAGE",
          description,
          isTaxable: false,
          supplierId,
          customerId,
          createdById: user.id,
          referenceType: "INVENTORY_MOVEMENT",
          referenceId: movement.id,
          memo: body.memo ?? null,
          attachmentUrl: body.attachmentUrl ?? null,
          attachmentPath: body.attachmentPath ?? null,
          attachmentName: body.attachmentName ?? null,
        },
      });

      return { expense, movement, totalCost };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "처리 중 오류가 발생했습니다";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

const REASON_LABELS: Record<UsageReasonKey, string> = {
  SAMPLE: "샘플",
  SELF_USE: "자가소비",
  DAMAGE: "파손",
  LOSS: "분실",
  SUPPLIES: "소모품",
};
