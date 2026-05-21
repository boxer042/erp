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

  // ── 주문 매장 부담 배송 원가 — 가상 경비 행으로 합산 ────────────────────
  // Order.shippingCostBorne 은 별도 Expense 가 아니라 Order 필드.
  // 사용자가 같은 비용을 중복 입력하지 않도록 가상 행으로 노출 + 합계 가산.
  // 카테고리 필터가 SHIPPING 이거나 없을 때만 포함.
  const includeOrderShipping =
    !supplierId && (!category || category === "SHIPPING");
  const orderShippingDateFilter: Prisma.OrderWhereInput =
    from || to
      ? {
          orderDate: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lt: new Date(to) } : {}),
          },
        }
      : {};
  const shippingOrders = includeOrderShipping
    ? await prisma.order.findMany({
        where: {
          shippingCostBorne: { gt: 0 },
          status: { not: "CANCELLED" },
          ...orderShippingDateFilter,
          ...(q
            ? {
                OR: [
                  { orderNo: { contains: q, mode: "insensitive" as const } },
                  { customerName: { contains: q, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          orderNo: true,
          orderDate: true,
          shippingCostBorne: true,
          paymentMethod: true,
          customerId: true,
          customerName: true,
          fulfillmentType: true,
          channel: { select: { name: true } },
          customer: { select: { id: true, name: true } },
        },
        orderBy: { orderDate: "desc" },
        take: 5000,
      })
    : [];

  // 가상 행 — Expense 인터페이스 모양
  const FULFILLMENT_LABEL: Record<string, string> = {
    IN_STORE: "매장",
    PICKUP: "픽업",
    DELIVERY: "배달",
    QUICK: "퀵",
    SHIPPING: "택배",
  };
  // Order.shippingCostBorne 은 세전(net) 저장. Expense.amount 는 VAT 포함(gross) 저장 컨벤션 →
  // 표시·합계 일관성을 위해 1.1 gross-up 해서 노출. 추후 비과세 케이스 생기면 isTaxable 분기 필요.
  const grossUp = (net: number) => Math.round(net * 1.1);
  const virtualShippingEntries = shippingOrders.map((o) => ({
    id: `virtual-shipping-${o.id}`,
    date: o.orderDate.toISOString(),
    amount: String(grossUp(Number(o.shippingCostBorne))),
    category: "SHIPPING",
    description: `주문 ${o.orderNo} 배송 원가 (매장 부담)`,
    isTaxable: true,
    supplierId: null,
    supplier: null,
    customerId: o.customerId,
    customer: o.customer,
    createdBy: null,
    referenceId: o.id,
    referenceType: "ORDER_SHIPPING_BORNE",
    memo: [
      o.customerName ? `손님: ${o.customerName}` : null,
      o.channel?.name ? `채널: ${o.channel.name}` : null,
      o.fulfillmentType
        ? `출고: ${FULFILLMENT_LABEL[o.fulfillmentType] ?? o.fulfillmentType}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
    attachmentUrl: null,
    attachmentPath: null,
    attachmentName: null,
    paymentMethod: o.paymentMethod,
    recoverable: false,
  }));
  const virtualShippingTotal = shippingOrders.reduce(
    (s, o) => s + grossUp(Number(o.shippingCostBorne)),
    0,
  );

  const [realEntries, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      // 가상 행도 함께 페이지네이션 하려면 raw fetch 후 merge. shippingOrders 가 보통 적음.
      take: includeOrderShipping ? 5000 : pageSize,
      skip: includeOrderShipping ? 0 : (page - 1) * pageSize,
    }),
    prisma.expense.count({ where }),
  ]);

  // 가상 행과 합쳐 정렬 후 페이지네이션 (가상 행 포함 시만)
  let entries = realEntries as unknown[];
  if (includeOrderShipping) {
    const merged = [
      ...(realEntries.map((e) => ({
        ...e,
        date: e.date.toISOString(),
      })) as unknown[]),
      ...virtualShippingEntries,
    ].sort((a, b) => {
      const ad = (a as { date: string }).date;
      const bd = (b as { date: string }).date;
      return ad < bd ? 1 : ad > bd ? -1 : 0;
    });
    const start = (page - 1) * pageSize;
    entries = merged.slice(start, start + pageSize);
  }

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
  // 가상 주문 배송 원가도 SHIPPING summary 에 합산 (기간 전체 — 페이지 외 포함)
  if (includeOrderShipping && virtualShippingTotal > 0) {
    const slot = (summaryMap["SHIPPING"] ??= { total: 0, recoverable: 0 });
    slot.total += virtualShippingTotal;
    totalsAll += virtualShippingTotal;
  }
  const summary = Object.entries(summaryMap).map(([category, v]) => ({
    category,
    label: CATEGORY_LABELS[category as ExpenseCategoryKey] ?? category,
    total: v.total,
    recoverable: v.recoverable,
    net: v.total - v.recoverable,
  }));

  // 영수증 첨부가 있는 항목은 signed URL 재발급 (private 버킷)
  type EntryShape = { attachmentPath?: string | null; attachmentUrl?: string | null };
  const typedEntries = entries as EntryShape[];
  const pathsToSign = typedEntries
    .map((e) => e.attachmentPath ?? null)
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
  const entriesWithSignedUrls = typedEntries.map((e) =>
    e.attachmentPath && signedMap[e.attachmentPath]
      ? { ...e, attachmentUrl: signedMap[e.attachmentPath] }
      : e,
  );

  // total — 가상 행 포함 시 실제+가상 합. 페이지네이션 표시용.
  const totalCount = includeOrderShipping
    ? total + virtualShippingEntries.length
    : total;

  return NextResponse.json({
    entries: entriesWithSignedUrls,
    summary,
    total: totalCount,
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
