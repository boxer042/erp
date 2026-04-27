import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ExpenseCategory, OrderPaymentMethod } from "@prisma/client";
import { EXPENSE_CATEGORIES, type ExpenseCategoryKey } from "../route";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!expense) return NextResponse.json({ error: "경비를 찾을 수 없습니다" }, { status: 404 });
  return NextResponse.json(expense);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { date, amount, category, description, memo, isTaxable, supplierId, attachmentUrl, attachmentPath, attachmentName, paymentMethod, recoverable } = body as {
    date: string;
    amount: string;
    category: string;
    description: string;
    memo?: string;
    isTaxable?: boolean;
    supplierId?: string | null;
    attachmentUrl?: string | null;
    attachmentPath?: string | null;
    attachmentName?: string | null;
    paymentMethod?: string | null;
    recoverable?: boolean;
  };

  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) return NextResponse.json({ error: "경비를 찾을 수 없습니다" }, { status: 404 });

  if (expense.referenceType === "INVENTORY_MOVEMENT") {
    return NextResponse.json(
      { error: "내 상품 사용 경비는 수정할 수 없습니다. 반입 처리(STOCKTAKE_PLUS)로 별도 기록하세요" },
      { status: 400 },
    );
  }

  if (!EXPENSE_CATEGORIES.includes(category as ExpenseCategoryKey)) {
    return NextResponse.json({ error: "유효하지 않은 카테고리입니다" }, { status: 400 });
  }

  const updated = await prisma.expense.update({
    where: { id },
    data: {
      date: new Date(date),
      amount: parseFloat(amount),
      category: category as ExpenseCategory,
      description,
      memo: memo || null,
      ...(isTaxable !== undefined ? { isTaxable } : {}),
      supplierId: supplierId ?? null,
      ...(attachmentUrl !== undefined ? { attachmentUrl } : {}),
      ...(attachmentPath !== undefined ? { attachmentPath } : {}),
      ...(attachmentName !== undefined ? { attachmentName } : {}),
      ...(paymentMethod !== undefined ? { paymentMethod: (paymentMethod as OrderPaymentMethod | null) || null } : {}),
      ...(recoverable !== undefined ? { recoverable } : {}),
    },
    include: {
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) return NextResponse.json({ error: "경비를 찾을 수 없습니다" }, { status: 404 });

  // 입고에서 자동 생성된 경비는 삭제 불가 (update-shipping으로만 수정)
  if (expense.referenceType === "INCOMING") {
    return NextResponse.json({ error: "입고에서 생성된 경비는 입고 수정을 통해 변경하세요" }, { status: 400 });
  }

  // 내 상품 사용 경비는 삭제 불가 — 반입 처리로만 복원
  if (expense.referenceType === "INVENTORY_MOVEMENT") {
    return NextResponse.json(
      { error: "내 상품 사용 경비는 삭제할 수 없습니다. 반입 처리(STOCKTAKE_PLUS)로 재고를 복원하세요" },
      { status: 400 },
    );
  }

  // 영수증 Storage 객체도 삭제
  if (expense.attachmentPath) {
    try {
      const supabase = await createClient();
      await supabase.storage.from("expense-receipts").remove([expense.attachmentPath]);
    } catch {
      // Storage 삭제 실패는 무시 (DB 삭제가 우선)
    }
  }

  await prisma.expense.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
