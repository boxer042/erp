import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supplierReturnSchema } from "@/lib/validators/return";
import { getCurrentUser } from "@/lib/auth";

function generateReturnNo() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `RT${y}${m}${d}-${r}`;
}

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

  const returns = await prisma.supplierReturn.findMany({
    where: {
      ...(status ? { status: status as "PENDING" | "CONFIRMED" | "CANCELLED" } : {}),
      ...(supplierId ? { supplierId } : {}),
    },
    include: {
      supplier: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
      exchangeIncoming: { select: { id: true, incomingNo: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // 환불 예상액 계산 — 일괄 조회 후 그룹핑 (N+1 방지)
  const returnIds = returns.map((r) => r.id);
  const allItems = await prisma.supplierReturnItem.findMany({
    where: { returnId: { in: returnIds } },
    select: {
      returnId: true,
      totalPrice: true,
      supplierProduct: { select: { isTaxable: true } },
    },
  });
  const goodsByReturnId = new Map<string, number>();
  for (const it of allItems) {
    const supply = parseFloat(it.totalPrice.toString());
    const tax = it.supplierProduct.isTaxable ? Math.round(supply * 0.1) : 0;
    goodsByReturnId.set(it.returnId, (goodsByReturnId.get(it.returnId) ?? 0) + supply + tax);
  }

  const returnsWithAmount = returns.map((r) => {
    const goods = goodsByReturnId.get(r.id) ?? 0;
    const cost = Number(r.returnCost ?? 0);
    const sign = r.returnCostType === "ADD" ? 1 : r.returnCostType === "DEDUCT" ? -1 : 0;
    const refundAmount = goods + sign * cost;
    return { ...r, refundAmount };
  });

  return NextResponse.json(returnsWithAmount);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = supplierReturnSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const returnNo = generateReturnNo();

  const items = data.items.map((item) => {
    const qty = parseFloat(item.quantity);
    const price = parseFloat(item.unitPrice);
    return {
      supplierProductId: item.supplierProductId,
      quantity: qty,
      unitPrice: price,
      totalPrice: qty * price,
      memo: item.memo || null,
    };
  });

  const result = await prisma.$transaction(async (tx) => {
    // 교환 입고 사전 생성 (PENDING)
    let exchangeIncomingId: string | null = null;
    if (data.isExchange) {
      const exchangeIncoming = await tx.incoming.create({
        data: {
          incomingNo: generateIncomingNo(),
          supplierId: data.supplierId,
          incomingDate: new Date(data.returnDate),
          totalAmount: 0,
          memo: `반품 ${returnNo} 교환 입고`,
          createdById: user.id,
        },
      });
      exchangeIncomingId = exchangeIncoming.id;
    }

    const returnCostValue = data.returnCost ? parseFloat(data.returnCost) : null;
    const created = await tx.supplierReturn.create({
      data: {
        returnNo,
        supplierId: data.supplierId,
        returnDate: new Date(data.returnDate),
        returnReason: data.returnReason || null,
        memo: data.memo || null,
        returnCost: returnCostValue,
        returnCostIsTaxable: data.returnCostIsTaxable,
        returnCostType: (returnCostValue && returnCostValue > 0) ? (data.returnCostType ?? null) : null,
        returnCostNote: data.returnCostNote || null,
        exchangeIncomingId,
        createdById: user.id,
        items: {
          create: items,
        },
      },
      include: {
        supplier: { select: { name: true } },
        items: {
          include: { supplierProduct: { select: { name: true, supplierCode: true } } },
        },
        exchangeIncoming: { select: { id: true, incomingNo: true, status: true } },
      },
    });

    return created;
  });

  return NextResponse.json(result, { status: 201 });
}
