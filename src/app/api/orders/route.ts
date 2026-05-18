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
            // 품목 단위 행에 맞춰 상품명/서비스명 검색도 포함
            {
              items: {
                some: {
                  product: { name: { contains: search, mode: "insensitive" } },
                },
              },
            },
            {
              items: {
                some: { serviceName: { contains: search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };

  // 워크보드 뷰: 출고 대상 + 반품 처리 대상. IN_STORE(즉시판매) 제외, PICKUP(픽업대기)는 노출.
  // RETURN_REQUESTED/RETURN_ACCEPTED 는 반품 처리 대기 — 매장이 결정·회수해야 하므로 워크보드에 노출.
  if (view === "board") {
    // 평소엔 진행 중 주문만 (운영 우선순위 보드).
    // - search 가 있으면 종결도 포함 ("어제 발송된 그 주문 어딨지?")
    // - includeClosed=1 토글 켜면 종결 포함 (검색 없어도 명시적 보기)
    const includeClosed =
      searchParams.get("includeClosed") === "1" || !!search;
    const inProgressStatuses = [
      "PENDING",
      "PREPARING",
      "PREPARING_PACKED",
      "SHIPPED",
      "RETURN_REQUESTED",
      "RETURN_ACCEPTED",
      "RETURN_PICKING",
      "RETURN_COLLECTED",
      "RETURN_INSPECTED",
    ] as const;
    const closedStatuses = [
      "COMPLETED",
      "RETURNED",
      "EXCHANGED",
      "CANCELLED",
    ] as const;
    where.status = {
      in: includeClosed
        ? [...inProgressStatuses, ...closedStatuses]
        : [...inProgressStatuses],
    };
    where.fulfillmentType = { in: ["PICKUP", "DELIVERY", "SHIPPING"] };
    if (channelFilter === "offline") {
      where.channelId = null;
    } else if (channelFilter === "external") {
      where.channelId = { not: null };
    } else if (channelFilter && channelFilter !== "all") {
      where.channelId = channelFilter;
    }
  }

  // 반품 처리 전용 뷰 — RETURN_* 단계만, fulfillmentType 무관(매장 픽업 반품도 포함).
  if (view === "claims") {
    where.status = {
      in: [
        "RETURN_REQUESTED",
        "RETURN_ACCEPTED",
        "RETURN_PICKING",
        "RETURN_COLLECTED",
        "RETURN_INSPECTED",
      ],
    };
    if (channelFilter === "offline") {
      where.channelId = null;
    } else if (channelFilter === "external") {
      where.channelId = { not: null };
    } else if (channelFilter && channelFilter !== "all") {
      where.channelId = channelFilter;
    }
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      channel: { select: { name: true, code: true } },
      createdBy: { select: { name: true } },
      // shippingPaymentType, shippingFee 자동 포함 (Order 의 scalar 필드)
      repairTicket: { select: { id: true, ticketNo: true, status: true } },
      // 교환 새 주문 식별용 — 비어있으면 일반 주문, 있으면 -EX
      exchangedFromOrders: { select: { id: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          shippedQty: true,
          returnedQty: true,
          unitPrice: true,
          totalPrice: true,
          lineRole: true,
          parentItemId: true,
          optionSnapshot: true,
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              isCanonical: true,
              productType: true,
            },
          },
          serviceName: true,
          // 진입 경로 SKU — 워크보드 chip 표시용 (자사몰/외부 채널만 채워짐, POS 는 null)
          entryProductId: true,
          entryProduct: { select: { id: true, name: true, sku: true } },
        },
        // 품목별 행 워크보드 — 모든 OrderItem 노출 (take 제거)
        // MAIN 먼저, OPTION_REF/ADDON 자식 라인은 parentItemId 따라 정렬됨 (클라이언트 평탄화에서 처리)
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

  // 부분 출고/반품 표시용 — 항목 전체 합계 (items.take:3 한계 우회)
  const orderIds = orders.map((o) => o.id);
  const itemAggregates = orderIds.length
    ? await prisma.orderItem.groupBy({
        by: ["orderId"],
        where: { orderId: { in: orderIds } },
        _sum: { quantity: true, shippedQty: true, returnedQty: true },
      })
    : [];
  const aggMap = new Map(
    itemAggregates.map((a) => [
      a.orderId,
      {
        totalQty: Number(a._sum.quantity ?? 0),
        shippedQty: Number(a._sum.shippedQty ?? 0),
        returnedQty: Number(a._sum.returnedQty ?? 0),
      },
    ]),
  );
  const ordersWithAgg = orders.map((o) => ({
    ...o,
    partialState: aggMap.get(o.id) ?? {
      totalQty: 0,
      shippedQty: 0,
      returnedQty: 0,
    },
  }));

  if (view !== "board") {
    return NextResponse.json(ordersWithAgg);
  }

  // board view: 그룹화 + daysOverdue 계산. KST 기준 오늘 UTC 자정 Date 사용
  const today = getKrToday();
  const grouped = {
    overdue: [] as typeof ordersWithAgg,
    today: [] as typeof ordersWithAgg,
    unscheduled: [] as typeof ordersWithAgg,
    shipped: [] as typeof ordersWithAgg,
    thisWeek: [] as typeof ordersWithAgg,
    future: [] as typeof ordersWithAgg,
    returnPending: [] as typeof ordersWithAgg,
    closed: [] as typeof ordersWithAgg,
  };
  for (const o of ordersWithAgg) {
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
  const productIds = data.items
    .map((i) => i.productId)
    .filter((id): id is string => Boolean(id));
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, taxType: true },
      })
    : [];
  const taxTypeById = new Map(products.map((p) => [p.id, p.taxType]));

  // 옵션 처리 — 모든 items 의 optionValueIds 일괄 조회
  const allOptionValueIds = Array.from(
    new Set(data.items.flatMap((i) => i.optionValueIds ?? [])),
  );
  const optionValues = allOptionValueIds.length
    ? await prisma.productOptionValue.findMany({
        where: { id: { in: allOptionValueIds } },
        include: {
          option: { select: { name: true } },
          mappedProduct: { select: { id: true, taxType: true, sellingPrice: true, name: true } },
        },
      })
    : [];
  const optionValueMap = new Map(optionValues.map((v) => [v.id, v]));

  // 메인 라인 + OPTION_REF 자식 라인 모두 평탄화. parentItemIndex 로 부모 link 표시.
  type StagedItem = {
    productId: string | null;
    serviceName: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    lineRole: "MAIN" | "OPTION_REF";
    parentItemIndex: number | null;
    optionSnapshot: Record<string, string> | null;
    entryProductId: string | null;
    _taxable: boolean;
  };

  const stagedItems: StagedItem[] = [];
  for (const item of data.items) {
    const qty = parseFloat(item.quantity);
    const price = parseFloat(item.unitPrice);

    // 기술료/공임 등 서비스 라인 — productId 없음. 재고·옵션 무관, 항상 과세.
    if (!item.productId) {
      stagedItems.push({
        productId: null,
        serviceName: item.serviceName?.trim() || "기술료",
        quantity: qty,
        unitPrice: price,
        totalPrice: qty * price,
        lineRole: "MAIN",
        parentItemIndex: null,
        optionSnapshot: null,
        entryProductId: null,
        _taxable: true,
      });
      continue;
    }

    // 옵션값 처리 — 추가가 합산 + snapshot + OPTION_REF 자식 라인 후보
    let unitAddPrice = 0;
    const snapshot: Record<string, string> = {};
    const addonRefs: typeof optionValues = [];
    for (const optId of item.optionValueIds ?? []) {
      const ov = optionValueMap.get(optId);
      if (!ov) continue;
      snapshot[ov.option.name] = ov.label;
      unitAddPrice += Number(ov.addPrice);
      // mappedProductId 가 있으면 OPTION_REF 자식 라인으로 분리 (메모리 케이스)
      if (ov.mappedProductId && ov.mappedProduct) {
        addonRefs.push(ov);
      }
    }

    const finalUnitPrice = price + unitAddPrice;
    const mainIdx = stagedItems.length;
    stagedItems.push({
      productId: item.productId,
      serviceName: null,
      quantity: qty,
      unitPrice: finalUnitPrice,
      totalPrice: qty * finalUnitPrice,
      lineRole: "MAIN",
      parentItemIndex: null,
      optionSnapshot: Object.keys(snapshot).length > 0 ? snapshot : null,
      entryProductId: item.entryProductId ?? null,
      _taxable: (taxTypeById.get(item.productId) ?? "TAXABLE") === "TAXABLE",
    });

    // OPTION_REF 자식 라인들 — mappedProduct 별도 OrderItem
    for (const ref of addonRefs) {
      const mp = ref.mappedProduct!;
      const refUnit = Number(ref.addPrice) > 0
        ? Number(ref.addPrice)
        : Number(mp.sellingPrice ?? 0);
      stagedItems.push({
        productId: mp.id,
        serviceName: null,
        quantity: qty, // 메인 수량과 동일 (1 PC 사면 1 메모리)
        unitPrice: refUnit,
        totalPrice: qty * refUnit,
        lineRole: "OPTION_REF",
        parentItemIndex: mainIdx,
        optionSnapshot: null,
        entryProductId: null, // OPTION_REF 자식은 funnel 분석 대상 아님
        _taxable: (mp.taxType ?? "TAXABLE") === "TAXABLE",
      });
      // OPTION_REF 의 unitPrice 가 메인 라인 unitPrice 에 이미 포함되지 않게 조정 —
      // 정책: addPrice 는 메인 라인에서 빼고 별도 라인으로 옮김
      stagedItems[mainIdx].unitPrice -= refUnit;
      stagedItems[mainIdx].totalPrice = qty * stagedItems[mainIdx].unitPrice;
    }
  }

  const subtotalAmount = stagedItems.reduce((sum, i) => sum + i.totalPrice, 0);
  const taxableSubtotal = stagedItems
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
  // 매장 인도(IN_STORE/PICKUP) 는 배송정보 불필요 → recipient/address null
  const isPickup =
    data.fulfillmentType === "IN_STORE" || data.fulfillmentType === "PICKUP";
  // paymentStatus 산출 — paymentMethod=UNPAID 또는 미입력은 외상, 그 외는 결제 완료.
  const paymentStatus =
    !data.paymentMethod || data.paymentMethod === "UNPAID" ? "UNPAID" : "PAID";

  // OrderItem 순차 생성 — parentItemIndex → parentItemId 매핑 보장
  const order = await prisma.$transaction(async (tx) => {
    const o = await tx.order.create({
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
        taxInvoiceRequested: data.taxInvoiceRequested ?? false,
        subtotalAmount,
        discountAmount,
        shippingFee,
        shippingPaymentType: data.shippingPaymentType,
        taxAmount,
        totalAmount,
        commissionAmount,
        memo: data.memo || null,
        createdById: user.id,
      },
    });

    const createdIds: string[] = [];
    for (const it of stagedItems) {
      const parentId =
        it.parentItemIndex !== null ? createdIds[it.parentItemIndex] ?? null : null;
      const created = await tx.orderItem.create({
        data: {
          orderId: o.id,
          productId: it.productId,
          serviceName: it.serviceName ?? undefined,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
          lineRole: it.lineRole as never,
          parentItemId: parentId,
          optionSnapshot: it.optionSnapshot ?? undefined,
          entryProductId: it.entryProductId,
        },
      });
      createdIds.push(created.id);
    }

    return tx.order.findUnique({
      where: { id: o.id },
      include: {
        channel: { select: { name: true } },
        items: {
          include: { product: { select: { name: true, sku: true } } },
        },
      },
    });
  });

  if (!order) {
    return NextResponse.json({ error: "주문 생성 실패" }, { status: 500 });
  }

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
      itemCount: stagedItems.length,
      paymentMethod: data.paymentMethod,
      channelId: data.channelId,
    },
  });

  return NextResponse.json(order, { status: 201 });
}
