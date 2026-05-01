import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Prisma } from "@prisma/client";
import { ExpenseCategory, OrderPaymentMethod } from "@prisma/client";

export const EXPENSE_CATEGORIES = [
  "SHIPPING",
  "RENT",
  "UTILITIES",
  "SALARY",
  "PACKAGING",
  "OFFICE_SUPPLIES",
  "MARKETING",
  "MAINTENANCE",
  "INVENTORY_USAGE",
  "OTHER",
] as const;
export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ExpenseCategoryKey, string> = {
  SHIPPING: "택배비",
  RENT: "임대료",
  UTILITIES: "공과금",
  SALARY: "인건비",
  PACKAGING: "포장재",
  OFFICE_SUPPLIES: "사무소모품",
  MARKETING: "광고·판촉",
  MAINTENANCE: "수리·유지보수",
  INVENTORY_USAGE: "내 상품 사용",
  OTHER: "기타",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const category = searchParams.get("category");
  const supplierId = searchParams.get("supplierId");
  const q = searchParams.get("q");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    500,
    Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10) || 50),
  );

  const where: Prisma.ExpenseWhereInput = {
    ...(from || to
      ? {
          date: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lt: new Date(to) } : {}),
          },
        }
      : {}),
    ...(category ? { category: category as ExpenseCategory } : {}),
    ...(supplierId ? { supplierId } : {}),
    ...(q
      ? {
          OR: [
            { description: { contains: q, mode: "insensitive" as const } },
            { memo: { contains: q, mode: "insensitive" as const } },
            { supplier: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.expense.count({ where }),
  ]);

  // 카테고리별 합계 (기간 필터만 적용 — 카테고리/검색 필터와 무관)
  const allInPeriod = await prisma.expense.findMany({
    where: {
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lt: new Date(to) } : {}),
            },
          }
        : {}),
    },
    select: { category: true, amount: true, recoverable: true },
  });

  const summaryMap: Record<string, { total: number; recoverable: number }> = {};
  let totalsAll = 0;
  let totalsRecoverable = 0;
  for (const e of allInPeriod) {
    const amt = Number(e.amount);
    const slot = (summaryMap[e.category] ??= { total: 0, recoverable: 0 });
    slot.total += amt;
    if (e.recoverable) slot.recoverable += amt;
    totalsAll += amt;
    if (e.recoverable) totalsRecoverable += amt;
  }
  const summary = Object.entries(summaryMap).map(([category, v]) => ({
    category,
    label: CATEGORY_LABELS[category as ExpenseCategoryKey] ?? category,
    total: v.total,
    recoverable: v.recoverable,
    net: v.total - v.recoverable,
  }));

  // 영수증 첨부가 있는 항목은 signed URL 재발급 (private 버킷)
  const pathsToSign = entries
    .map((e) => e.attachmentPath)
    .filter((p): p is string => Boolean(p));
  let signedMap: Record<string, string> = {};
  if (pathsToSign.length > 0) {
    const supabase = await createClient();
    const { data: signed } = await supabase.storage
      .from("expense-receipts")
      .createSignedUrls(pathsToSign, 60 * 60);
    if (signed) {
      signedMap = signed.reduce<Record<string, string>>((acc, s) => {
        if (s.path && s.signedUrl) acc[s.path] = s.signedUrl;
        return acc;
      }, {});
    }
  }
  const entriesWithSignedUrls = entries.map((e) =>
    e.attachmentPath && signedMap[e.attachmentPath]
      ? { ...e, attachmentUrl: signedMap[e.attachmentPath] }
      : e,
  );

  return NextResponse.json({
    entries: entriesWithSignedUrls,
    summary,
    total,
    page,
    pageSize,
    totals: { all: totalsAll, recoverable: totalsRecoverable, net: totalsAll - totalsRecoverable },
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
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

  if (!date || !amount || !category || !description) {
    return NextResponse.json({ error: "필수 항목이 누락되었습니다" }, { status: 400 });
  }

  if (!EXPENSE_CATEGORIES.includes(category as ExpenseCategoryKey)) {
    return NextResponse.json({ error: "유효하지 않은 카테고리입니다" }, { status: 400 });
  }

  const expense = await prisma.expense.create({
    data: {
      date: new Date(date),
      amount: parseFloat(amount),
      category: category as ExpenseCategory,
      description,
      memo: memo || null,
      isTaxable: isTaxable ?? true,
      supplierId: supplierId || null,
      createdById: user?.id ?? null,
      attachmentUrl: attachmentUrl || null,
      attachmentPath: attachmentPath || null,
      attachmentName: attachmentName || null,
      paymentMethod: (paymentMethod as OrderPaymentMethod | null | undefined) || null,
      recoverable: recoverable ?? false,
    },
    include: {
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(expense, { status: 201 });
}
