import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { generateStatementNo, generateDocumentNo } from "@/lib/document-no";

/**
 * 견적서 전환 — Statement / Order / Incoming 으로 복제 + 원본 status=CONVERTED.
 *
 * - target=statement: 모든 SALES 견적서 → Statement (판매 거래명세표)
 * - target=order:     SALES 견적서 → Order (POS 채널) — 채널 ID 또는 채널 코드 명시 필수
 * - target=incoming:  PURCHASE 견적서 → Incoming (입고)
 *
 * 자유 입력 라인(productId·supplierProductId 없음)은 Order/Incoming 전환 시 거부.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAuth();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const target = body?.target as "statement" | "order" | "incoming" | undefined;
  const channelId = body?.channelId as string | undefined;

  if (!target || !["statement", "order", "incoming"].includes(target)) {
    return NextResponse.json(
      { error: "target 은 statement / order / incoming 중 하나여야 합니다" },
      { status: 400 },
    );
  }

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: { items: true, customer: true, supplier: true },
  });

  if (!quotation) {
    return NextResponse.json({ error: "견적서를 찾을 수 없습니다" }, { status: 404 });
  }

  // ── target 별 전환 ─────────────────────────────────────────────────
  if (target === "statement") {
    if (quotation.type !== "SALES") {
      return NextResponse.json(
        { error: "판매 견적서만 거래명세표로 전환할 수 있습니다" },
        { status: 400 },
      );
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
          customerBusinessNumberSnapshot:
            quotation.customer?.businessNumber || null,
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

  if (target === "order") {
    if (quotation.type !== "SALES") {
      return NextResponse.json(
        { error: "판매 견적서만 주문으로 전환할 수 있습니다" },
        { status: 400 },
      );
    }
    if (!channelId) {
      return NextResponse.json(
        { error: "channelId 가 필요합니다 — 어느 채널로 전환할지 선택하세요" },
        { status: 400 },
      );
    }
    const channel = await prisma.salesChannel.findUnique({
      where: { id: channelId },
      select: { id: true, isActive: true },
    });
    if (!channel || !channel.isActive) {
      return NextResponse.json(
        { error: "유효하지 않은 채널입니다" },
        { status: 400 },
      );
    }
    // 자유 입력 라인 검사 — productId 없는 라인은 Order 에 못 들어감
    const freeLines = quotation.items.filter((i) => !i.productId);
    if (freeLines.length > 0) {
      return NextResponse.json(
        {
          error: `상품 매핑 안 된 자유 입력 라인 ${freeLines.length}건 — 주문 전환 전 매핑 필요`,
          freeLineNames: freeLines.map((l) => l.name),
        },
        { status: 400 },
      );
    }

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNo: generateDocumentNo("ORD"),
          channelId: channel.id,
          status: "PENDING",
          customerId: quotation.customerId,
          customerName: quotation.customer?.name || null,
          customerPhone: quotation.customer?.phone || null,
          orderDate: new Date(),
          subtotalAmount: quotation.subtotalAmount,
          taxAmount: quotation.taxAmount,
          totalAmount: quotation.totalAmount,
          commissionAmount: 0,
          quotationId: quotation.id,
          memo: quotation.memo,
          createdById: user.id,
          items: {
            create: quotation.items.map((it) => ({
              productId: it.productId!,
              quantity: it.quantity,
              listPrice: it.listPrice,
              discountAmount: it.discountAmount,
              unitPrice: it.unitPrice,
              totalPrice: it.totalPrice,
            })),
          },
        },
      });
      await tx.quotation.update({ where: { id }, data: { status: "CONVERTED" } });
      return created;
    });
    return NextResponse.json(order, { status: 201 });
  }

  if (target === "incoming") {
    if (quotation.type !== "PURCHASE") {
      return NextResponse.json(
        { error: "매입 견적서만 입고로 전환할 수 있습니다" },
        { status: 400 },
      );
    }
    if (!quotation.supplierId) {
      return NextResponse.json(
        { error: "거래처가 없는 견적서는 입고로 전환할 수 없습니다" },
        { status: 400 },
      );
    }
    const freeLines = quotation.items.filter((i) => !i.supplierProductId);
    if (freeLines.length > 0) {
      return NextResponse.json(
        {
          error: `공급상품 매핑 안 된 자유 입력 라인 ${freeLines.length}건 — 입고 전환 전 매핑 필요`,
          freeLineNames: freeLines.map((l) => l.name),
        },
        { status: 400 },
      );
    }

    const incoming = await prisma.$transaction(async (tx) => {
      const created = await tx.incoming.create({
        data: {
          incomingNo: generateDocumentNo("IN"),
          supplierId: quotation.supplierId!,
          status: "PENDING",
          incomingDate: new Date(),
          quotationId: quotation.id,
          memo: quotation.memo,
          createdById: user.id,
          taxAmount: quotation.taxAmount,
          totalAmount: quotation.totalAmount,
          shippingCost: 0,
          items: {
            create: quotation.items.map((it) => ({
              supplierProductId: it.supplierProductId!,
              quantity: it.quantity,
              originalPrice: it.listPrice,
              discountAmount: it.discountAmount,
              unitPrice: it.unitPrice,
              totalPrice: it.totalPrice,
            })),
          },
        },
      });
      await tx.quotation.update({ where: { id }, data: { status: "CONVERTED" } });
      return created;
    });
    return NextResponse.json(incoming, { status: 201 });
  }

  return NextResponse.json({ error: "지원하지 않는 target" }, { status: 400 });
}
