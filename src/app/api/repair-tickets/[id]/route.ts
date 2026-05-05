import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handleAuthError, guardUser } from "@/lib/api-auth";
import { repairTicketUpdateSchema } from "@/lib/validators/repair-ticket";
import { normalizeDiscountInput } from "@/lib/utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const ticket = await prisma.repairTicket.findUnique({
    where: { id },
    include: {
      customer: true,
      customerMachine: true,
      serialItem: {
        include: {
          product: { select: { id: true, name: true, sku: true, imageUrl: true } },
          orderItem: {
            select: {
              id: true,
              order: {
                select: { id: true, orderNo: true, orderDate: true, totalAmount: true },
              },
            },
          },
        },
      },
      repairProduct: { select: { id: true, name: true, sku: true, imageUrl: true } },
      assignedTo: { select: { id: true, name: true } },
      parentRepairTicket: {
        select: { id: true, ticketNo: true, status: true, repairWarrantyEnds: true },
      },
      revisits: {
        select: { id: true, ticketNo: true, status: true, receivedAt: true },
        orderBy: { receivedAt: "desc" },
      },
      parts: {
        include: { product: { select: { id: true, name: true, sku: true } } },
        orderBy: { createdAt: "asc" },
      },
      labors: { orderBy: { createdAt: "asc" } },
      orders: {
        select: {
          id: true,
          orderNo: true,
          totalAmount: true,
          paymentMethod: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      createdBy: { select: { id: true, name: true } },
      repairCategory: { select: { id: true, name: true } },
    },
  });
  if (!ticket) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  return NextResponse.json(ticket);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const body = await request.json();
    const parsed = repairTicketUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    // serialItem / repairProduct / repairProductText 는 동시에 두 개 이상 set 될 수 없음.
    // UI는 한쪽 set 시 나머지를 null로 보내지만, 외부 호출 보호용 가드.
    const productSourceCount = [
      d.serialItemId,
      d.repairProductId,
      d.repairProductText?.trim(),
    ].filter((v) => v != null && v !== "").length;
    if (productSourceCount > 1) {
      return NextResponse.json(
        {
          error:
            "시리얼·상품·직접입력 중 하나만 설정할 수 있습니다 (다른 항목은 null로 보내세요)",
        },
        { status: 400 },
      );
    }

    const ticket = await prisma.repairTicket.update({
      where: { id },
      data: {
        ...(d.type !== undefined ? { type: d.type } : {}),
        ...(d.symptom !== undefined ? { symptom: d.symptom?.trim() || null } : {}),
        ...(d.diagnosis !== undefined ? { diagnosis: d.diagnosis?.trim() || null } : {}),
        ...(d.repairNotes !== undefined ? { repairNotes: d.repairNotes?.trim() || null } : {}),
        ...(d.customerMachineId !== undefined
          ? { customerMachineId: d.customerMachineId || null }
          : {}),
        ...(d.serialItemId !== undefined
          ? { serialItemId: d.serialItemId || null }
          : {}),
        ...(d.repairProductId !== undefined
          ? { repairProductId: d.repairProductId || null }
          : {}),
        ...(d.repairProductText !== undefined
          ? { repairProductText: d.repairProductText?.trim() || null }
          : {}),
        ...(d.diagnosisFee !== undefined ? { diagnosisFee: d.diagnosisFee } : {}),
        ...(d.totalDiscount !== undefined
          ? { totalDiscount: normalizeDiscountInput(d.totalDiscount) }
          : {}),
        ...(d.repairWarrantyMonths !== undefined
          ? { repairWarrantyMonths: d.repairWarrantyMonths }
          : {}),
        ...(d.assignedToId !== undefined
          ? { assignedToId: d.assignedToId || null }
          : {}),
        ...(d.memo !== undefined ? { memo: d.memo?.trim() || null } : {}),
        ...(d.repairCategoryId !== undefined
          ? { repairCategoryId: d.repairCategoryId || null }
          : {}),
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        serialItem: {
          select: { id: true, code: true, source: true, displayName: true },
        },
        assignedTo: { select: { id: true, name: true } },
        repairCategory: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(ticket);
  } catch (e) {
    const authResp = handleAuthError(e);
    if (authResp) return authResp;
    throw e;
  }
}

// 삭제 허용 조건:
//   - RECEIVED: 부속/공임 없을 때만 (실수로 만든 빈 티켓)
//   - CANCELLED: 항상 (이미 취소된 티켓이라 재고/매출 영향 없음)
//   - 그 외 상태: 거부 — 먼저 취소(transition cancel) 처리해야 함
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const ticket = await prisma.repairTicket.findUnique({
    where: { id },
    include: { _count: { select: { parts: true, labors: true } } },
  });
  if (!ticket) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });

  if (ticket.status === "RECEIVED") {
    if (ticket._count.parts > 0 || ticket._count.labors > 0) {
      return NextResponse.json(
        { error: "부속/공임이 있는 티켓은 삭제할 수 없습니다. 먼저 행을 비우거나 취소 처리하세요." },
        { status: 400 },
      );
    }
  } else if (ticket.status !== "CANCELLED") {
    return NextResponse.json(
      { error: "진행중 수리는 삭제할 수 없습니다. 먼저 취소 처리하세요." },
      { status: 400 },
    );
  }

  await prisma.repairTicket.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
