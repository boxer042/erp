import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { nextUsedItemCode } from "@/lib/used-item-code";
import { fifoConsume, isOversellAllowed } from "@/lib/inventory/fifo";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

/**
 * 선판매 정리 — 결제됐지만 미등록인 라인(presaleKind 보유)을 모아
 * 종류별로 실제 등록(중고품 생성)해 연결하는 cross-domain 허브.
 *
 * 두 출처:
 *  - order  (판매분): OrderItem 자유 라인 — POS/주문 [선판매] 버튼으로 판매
 *  - repair (수리사용분): RepairPart 자유부속 — 수리에 쓴 미등록 부속 (PICKED_UP 결제완료)
 *
 * 순수 기술료/공임(presaleKind=null)은 등록할 원가·상품이 없어 제외.
 * 현재 "used"(중고)만 활성, "catalog"(내상품)은 향후.
 */

interface PresaleRow {
  id: string;
  sourceType: "order" | "repair";
  name: string;
  spec: string | null;
  presaleKind: string | null;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  /** 원천 문서 — 판매=주문, 수리사용=수리티켓 */
  refId: string;
  refNo: string;
  refDate: string;
  customerId: string | null;
  customerName: string | null;
}

export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const sp = request.nextUrl.searchParams;
  const days = Math.min(parseInt(sp.get("days") ?? "30", 10) || 30, 180);
  const since = new Date();
  since.setDate(since.getDate() - days);

  // ① 판매분 — OrderItem 자유 라인
  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: null,
      soldUsedItem: null,
      serviceName: { not: null },
      presaleKind: { not: null },
      order: { orderDate: { gte: since }, status: { notIn: ["CANCELLED", "RETURNED"] } },
    },
    select: {
      id: true,
      serviceName: true,
      presaleKind: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      order: {
        select: { id: true, orderNo: true, orderDate: true, customerId: true, customerName: true },
      },
    },
    orderBy: [{ order: { orderDate: "desc" } }],
    take: 100,
  });

  // ② 수리사용분 — RepairPart 자유부속 (결제완료 티켓)
  const repairParts = await prisma.repairPart.findMany({
    where: {
      productId: null,
      presaleKind: { not: null },
      soldUsedItem: null,
      repairTicket: { status: "PICKED_UP", pickedUpAt: { gte: since } },
    },
    select: {
      id: true,
      name: true,
      spec: true,
      presaleKind: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      repairTicket: {
        select: {
          id: true,
          ticketNo: true,
          pickedUpAt: true,
          customerId: true,
          customer: { select: { name: true } },
        },
      },
    },
    orderBy: [{ repairTicket: { pickedUpAt: "desc" } }],
    take: 100,
  });

  const rows: PresaleRow[] = [
    ...orderItems.map((o) => ({
      id: o.id,
      sourceType: "order" as const,
      name: o.serviceName ?? "(이름 없음)",
      spec: null,
      presaleKind: o.presaleKind,
      quantity: String(o.quantity),
      unitPrice: String(o.unitPrice),
      totalPrice: String(o.totalPrice),
      refId: o.order.id,
      refNo: o.order.orderNo,
      refDate: o.order.orderDate.toISOString(),
      customerId: o.order.customerId,
      customerName: o.order.customerName,
    })),
    ...repairParts.map((p) => ({
      id: p.id,
      sourceType: "repair" as const,
      name: p.name ?? "(이름 없음)",
      spec: p.spec,
      presaleKind: p.presaleKind,
      quantity: String(p.quantity),
      unitPrice: String(p.unitPrice),
      totalPrice: String(p.totalPrice),
      refId: p.repairTicket.id,
      refNo: p.repairTicket.ticketNo,
      refDate: (p.repairTicket.pickedUpAt ?? new Date(0)).toISOString(),
      customerId: p.repairTicket.customerId,
      customerName: p.repairTicket.customer?.name ?? null,
    })),
  ];

  // 최근순 + used 우선 (V8 stable sort)
  rows.sort((a, b) => b.refDate.localeCompare(a.refDate));
  rows.sort((a, b) => (b.presaleKind === "used" ? 1 : 0) - (a.presaleKind === "used" ? 1 : 0));

  return NextResponse.json(rows);
}

const reconcileSchema = z.object({
  sourceType: z.enum(["order", "repair"]),
  /** OrderItem.id (order) 또는 RepairPart.id (repair) */
  lineId: z.string().min(1),
  displayName: z.string().min(1, "품명을 입력해주세요"),
  acquiredCost: z.string().regex(/^-?\d+(\.\d+)?$/).default("0"),
  productId: z.string().nullish(),
  sourceCustomerId: z.string().nullish(),
  sourceMemo: z.string().nullish(),
  memo: z.string().nullish(),
  /**
   * 내상품(catalog) 정산 전용 — 계속 취급할 재고 관리 대상인지.
   * true  → FIFO 차감 (재고 없으면 적자 로트 생성, 나중에 입고로 상쇄)
   * false → 원가만 보정 (일회성 — 중고와 동일 취급)
   */
  trackStock: z.boolean().default(false),
});

/**
 * POST /api/presale
 * 선판매 라인을 실제 도메인 레코드로 등록 + link. presaleKind 별 처리:
 *
 *  - "used"    → UsedItem 생성 + link (중고품 — 1:1 단품, 재고 로트 무관)
 *  - "catalog" → 카탈로그 상품(Product) 연결 + 원가 보정
 *                trackStock=true 면 FIFO 차감까지 (재고 없으면 적자 로트 → 추후 입고로 상쇄)
 *
 * 출처(sourceType)는 order(주문 자유라인) / repair(수리 자유부속) 양쪽.
 */

/** 정산 시 재고 차감 — 카탈로그 상품을 "계속 취급"으로 정산할 때만. 적자 로트 허용. */
async function consumeStockForPresale(
  tx: Prisma.TransactionClient,
  opts: {
    productId: string;
    quantity: number;
    displayName: string;
    allowOversell: boolean;
    orderItemId?: string;
    repairPartId?: string;
    referenceId: string;
    referenceType: string;
    memo: string;
  },
) {
  const { consumptions } = await fifoConsume(
    tx,
    opts.productId,
    opts.quantity,
    opts.displayName,
    opts.allowOversell,
  );

  if (consumptions.length > 0) {
    await tx.lotConsumption.createMany({
      data: consumptions.map((c) => ({
        orderItemId: opts.orderItemId ?? null,
        repairPartId: opts.repairPartId ?? null,
        lotId: c.lotId,
        quantity: c.quantity,
        unitCost: c.unitCost,
      })),
    });
  }

  // 재고 행이 없을 수도 있어 upsert (미등록 상품을 먼저 판 케이스)
  const inv = await tx.inventory.upsert({
    where: { productId: opts.productId },
    update: { quantity: { decrement: opts.quantity } },
    create: { productId: opts.productId, quantity: -opts.quantity, safetyStock: 0 },
    select: { id: true, quantity: true },
  });

  await tx.inventoryMovement.create({
    data: {
      inventoryId: inv.id,
      type: "OUTGOING",
      quantity: -opts.quantity,
      balanceAfter: inv.quantity,
      referenceId: opts.referenceId,
      referenceType: opts.referenceType,
      memo: opts.memo,
    },
  });
}

export async function POST(request: NextRequest) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const body = await request.json();
  const parsed = reconcileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const acquiredCost = parseFloat(data.acquiredCost) || 0;

  try {
    if (data.sourceType === "order") {
      const orderItem = await prisma.orderItem.findUnique({
        where: { id: data.lineId },
        include: {
          order: { select: { id: true, orderNo: true, orderDate: true } },
          soldUsedItem: { select: { id: true } },
        },
      });
      if (!orderItem) return NextResponse.json({ error: "주문 항목을 찾을 수 없습니다" }, { status: 404 });
      if (orderItem.soldUsedItem)
        return NextResponse.json({ error: "이미 등록되어 연결된 라인입니다" }, { status: 400 });
      if (orderItem.productId)
        return NextResponse.json({ error: "이미 상품이 연결된 라인입니다" }, { status: 400 });

      const qty = Math.max(1, Number(orderItem.quantity));

      // ── 내상품(catalog) — 카탈로그 상품 연결 + 원가 보정 (+ 선택적 재고 차감)
      if (orderItem.presaleKind === "catalog") {
        if (!data.productId)
          return NextResponse.json({ error: "연결할 상품을 선택해주세요" }, { status: 400 });
        const product = await prisma.product.findUnique({
          where: { id: data.productId },
          select: { id: true, name: true },
        });
        if (!product) return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });

        const allowOversell = await isOversellAllowed();
        await prisma.$transaction(
          async (tx) => {
            await tx.orderItem.update({
              where: { id: orderItem.id },
              data: {
                productId: product.id,
                unitCostSnapshot: acquiredCost / qty,
              },
            });
            if (data.trackStock) {
              await consumeStockForPresale(tx, {
                productId: product.id,
                quantity: qty,
                displayName: `선판매 정산: ${product.name}`,
                allowOversell,
                orderItemId: orderItem.id,
                referenceId: orderItem.order.id,
                referenceType: "PRESALE_RECONCILE",
                memo: `선판매 정산 ${orderItem.order.orderNo}: ${product.name}`,
              });
            }
          },
          { timeout: 30000, maxWait: 10000 },
        );
        return NextResponse.json(
          { ok: true, kind: "catalog", productId: product.id, trackStock: data.trackStock },
          { status: 201 },
        );
      }

      if (orderItem.presaleKind !== "used")
        return NextResponse.json({ error: "아직 지원하지 않는 선판매 유형입니다" }, { status: 400 });

      // ── 중고(used) — UsedItem 생성 + link
      const created = await prisma.$transaction(async (tx) => {
        const internalCode = await nextUsedItemCode(tx, orderItem.order.orderDate);
        const usedItem = await tx.usedItem.create({
          data: {
            internalCode,
            displayName: data.displayName,
            productId: data.productId ?? null,
            acquiredFrom: "EMERGENCY_USE",
            acquiredCost,
            isAcquiredTaxable: false,
            acquiredAt: orderItem.order.orderDate,
            sourceCustomerId: data.sourceCustomerId ?? null,
            sourceMemo: data.sourceMemo ?? null,
            memo: data.memo ?? null,
            status: "SOLD",
            orderItemId: orderItem.id,
            createdById: user!.id,
          },
        });
        await tx.orderItem.update({
          where: { id: orderItem.id },
          data: { unitCostSnapshot: acquiredCost / qty },
        });
        return usedItem;
      });
      return NextResponse.json(created, { status: 201 });
    }

    // ── repair — RepairPart 자유부속
    const part = await prisma.repairPart.findUnique({
      where: { id: data.lineId },
      include: {
        repairTicket: { select: { id: true, ticketNo: true, pickedUpAt: true } },
        soldUsedItem: { select: { id: true } },
      },
    });
    if (!part) return NextResponse.json({ error: "수리 부속을 찾을 수 없습니다" }, { status: 404 });
    if (part.soldUsedItem)
      return NextResponse.json({ error: "이미 등록되어 연결된 부속입니다" }, { status: 400 });
    if (part.productId)
      return NextResponse.json({ error: "이미 상품이 연결된 부속입니다" }, { status: 400 });

    const qty = Math.max(1, Number(part.quantity));
    const acquiredAt = part.repairTicket.pickedUpAt ?? new Date();

    // ── 내상품(catalog)
    if (part.presaleKind === "catalog") {
      if (!data.productId)
        return NextResponse.json({ error: "연결할 상품을 선택해주세요" }, { status: 400 });
      const product = await prisma.product.findUnique({
        where: { id: data.productId },
        select: { id: true, name: true },
      });
      if (!product) return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });

      const allowOversell = await isOversellAllowed();
      await prisma.$transaction(
        async (tx) => {
          await tx.repairPart.update({
            where: { id: part.id },
            data: {
              productId: product.id,
              unitCostSnapshot: acquiredCost / qty,
              ...(data.trackStock ? { consumedAt: new Date() } : {}),
            },
          });
          if (data.trackStock) {
            await consumeStockForPresale(tx, {
              productId: product.id,
              quantity: qty,
              displayName: `선판매 정산: ${product.name}`,
              allowOversell,
              repairPartId: part.id,
              referenceId: part.repairTicket.id,
              referenceType: "PRESALE_RECONCILE",
              memo: `선판매 정산 ${part.repairTicket.ticketNo}: ${product.name}`,
            });
          }
        },
        { timeout: 30000, maxWait: 10000 },
      );
      return NextResponse.json(
        { ok: true, kind: "catalog", productId: product.id, trackStock: data.trackStock },
        { status: 201 },
      );
    }

    if (part.presaleKind !== "used")
      return NextResponse.json({ error: "아직 지원하지 않는 선판매 유형입니다" }, { status: 400 });

    // ── 중고(used)
    const created = await prisma.$transaction(async (tx) => {
      const internalCode = await nextUsedItemCode(tx, acquiredAt);
      const usedItem = await tx.usedItem.create({
        data: {
          internalCode,
          displayName: data.displayName,
          productId: data.productId ?? null,
          acquiredFrom: "EMERGENCY_USE",
          acquiredCost,
          isAcquiredTaxable: false,
          acquiredAt,
          sourceCustomerId: data.sourceCustomerId ?? null,
          sourceMemo: data.sourceMemo ?? null,
          memo: data.memo ?? null,
          status: "SOLD",
          repairPartId: part.id,
          createdById: user!.id,
        },
      });
      await tx.repairPart.update({
        where: { id: part.id },
        data: { unitCostSnapshot: acquiredCost / qty },
      });
      return usedItem;
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "선판매 정리에 실패했습니다";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
