/**
 * 분할 송장 회차 단위 수정/취소 API.
 *
 * PATCH  /api/orders/:id/shipments/:shipmentNo
 *   회차의 송장사·송장번호·memo 만 수정. 발송 항목/수량은 변경 불가 (취소 후 재생성 필요)
 *
 * DELETE /api/orders/:id/shipments/:shipmentNo
 *   회차 취소 — 해당 회차의 ShipmentItem 만큼 OrderItem.shippedQty 차감 +
 *   Order.shipmentCount 감소 + 잔량 발생 시 status 복귀 (SHIPPED → PREPARING_PACKED).
 *   안전 가드: status 가 SHIPPED 또는 이전 출고 단계일 때만 허용 (COMPLETED·RETURN_*·CANCELLED 는 거부).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const CANCELABLE_STATUSES = [
  "PREPARING",
  "PREPARING_PACKED",
  "SHIPPED",
] as const;

function parseShipmentNo(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; shipmentNo: string }> },
) {
  const { id, shipmentNo: shipmentNoRaw } = await params;
  const shipmentNo = parseShipmentNo(shipmentNoRaw);
  if (!shipmentNo) {
    return NextResponse.json(
      { error: "유효하지 않은 회차 번호" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const trackingCarrier =
    typeof body.trackingCarrier === "string"
      ? body.trackingCarrier || null
      : undefined;
  const trackingNumber =
    typeof body.trackingNumber === "string"
      ? body.trackingNumber || null
      : undefined;
  const memo = typeof body.memo === "string" ? body.memo || null : undefined;

  if (
    trackingCarrier === undefined &&
    trackingNumber === undefined &&
    memo === undefined
  ) {
    return NextResponse.json(
      { error: "변경할 필드를 보내주세요 (trackingCarrier, trackingNumber, memo)" },
      { status: 400 },
    );
  }

  const shipment = await prisma.shipment.findFirst({
    where: { orderId: id, shipmentNo },
  });
  if (!shipment) {
    return NextResponse.json({ error: "회차를 찾을 수 없습니다" }, { status: 404 });
  }

  const user = await getCurrentUser();
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        ...(trackingCarrier !== undefined ? { trackingCarrier } : {}),
        ...(trackingNumber !== undefined ? { trackingNumber } : {}),
        ...(memo !== undefined ? { memo } : {}),
      },
    });

    // 마지막 회차였으면 Order.trackingCarrier/Number 캐시도 갱신
    const latest = await tx.shipment.findFirst({
      where: { orderId: id },
      orderBy: { shipmentNo: "desc" },
    });
    if (latest && latest.id === shipment.id) {
      await tx.order.update({
        where: { id },
        data: {
          trackingCarrier: u.trackingCarrier,
          trackingNumber: u.trackingNumber,
        },
      });
    }

    await recordAudit(tx, {
      userId: user?.id ?? null,
      entity: "Order",
      entityId: id,
      action: "UPDATE",
      meta: {
        action: "shipment_update",
        shipmentNo,
        trackingCarrier: u.trackingCarrier,
        trackingNumber: u.trackingNumber,
      },
    });
    return u;
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; shipmentNo: string }> },
) {
  const { id, shipmentNo: shipmentNoRaw } = await params;
  const shipmentNo = parseShipmentNo(shipmentNoRaw);
  if (!shipmentNo) {
    return NextResponse.json(
      { error: "유효하지 않은 회차 번호" },
      { status: 400 },
    );
  }

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, status: true, shipmentCount: true },
  });
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
  }
  if (
    !(CANCELABLE_STATUSES as readonly string[]).includes(order.status as string)
  ) {
    return NextResponse.json(
      {
        error: `${order.status} 상태에서는 회차 취소가 불가능합니다 (PREPARING/PREPARING_PACKED/SHIPPED 만 가능)`,
      },
      { status: 400 },
    );
  }

  const shipment = await prisma.shipment.findFirst({
    where: { orderId: id, shipmentNo },
    include: { items: true },
  });
  if (!shipment) {
    return NextResponse.json({ error: "회차를 찾을 수 없습니다" }, { status: 404 });
  }

  const user = await getCurrentUser();
  await prisma.$transaction(async (tx) => {
    // 각 ShipmentItem 의 quantity 만큼 OrderItem.shippedQty 차감
    for (const si of shipment.items) {
      await tx.orderItem.update({
        where: { id: si.orderItemId },
        data: { shippedQty: { decrement: Number(si.quantity) } },
      });
    }

    // Shipment 삭제 (ShipmentItem 은 CASCADE)
    await tx.shipment.delete({ where: { id: shipment.id } });

    // Order.shipmentCount 감소 — 0 이상으로 클램프
    const newCount = Math.max(0, (order.shipmentCount ?? 0) - 1);

    // 현재 모든 라인이 fully shipped 인지 재평가
    const remainingItems = await tx.orderItem.findMany({
      where: { orderId: id },
      select: { quantity: true, shippedQty: true },
    });
    const allFullyShipped = remainingItems.every(
      (it) => Number(it.shippedQty) >= Number(it.quantity) - 0.0001,
    );

    // SHIPPED 였는데 더 이상 fully 아니면 PREPARING_PACKED 로 복귀.
    // 다른 상태 (PREPARING/PREPARING_PACKED) 는 그대로.
    let newStatus: string = order.status as string;
    if (order.status === "SHIPPED" && !allFullyShipped) {
      newStatus = "PREPARING_PACKED";
    }

    // 마지막 회차의 송장으로 Order.tracking 캐시 갱신 (없으면 null)
    const newLatest = await tx.shipment.findFirst({
      where: { orderId: id },
      orderBy: { shipmentNo: "desc" },
    });

    await tx.order.update({
      where: { id },
      data: {
        shipmentCount: newCount,
        status: newStatus as never,
        trackingCarrier: newLatest?.trackingCarrier ?? null,
        trackingNumber: newLatest?.trackingNumber ?? null,
      },
    });

    await recordAudit(tx, {
      userId: user?.id ?? null,
      entity: "Order",
      entityId: id,
      action: "STATUS_CHANGE",
      meta: {
        action: "shipment_cancel",
        shipmentNo,
        from: order.status,
        to: newStatus,
        decremented: shipment.items.map((si) => ({
          orderItemId: si.orderItemId,
          quantity: Number(si.quantity),
        })),
      },
    });
  });

  return NextResponse.json({ ok: true });
}
