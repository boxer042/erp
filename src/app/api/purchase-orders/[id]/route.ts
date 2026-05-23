import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { purchaseOrderSchema } from "@/lib/validators/purchase-order";
import { recordAudit } from "@/lib/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      createdBy: { select: { id: true, name: true } },
      quotation: { select: { id: true, quotationNo: true } },
      items: {
        include: {
          supplierProduct: {
            select: {
              id: true,
              name: true,
              spec: true,
              supplierCode: true,
              unitOfMeasure: true,
              unitPrice: true,
            },
          },
          // 잔량 계산용 — PENDING 입고도 차감해야 이중 입고 방지
          incomingItems: {
            select: {
              quantity: true,
              incoming: { select: { status: true } },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      incomings: {
        select: {
          id: true,
          incomingNo: true,
          incomingDate: true,
          status: true,
          totalAmount: true,
        },
        orderBy: { incomingDate: "desc" },
      },
      // 발급된 거래처 토큰 — 활성 + 이력 모두
      accessTokens: {
        select: {
          id: true,
          token: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
          firstViewedAt: true,
          lastViewedAt: true,
          viewCount: true,
          acceptedAt: true,
          rejectedAt: true,
          rejectionNote: true,
        },
        orderBy: { issuedAt: "desc" },
      },
    },
  });

  if (!po) {
    return NextResponse.json({ error: "발주서를 찾을 수 없습니다" }, { status: 404 });
  }

  // 항목별 pendingQty (CONFIRMED 외 — 즉 PENDING — 입고의 합) 계산해 응답에 포함
  const itemsWithPending = po.items.map((it) => {
    const pendingQty = it.incomingItems.reduce((sum, ii) => {
      if (ii.incoming.status === "PENDING") return sum + Number(ii.quantity);
      return sum;
    }, 0);
    const { incomingItems: _omit, ...rest } = it;
    return { ...rest, pendingQty };
  });

  return NextResponse.json({ ...po, items: itemsWithPending });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json();
  const parsed = purchaseOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // 입고가 이미 발생한 발주는 항목 수정 불가 (PARTIAL/RECEIVED/CLOSED)
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true, incomings: { select: { id: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "발주서를 찾을 수 없습니다" }, { status: 404 });
  }
  if (existing.incomings.length > 0) {
    return NextResponse.json(
      { error: "입고가 진행된 발주는 수정할 수 없습니다" },
      { status: 409 }
    );
  }
  if (existing.status === "CANCELLED" || existing.status === "CLOSED" || existing.status === "RECEIVED") {
    return NextResponse.json(
      { error: "종료된 발주는 수정할 수 없습니다" },
      { status: 409 }
    );
  }

  const items = data.items.map((it, idx) => {
    const qty = parseFloat(it.quantity);
    const price = parseFloat(it.unitPrice);
    const sentTotal = it.totalPrice ? parseFloat(it.totalPrice) : NaN;
    const totalPrice = Number.isFinite(sentTotal) && sentTotal >= 0 ? sentTotal : qty * price;
    const hasSp = it.supplierProductId && it.supplierProductId.length > 0;
    return {
      supplierProductId: hasSp ? it.supplierProductId! : null,
      name: !hasSp && it.name ? it.name.trim() : null,
      quantity: qty,
      unitPrice: price,
      totalPrice,
      memo: it.memo || null,
      sortOrder: idx,
    };
  });

  const totalAmount = items.reduce((s, i) => s + i.totalPrice, 0);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
    const u = await tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: data.supplierId,
        orderDate: new Date(data.orderDate),
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
        totalAmount,
        memo: data.memo || null,
        quotationId: data.quotationId || null,
        items: {
          create: items.map((i) => ({
            supplierProductId: i.supplierProductId,
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
            memo: i.memo,
            sortOrder: i.sortOrder,
          })),
        },
      },
      include: {
        supplier: true,
        items: { include: { supplierProduct: true }, orderBy: { sortOrder: "asc" } },
      },
    });
    await recordAudit(tx, {
      userId: user.id,
      entity: "PurchaseOrder",
      entityId: id,
      action: "UPDATE",
      meta: { totalAmount, itemCount: items.length },
    });
    return u;
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { incomings: { select: { id: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "발주서를 찾을 수 없습니다" }, { status: 404 });
  }
  if (existing.incomings.length > 0) {
    return NextResponse.json(
      { error: "입고가 진행된 발주는 삭제할 수 없습니다 (취소만 가능)" },
      { status: 409 }
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.delete({ where: { id } });
    await recordAudit(tx, {
      userId: user.id,
      entity: "PurchaseOrder",
      entityId: id,
      action: "DELETE",
    });
  });
  return NextResponse.json({ ok: true });
}
