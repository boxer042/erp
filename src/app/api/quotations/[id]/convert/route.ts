import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { generateStatementNo } from "@/lib/document-no";

// 견적서 → Statement 전환 (SALES 전용, 판매 거래명세표 복제)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const target = body?.target as "statement" | undefined;

  if (target !== "statement") {
    return NextResponse.json(
      { error: "현재는 거래명세표 전환만 지원합니다" },
      { status: 400 }
    );
  }

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: { items: true, customer: true },
  });

  if (!quotation) {
    return NextResponse.json({ error: "견적서를 찾을 수 없습니다" }, { status: 404 });
  }
  if (quotation.type !== "SALES") {
    return NextResponse.json({ error: "판매 견적서만 거래명세표로 전환할 수 있습니다" }, { status: 400 });
  }

  const statement = await prisma.$transaction(async (tx) => {
    const created = await tx.statement.create({
      data: {
        statementNo: generateStatementNo(),
        status: "ISSUED",
        issueDate: new Date(),
        customerId: quotation.customerId,
        customerNameSnapshot: quotation.customer?.name || null,
        customerPhoneSnapshot: quotation.customer?.phone || null,
        customerAddressSnapshot: quotation.customer?.address || null,
        customerBusinessNumberSnapshot: quotation.customer?.businessNumber || null,
        quotationId: quotation.id,
        subtotalAmount: quotation.subtotalAmount,
        taxAmount: quotation.taxAmount,
        totalAmount: quotation.totalAmount,
        memo: quotation.memo,
        createdById: user.id,
        items: {
          create: quotation.items.map((it) => ({
            productId: it.productId,
            name: it.name,
            spec: it.spec,
            unitOfMeasure: it.unitOfMeasure,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
            isTaxable: it.isTaxable,
            sortOrder: it.sortOrder,
            memo: it.memo,
          })),
        },
      },
    });
    await tx.quotation.update({ where: { id }, data: { status: "CONVERTED" } });
    return created;
  });

  return NextResponse.json(statement, { status: 201 });
}
