import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingSchema } from "@/lib/validators/incoming";
import { getCurrentUser } from "@/lib/auth";

function generateIncomingNo() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `IN${y}${m}${d}-${r}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const supplierId = searchParams.get("supplierId");

  const incomings = await prisma.incoming.findMany({
    where: {
      ...(status ? { status: status as "PENDING" | "CONFIRMED" | "CANCELLED" } : {}),
      ...(supplierId ? { supplierId } : {}),
    },
    include: {
      supplier: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
      items: {
        select: {
          id: true,
          supplierProduct: {
            select: {
              id: true,
              name: true,
              _count: { select: { productMappings: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(incomings);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = incomingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const items = data.items.map((item) => {
    const qty = parseFloat(item.quantity);
    const price = parseFloat(item.unitPrice);
    const originalPrice = item.originalPrice ? parseFloat(item.originalPrice) : undefined;
    const discountAmount = item.discountAmount ? parseFloat(item.discountAmount) : undefined;
    return {
      supplierProductId: item.supplierProductId,
      quantity: qty,
      unitPrice: price,
      totalPrice: qty * price,
      originalPrice,
      discountAmount,
    };
  });

  const totalAmount = items.reduce((sum, i) => sum + i.totalPrice, 0);
  const incomingNo = generateIncomingNo();

  const incoming = await prisma.$transaction(async (tx) => {
    // 1. 입고 생성
    const created = await tx.incoming.create({
      data: {
        incomingNo,
        supplierId: data.supplierId,
        incomingDate: new Date(data.incomingDate),
        totalAmount,
        shippingCost: data.shippingCost ? parseFloat(data.shippingCost) : 0,
        shippingIsTaxable: data.shippingIsTaxable ?? false,
        shippingDeducted: data.shippingDeducted ?? false,
        memo: data.memo || null,
        createdById: user.id,
        items: {
          create: items.map((i) => ({
            supplierProductId: i.supplierProductId,
            quantity: i.quantity,
            originalPrice: i.originalPrice,
            discountAmount: i.discountAmount,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
          })),
        },
      },
      include: {
        supplier: { select: { name: true } },
        items: {
          include: { supplierProduct: { select: { name: true, supplierCode: true, unitPrice: true } } },
        },
      },
    });

    // 2. 가격 변동이 있는 항목 처리: 이력 기록 + 공급자 상품 단가/정가 업데이트
    //    SupplierProduct 일괄 조회 + 변경분만 병렬 처리 (N+1 방지)
    const supplierProductIds = Array.from(new Set(items.map((i) => i.supplierProductId)));
    const sps = await tx.supplierProduct.findMany({
      where: { id: { in: supplierProductIds } },
      select: { id: true, unitPrice: true, listPrice: true },
    });
    const spById = new Map(sps.map((sp) => [sp.id, sp]));

    // 입고날짜 기준 — 더 최신 입고가 이미 있으면 SP.unitPrice를 덮어쓰지 않음
    const laterIncomings = await tx.incomingItem.findMany({
      where: {
        supplierProductId: { in: supplierProductIds },
        incomingId: { not: created.id },
        incoming: { incomingDate: { gt: new Date(data.incomingDate) } },
      },
      select: { supplierProductId: true },
    });
    const spsWithLater = new Set(laterIncomings.map((r) => r.supplierProductId));

    // supplierProductId별 그룹화 → 가중평균 단가 계산 (10+1 등 동일 SP 복수 행 대응)
    type ItemType = typeof items[number];
    const groupsBySpId = new Map<string, ItemType[]>();
    for (const item of items) {
      if (!groupsBySpId.has(item.supplierProductId)) groupsBySpId.set(item.supplierProductId, []);
      groupsBySpId.get(item.supplierProductId)!.push(item);
    }

    const priceOps: Promise<unknown>[] = [];
    for (const [spId, group] of groupsBySpId) {
      const sp = spById.get(spId);
      if (!sp) continue;
      if (spsWithLater.has(spId)) continue;

      const totalQty = group.reduce((s, i) => s + i.quantity, 0);
      const totalAmount = group.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      const weightedUnitPrice = totalQty > 0 ? totalAmount / totalQty : 0;

      // 대표 아이템: unitPrice 가장 높은 것 (originalPrice/discountAmount 기준)
      const canonical = group.reduce((a, b) => b.unitPrice > a.unitPrice ? b : a);
      const originalPrice = canonical.originalPrice;
      const discountAmount = canonical.discountAmount ?? 0;

      const currentPrice = Number(sp.unitPrice);
      const priceChanged = currentPrice !== weightedUnitPrice;
      const listPriceChanged = originalPrice !== undefined && Number(sp.listPrice) !== originalPrice;

      if (priceChanged || listPriceChanged) {
        const changeAmount = weightedUnitPrice - currentPrice;
        const changePercent = currentPrice !== 0 ? (changeAmount / currentPrice) * 100 : 0;

        priceOps.push(
          tx.supplierProductPriceHistory.create({
            data: {
              supplierProductId: spId,
              oldPrice: currentPrice,
              newPrice: weightedUnitPrice,
              changeAmount,
              changePercent,
              originalPrice: originalPrice ?? null,
              discountAmount: discountAmount > 0 ? discountAmount : null,
              reason: `입고 ${incomingNo}`,
              incomingId: created.id,
            },
          }),
          tx.supplierProduct.update({
            where: { id: spId },
            data: {
              unitPrice: weightedUnitPrice,
              ...(listPriceChanged ? { listPrice: originalPrice! } : {}),
            },
          })
        );
      }
    }
    await Promise.all(priceOps);

    return created;
  });

  return NextResponse.json(incoming, { status: 201 });
}
