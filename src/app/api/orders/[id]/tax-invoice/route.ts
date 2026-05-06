import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 세금계산서 발행 마킹 — Order.taxInvoicedAt 설정/해제.
 * POST { invoiced: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const invoiced = body?.invoiced !== false;

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, taxInvoiceRequested: true },
  });
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
  }
  if (!order.taxInvoiceRequested) {
    return NextResponse.json(
      { error: "이 주문은 세금계산서 발행 요청이 없습니다" },
      { status: 400 },
    );
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { taxInvoicedAt: invoiced ? new Date() : null },
    select: { id: true, taxInvoicedAt: true },
  });
  return NextResponse.json(updated);
}
