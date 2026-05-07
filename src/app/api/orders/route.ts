import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { orderSchema } from "@/lib/validators/order";
import { getCurrentUser } from "@/lib/auth";
import type { OrderStatus, FulfillmentType, Prisma } from "@prisma/client";
import { classifyBoardGroup, getKrToday } from "@/lib/orders/board";
import { recordAudit } from "@/lib/audit";

function generateOrderNo() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD${y}${m}${d}-${r}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const channelId = searchParams.get("channelId");
  const fulfillmentType = searchParams.get("fulfillmentType");
  const view = searchParams.get("view"); // "board" | (default: list)
  const search = searchParams.get("search") || "";
  // 채널 필터 — "all"(또는 미지정)·"offline"(channelId=null)·<channelId>
  const channelFilter = searchParams.get("channelFilter");

  const where: Prisma.OrderWhereInput = {
    ...(status ? { status: status as OrderStatus } : {}),
    ...(channelId ? { channelId } : {}),
    ...(fulfillmentType
      ? { fulfillmentType: fulfillmentType as FulfillmentType }
      : {}),
    ...(search
      ? {
          OR: [
            { orderNo: { contains: search, mode: "insensitive" } },
            { channelOrderNo: { contains: search, mode: "insensitive" } },
            { customerName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  // 워크보드 뷰: 출고 대상(PENDING/PREPARING/SHIPPED) 중 PICKUP 제외
  if (view === "board") {
    where.status = { in: ["PENDING", "PREPARING", "SHIPPED"] };
    where.fulfillmentType = { in: ["DELIVERY", "SHIPPING"] };
    if (channelFilter === "offline") {
      where.channelId = null;
    } else if (channelFilter && channelFilter !== "all") {
      where.channelId = channelFilter;
    }
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      channel: { select: { name: true, code: true } },
      createdBy: { select: { name: true } },
      repairTicket: { select: { id: true, ticketNo: true, status: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          product: { select: { name: true } },
          serviceName: true,
        },
        take: 3,
      },
      _count: { select: { items: true } },
    },
    orderBy:
      view === "board"
        ? // expectedShipDate null 을 끝에 두기 — 미정 주문은 "예정일 미정" 그룹으로 별도 분류
          [
            { expectedShipDate: { sort: "asc", nulls: "last" } },
            { createdAt: "asc" },
          ]
        : { createdAt: "desc" },
  });

  if (view !== "board") {
    return NextResponse.json(orders);
  }

  // board view: 그룹화 + daysOverdue 계산. KST 기준 오늘 UTC 자정 Date 사용
  const today = getKrToday();
  const grouped = {
    overdue: [] as typeof orders,
    today: [] as typeof orders,
    unscheduled: [] as typeof orders,
    shipped: [] as typeof orders,
    thisWeek: [] as typeof orders,
    future: [] as typeof orders,
  };
  for (const o of orders) {
    const group = classifyBoardGroup(o.status, o.expectedShipDate, today);
    if (!group) continue;
    grouped[group].push(o);
  }
  // 채널 필터 옵션 — 활성 채널 전체 (필터 selection 과 무관하게 항상 동일한 옵션 노출)
  const channels = await prisma.salesChannel.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    groups: grouped,
    today: today.toISOString(),
    channels,
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = orderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // 채널 수수료율 조회 — channelId 없으면 오프라인 (수수료 0)
  const channel = data.channelId
    ? await prisma.salesChannel.findUnique({ where: { id: data.channelId } })
    : null;

  if (data.channelId && !channel) {
    return NextResponse.json({ error: "채널을 찾을 수 없습니다" }, { status: 404 });
  }

  // 항목별 taxType 조회 — 면세/영세율 상품은 세액 0
  const productIds = data.items.map((i) => i.productId).filter(Boolean);
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, taxType: true },
      })
    : [];
  const taxTypeById = new Map(products.map((p) => [p.id, p.taxType]));

  const items = data.items.map((item) => {
    const qty = parseFloat(item.quantity);
    const price = parseFloat(item.unitPrice);
    return {
      productId: item.productId,
      quantity: qty,
      unitPrice: price,
      totalPrice: qty * price,
      _taxable: (taxTypeById.get(item.productId) ?? "TAXABLE") === "TAXABLE",
    };
  });

  const subtotalAmount = items.reduce((sum, i) => sum + i.totalPrice, 0);
  const taxableSubtotal = items
    .filter((i) => i._taxable)
    .reduce((sum, i) => sum + i.totalPrice, 0);
  const discountAmount = parseFloat(data.discountAmount || "0");
  const shippingFee = parseFloat(data.shippingFee || "0");
  // 부가세 — 과세 항목 비율로 할인 안분 후 10%
  const taxableRatio = subtotalAmount > 0 ? taxableSubtotal / subtotalAmount : 0;
  const taxableNet = taxableSubtotal - discountAmount * taxableRatio;
  const taxAmount = Math.round(Math.max(0, taxableNet) * 0.1);
  const totalAmount = subtotalAmount - discountAmount + shippingFee + taxAmount;
  const commissionAmount = channel
    ? Math.round(subtotalAmount * Number(channel.commissionRate))
    : 0;

  // ERP 수동 등록은 PENDING 으로 시작 (재고 미차감 — prepare 액션에서 차감)
  const isPickup = data.fulfillmentType === "PICKUP";
  // paymentStatus 산출 — paymentMethod=UNPAID 또는 미입력은 외상, 그 외는 결제 완료.
  // 결제 상태는 출고 상태와 별개의 축. 추후 부분환불/환불 액션에서 갱신.
  const paymentStatus =
    !data.paymentMethod || data.paymentMethod === "UNPAID" ? "UNPAID" : "PAID";
  const order = await prisma.order.create({
    data: {
      orderNo: generateOrderNo(),
      channelId: data.channelId || null,
      channelOrderNo: data.channelOrderNo || null,
      customerId: data.customerId || null,
      customerName: data.customerName || null,
      customerPhone: data.customerPhone || null,
      recipientName: isPickup ? null : data.recipientName || null,
      recipientPhone: isPickup ? null : data.recipientPhone || null,
      shippingAddress: isPickup ? null : data.shippingAddress || null,
      orderDate: new Date(data.orderDate),
      fulfillmentType: data.fulfillmentType,
      expectedShipDate:
        isPickup || !data.expectedShipDate
          ? null
          : new Date(data.expectedShipDate),
      paymentMethod: data.paymentMethod ?? null,
      paymentStatus,
      subtotalAmount,
      discountAmount,
      shippingFee,
      taxAmount,
      totalAmount,
      commissionAmount,
      memo: data.memo || null,
      createdById: user.id,
      items: {
        create: items.map(({ _taxable, ...it }) => it),
      },
    },
    include: {
      channel: { select: { name: true } },
      items: {
        include: { product: { select: { name: true, sku: true } } },
      },
    },
  });

  // UNPAID 면 customerLedger SALE 기록 (POS checkout 과 동일 정책)
  if (data.paymentMethod === "UNPAID" && data.customerId) {
    const last = await prisma.customerLedger.findFirst({
      where: { customerId: data.customerId },
      orderBy: { date: "desc" },
    });
    const prevBalance = last ? Number(last.balance) : 0;
    await prisma.customerLedger.create({
      data: {
        customerId: data.customerId,
        type: "SALE",
        description: `주문 ${order.orderNo}`,
        debitAmount: totalAmount,
        creditAmount: 0,
        balance: prevBalance + totalAmount,
        referenceId: order.id,
        referenceType: "ORDER",
      },
    });
  }

  await recordAudit(prisma, {
    userId: user.id,
    entity: "Order",
    entityId: order.id,
    action: "CREATE",
    meta: {
      orderNo: order.orderNo,
      totalAmount,
      itemCount: items.length,
      paymentMethod: data.paymentMethod,
      channelId: data.channelId,
    },
  });

  return NextResponse.json(order, { status: 201 });
}
