/**
 * 외부 채널 raw order → ERP Order 변환 로직.
 *
 * 핵심 규칙:
 *  1. SKU 매핑 lookup — 모든 항목이 ChannelProductMapping 으로 ERP Product 와 매칭되어야 정식 Order 로 변환.
 *     하나라도 누락이면 PendingChannelOrder 로 격리 (UNMAPPED_SKU).
 *  2. 중복 방지 — Order(channelId, channelOrderNo) unique 위반 시 DUPLICATE 로 보류.
 *  3. 자동 산출:
 *     - status = PENDING (재고 미차감) — 워크보드 진입, 사용자가 prepare 액션 후 출고
 *     - paymentStatus = prepaid 면 PAID, 아니면 UNPAID
 *     - expectedShipDate = raw 가 주면 그대로, 없으면 주문일 + 1일 (출고 정책 채널마다 다름)
 *  4. 합계 계산은 항목 단가 합 + 채널 수수료 (POST /api/orders 와 동일 로직)
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ImportResult, RawChannelOrder } from "./types";

type Tx = Prisma.TransactionClient | PrismaClient;

interface ImportOptions {
  /** 어떤 ERP 사용자(직원) 가 import 트리거했는지 — 감사 로그 + Order.createdById */
  importedById: string;
}

/**
 * raw orders 를 일괄 import. 트랜잭션은 항목별로 격리 — 한 건 실패가 다른 건에 영향 안 줌.
 */
export async function importChannelOrders(
  prisma: PrismaClient,
  channelId: string,
  rawOrders: RawChannelOrder[],
  options: ImportOptions,
): Promise<ImportResult> {
  let ordersCreated = 0;
  let pendingCreated = 0;
  let duplicates = 0;
  let failed = 0;

  // 채널 + 매핑 일괄 조회 (N+1 방지)
  const channel = await prisma.salesChannel.findUnique({
    where: { id: channelId },
    select: { id: true, commissionRate: true },
  });
  if (!channel) {
    return {
      ordersCreated: 0,
      pendingCreated: 0,
      duplicates: 0,
      failed: rawOrders.length,
      message: "채널을 찾을 수 없습니다",
    };
  }

  // 모든 raw 의 channelSku 를 모아 한 번에 매핑 조회
  const allSkus = Array.from(
    new Set(rawOrders.flatMap((o) => o.items.map((i) => i.channelSku))),
  );
  const mappings = await prisma.channelProductMapping.findMany({
    where: { channelId, channelSku: { in: allSkus } },
    select: {
      channelSku: true,
      product: { select: { id: true, taxType: true } },
    },
  });
  const productByChannelSku = new Map(
    mappings.map((m) => [m.channelSku, m.product]),
  );

  for (const raw of rawOrders) {
    try {
      const result = await importSingleOrder(
        prisma,
        channel,
        raw,
        productByChannelSku,
        options,
      );
      if (result === "ORDER_CREATED") ordersCreated++;
      else if (result === "PENDING_UNMAPPED") pendingCreated++;
      else if (result === "DUPLICATE") duplicates++;
    } catch (e) {
      failed++;
      console.error(
        `[channel/import] ${raw.channelOrderNo} 변환 실패`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return {
    ordersCreated,
    pendingCreated,
    duplicates,
    failed,
    message: `${rawOrders.length}건 처리 — 정상 ${ordersCreated} / 보류 ${pendingCreated} / 중복 ${duplicates} / 실패 ${failed}`,
  };
}

type SingleResult = "ORDER_CREATED" | "PENDING_UNMAPPED" | "DUPLICATE";

async function importSingleOrder(
  prisma: PrismaClient,
  channel: { id: string; commissionRate: { toString(): string } },
  raw: RawChannelOrder,
  productByChannelSku: Map<string, { id: string; taxType: string }>,
  options: ImportOptions,
): Promise<SingleResult> {
  // 1. 중복 체크 — 이미 Order 로 import 됐는지
  const existingOrder = await prisma.order.findUnique({
    where: {
      channelId_channelOrderNo: {
        channelId: channel.id,
        channelOrderNo: raw.channelOrderNo,
      },
    },
    select: { id: true },
  });
  if (existingOrder) return "DUPLICATE";

  // 이미 보류 큐에도 있는지 (자진 재시도 방지)
  const existingPending = await prisma.pendingChannelOrder.findUnique({
    where: {
      channelId_channelOrderNo: {
        channelId: channel.id,
        channelOrderNo: raw.channelOrderNo,
      },
    },
    select: { id: true, status: true },
  });
  if (existingPending && existingPending.status !== "DISCARDED") {
    return "DUPLICATE";
  }

  // 2. SKU 매핑 lookup
  const unmappedSkus = raw.items
    .filter((i) => !productByChannelSku.has(i.channelSku))
    .map((i) => i.channelSku);

  if (unmappedSkus.length > 0) {
    // 보류 큐 격리
    await prisma.pendingChannelOrder.create({
      data: {
        channelId: channel.id,
        channelOrderNo: raw.channelOrderNo,
        rawPayload: raw as unknown as Prisma.InputJsonValue,
        status: "UNMAPPED_SKU",
        reason: `매핑 누락 SKU: ${unmappedSkus.join(", ")}`,
      },
    });
    return "PENDING_UNMAPPED";
  }

  // 3. 정식 Order 변환
  await createOrderFromRaw(prisma, channel, raw, productByChannelSku, options);
  return "ORDER_CREATED";
}

async function createOrderFromRaw(
  prisma: PrismaClient,
  channel: { id: string; commissionRate: { toString(): string } },
  raw: RawChannelOrder,
  productByChannelSku: Map<string, { id: string; taxType: string }>,
  options: ImportOptions,
): Promise<{ orderId: string }> {
  const items = raw.items.map((it) => {
    const product = productByChannelSku.get(it.channelSku)!;
    const total = it.quantity * it.unitPrice;
    return {
      productId: product.id,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      totalPrice: total,
      _taxable: product.taxType === "TAXABLE",
    };
  });

  const subtotalAmount = items.reduce((s, i) => s + i.totalPrice, 0);
  const taxableSubtotal = items
    .filter((i) => i._taxable)
    .reduce((s, i) => s + i.totalPrice, 0);
  const taxAmount = Math.round(taxableSubtotal * 0.1);
  const totalAmount = subtotalAmount + taxAmount;
  const commissionAmount = Math.round(
    subtotalAmount * Number(channel.commissionRate),
  );

  // 출고 예정일 — raw 가 주면 그대로, 없으면 주문일 + 1
  const expectedShipDate = raw.expectedShipDate
    ? new Date(raw.expectedShipDate)
    : (() => {
        const d = new Date(raw.orderedAt);
        d.setDate(d.getDate() + 1);
        return d;
      })();

  // 채널이 결제 받고 정산하는 흐름이 일반적 — prepaid 명시 없으면 PAID 가정
  const paymentStatus: "PAID" | "UNPAID" =
    raw.prepaid === false ? "UNPAID" : "PAID";

  const order = await prisma.order.create({
    data: {
      orderNo: generateChannelOrderNo(),
      channelId: channel.id,
      channelOrderNo: raw.channelOrderNo,
      status: "PENDING",
      fulfillmentType: raw.fulfillmentType ?? "SHIPPING",
      expectedShipDate,
      customerName: raw.buyer.name ?? null,
      customerPhone: raw.buyer.phone ?? null,
      recipientName: raw.recipient.name ?? raw.buyer.name ?? null,
      recipientPhone: raw.recipient.phone ?? raw.buyer.phone ?? null,
      shippingAddress: raw.recipient.address ?? null,
      orderDate: new Date(raw.orderedAt),
      paymentStatus,
      subtotalAmount,
      discountAmount: 0,
      shippingFee: 0,
      taxAmount,
      totalAmount,
      commissionAmount,
      memo: raw.memo ?? null,
      createdById: options.importedById,
      items: {
        create: items.map(({ _taxable, ...it }) => it),
      },
    },
    select: { id: true },
  });

  return { orderId: order.id };
}

function generateChannelOrderNo() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD${y}${m}${d}-${r}`;
}

/**
 * 보류 큐 항목을 매핑 후 정식 Order 로 승격.
 * SKU 매핑이 모두 갖춰져 있어야 성공. 여전히 누락이면 reason 갱신해 보류 유지.
 */
export async function resolvePendingOrder(
  prisma: PrismaClient,
  pendingId: string,
  options: ImportOptions,
): Promise<{ ok: true; orderId: string } | { ok: false; reason: string }> {
  const pending = await prisma.pendingChannelOrder.findUnique({
    where: { id: pendingId },
    include: {
      channel: { select: { id: true, commissionRate: true } },
    },
  });
  if (!pending) return { ok: false, reason: "보류 항목을 찾을 수 없습니다" };
  if (pending.status === "RESOLVED")
    return { ok: false, reason: "이미 정식 주문으로 승격됨" };
  if (pending.status === "DISCARDED")
    return { ok: false, reason: "버려진 항목입니다" };

  const raw = pending.rawPayload as unknown as RawChannelOrder;

  // 매핑 다시 lookup
  const skus = raw.items.map((i) => i.channelSku);
  const mappings = await prisma.channelProductMapping.findMany({
    where: { channelId: pending.channelId, channelSku: { in: skus } },
    select: {
      channelSku: true,
      product: { select: { id: true, taxType: true } },
    },
  });
  const productByChannelSku = new Map(
    mappings.map((m) => [m.channelSku, m.product]),
  );
  const unmapped = skus.filter((s) => !productByChannelSku.has(s));
  if (unmapped.length > 0) {
    await prisma.pendingChannelOrder.update({
      where: { id: pendingId },
      data: { reason: `매핑 누락 SKU: ${unmapped.join(", ")}` },
    });
    return {
      ok: false,
      reason: `여전히 매핑 누락: ${unmapped.join(", ")}`,
    };
  }

  // 중복 체크 (resolve 사이 다른 import 가 동일 채널주문번호 처리했을 수 있음)
  const existing = await prisma.order.findUnique({
    where: {
      channelId_channelOrderNo: {
        channelId: pending.channelId,
        channelOrderNo: pending.channelOrderNo,
      },
    },
    select: { id: true },
  });
  if (existing) {
    await prisma.pendingChannelOrder.update({
      where: { id: pendingId },
      data: {
        status: "DUPLICATE",
        reason: "이미 정식 주문으로 import 됨",
        resolvedOrderId: existing.id,
        resolvedAt: new Date(),
      },
    });
    return { ok: false, reason: "이미 정식 주문으로 import 됨" };
  }

  const { orderId } = await createOrderFromRaw(
    prisma,
    pending.channel,
    raw,
    productByChannelSku,
    options,
  );
  await prisma.pendingChannelOrder.update({
    where: { id: pendingId },
    data: {
      status: "RESOLVED",
      resolvedOrderId: orderId,
      resolvedAt: new Date(),
    },
  });
  return { ok: true, orderId };
}
