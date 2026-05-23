import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { purchaseOrderSchema } from "@/lib/validators/purchase-order";
import { generatePurchaseOrderNo } from "@/lib/document-no";
import { recordAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const supplierId = searchParams.get("supplierId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const orderDateFilter: { gte?: Date; lt?: Date } = {};
  if (from) orderDateFilter.gte = new Date(from);
  if (to) orderDateFilter.lt = new Date(to);

  const rows = await prisma.purchaseOrder.findMany({
    where: {
      ...(status ? { status: status as "DRAFT" | "SENT" | "CONFIRMED" | "PARTIAL" | "RECEIVED" | "CLOSED" | "CANCELLED" } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(from || to ? { orderDate: orderDateFilter } : {}),
    },
    include: {
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true, incomings: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          receivedQty: true,
          unitPrice: true,
          supplierProduct: {
            select: {
              id: true,
              name: true,
              supplierCode: true,
              unitOfMeasure: true,
            },
          },
          // 진행률 바 3색 표시용 — PENDING 입고 누적
          incomingItems: {
            select: {
              quantity: true,
              incoming: { select: { status: true } },
            },
          },
        },
      },
    },
    orderBy: { orderDate: "desc" },
  });

  // pendingQty 계산해서 응답에 추가 (incomingItems 자체는 응답에서 제외)
  const result = rows.map((row) => ({
    ...row,
    items: row.items.map(({ incomingItems, ...rest }) => ({
      ...rest,
      pendingQty: incomingItems.reduce(
        (s, ii) => (ii.incoming.status === "PENDING" ? s + Number(ii.quantity) : s),
        0
      ),
    })),
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const body = await request.json();
  const parsed = purchaseOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const items = data.items.map((it, idx) => {
    const qty = parseFloat(it.quantity);
    // 가격 미정 라인은 단가·소계 모두 0 으로 강제.
    const undetermined = it.priceUndetermined === true;
    const price = undetermined ? 0 : parseFloat(it.unitPrice);
    const sentTotal = it.totalPrice ? parseFloat(it.totalPrice) : NaN;
    const totalPrice = undetermined ? 0 : Number.isFinite(sentTotal) && sentTotal >= 0 ? sentTotal : qty * price;
    const hasSp = it.supplierProductId && it.supplierProductId.length > 0;
    return {
      supplierProductId: hasSp ? it.supplierProductId! : null,
      name: !hasSp && it.name ? it.name.trim() : null,
      priceUndetermined: undetermined,
      quantity: qty,
      unitPrice: price,
      totalPrice,
      memo: it.memo || null,
      sortOrder: idx,
    };
  });

  const totalAmount = items.reduce((s, i) => s + i.totalPrice, 0);
  const poNo = generatePurchaseOrderNo();

  const created = await prisma.$transaction(async (tx) => {
    const c = await tx.purchaseOrder.create({
      data: {
        poNo,
        supplierId: data.supplierId,
        status: "DRAFT",
        orderDate: new Date(data.orderDate),
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
        totalAmount,
        memo: data.memo || null,
        shippingMethod: data.shippingMethod ?? null,
        quotationId: data.quotationId || null,
        createdById: user.id,
        items: {
          create: items.map((i) => ({
            supplierProductId: i.supplierProductId,
            name: i.name,
            priceUndetermined: i.priceUndetermined,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
            memo: i.memo,
            sortOrder: i.sortOrder,
          })),
        },
      },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { include: { supplierProduct: true } },
      },
    });
    await recordAudit(tx, {
      userId: user.id,
      entity: "PurchaseOrder",
      entityId: c.id,
      action: "CREATE",
      meta: { poNo: c.poNo, supplierId: data.supplierId, totalAmount, itemCount: items.length },
    });
    return c;
  });

  return NextResponse.json(created, { status: 201 });
}
