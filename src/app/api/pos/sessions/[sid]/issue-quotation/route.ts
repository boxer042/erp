/**
 * 저장된 상담(parked PosSession) → 견적서 발행 일괄 변환.
 *
 * 흐름:
 *  - parked PosSession 의 items 를 그대로 Quotation.items 로 옮김 (재고 차감 X, 단순 발행)
 *  - Quotation.status = "DRAFT" / type = "SALES"
 *  - 가격은 세션 저장 시점 그대로 (POS issue-document 와 동일 변환 규칙)
 *  - 고객 미연결 세션은 거부 (Quotation 은 customer 필수)
 *
 * 호출 위치: 저장된 상담 페이지의 [견적서 발행] 버튼.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { generateQuotationNo } from "@/lib/document-no";

interface CartItemLite {
  productId?: string;
  itemType?: string;
  name?: string;
  unitOfMeasure?: string;
  unitPrice?: number;
  listPrice?: number;
  quantity?: number;
  discount?: string;
  taxType?: "TAXABLE" | "TAX_FREE";
  isZeroRate?: boolean;
}

function calcDiscountPerUnit(unitPrice: number, discount: string): number {
  const d = (discount ?? "0").trim();
  if (!d || d === "0") return 0;
  if (d.endsWith("%")) {
    const pct = Math.max(0, Math.min(100, parseFloat(d) || 0));
    return Math.round((unitPrice * pct) / 100);
  }
  return parseInt(d.replace(/,/g, ""), 10) || 0;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sid: string }> },
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;
  const { sid: id } = await params;

  const session = await prisma.posSession.findFirst({
    where: { id, userId: user.id },
  });
  if (!session) {
    return NextResponse.json(
      { error: "세션을 찾을 수 없습니다" },
      { status: 404 },
    );
  }
  if (session.deletedAt) {
    return NextResponse.json(
      { error: "이미 삭제된 세션입니다" },
      { status: 400 },
    );
  }
  if (!session.customerId) {
    return NextResponse.json(
      { error: "견적서 발행은 고객 연결이 필요합니다 — 먼저 가져와서 고객 연결 후 발행해주세요" },
      { status: 400 },
    );
  }

  const cartItems: CartItemLite[] =
    (session.items as unknown as CartItemLite[]) ?? [];
  if (cartItems.length === 0) {
    return NextResponse.json(
      { error: "카트가 비어있습니다" },
      { status: 400 },
    );
  }

  // 견적서 라인 변환 — POS issue-document.ts 의 mapCartItems 와 동일 규칙
  const items = cartItems.map((it, idx) => {
    const unitPrice = Number(it.unitPrice ?? 0);
    const taxFree = it.taxType === "TAX_FREE" || !!it.isZeroRate;
    const discountPerUnit = calcDiscountPerUnit(unitPrice, it.discount ?? "0");
    const unitPriceAfterDiscount = Math.max(0, unitPrice - discountPerUnit);
    const qty = new Prisma.Decimal(it.quantity ?? 1);
    const price = new Prisma.Decimal(Math.round(unitPriceAfterDiscount));
    const listP = new Prisma.Decimal(Math.round(unitPrice));
    const disc = new Prisma.Decimal(Math.round(discountPerUnit));
    return {
      productId: it.productId ?? null,
      supplierProductId: null,
      name: it.name ?? "",
      spec: null,
      unitOfMeasure: it.unitOfMeasure ?? "EA",
      quantity: qty,
      listPrice: listP,
      discountAmount: disc,
      unitPrice: price,
      totalPrice: qty.mul(price),
      isTaxable: !taxFree,
      sortOrder: idx,
      memo: null,
    };
  });

  const subtotal = items.reduce(
    (acc, it) => acc.add(it.totalPrice),
    new Prisma.Decimal(0),
  );
  const tax = items.reduce(
    (acc, it) => (it.isTaxable ? acc.add(it.totalPrice.mul("0.1")) : acc),
    new Prisma.Decimal(0),
  );
  const total = subtotal.add(tax);

  const today = new Date();
  const quotation = await prisma.quotation.create({
    data: {
      quotationNo: generateQuotationNo(),
      type: "SALES",
      status: "DRAFT",
      issueDate: today,
      customerId: session.customerId,
      title: session.label ? `[저장된 상담] ${session.label}` : null,
      subtotalAmount: subtotal,
      taxAmount: tax,
      totalAmount: total,
      memo: "저장된 상담에서 일괄 발행",
      createdById: user.id,
      items: { create: items },
    },
    select: { id: true, quotationNo: true },
  });

  return NextResponse.json(quotation, { status: 201 });
}
