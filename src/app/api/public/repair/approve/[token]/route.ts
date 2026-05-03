import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { RepairApprovalMethod } from "@prisma/client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const ticket = await prisma.repairTicket.findUnique({
    where: { approvalToken: token },
    include: {
      customer: { select: { name: true } },
      customerMachine: { select: { name: true, brand: true, modelNo: true } },
      parts: { include: { product: { select: { name: true } } } },
      labors: true,
    },
  });
  if (!ticket) return NextResponse.json({ error: "유효하지 않은 링크" }, { status: 404 });
  if (ticket.approvalTokenExpiresAt && ticket.approvalTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "링크가 만료됐습니다" }, { status: 410 });
  }
  return NextResponse.json({
    id: ticket.id,
    ticketNo: ticket.ticketNo,
    status: ticket.status,
    customerName: ticket.customer?.name ?? "(미등록)",
    machineName: ticket.customerMachine?.name ?? null,
    symptom: ticket.symptom,
    diagnosis: ticket.diagnosis,
    quotedLaborAmount: Number(ticket.quotedLaborAmount),
    quotedPartsAmount: Number(ticket.quotedPartsAmount),
    quotedTotalAmount: Number(ticket.quotedTotalAmount),
    approvedAt: ticket.approvedAt,
    parts: ticket.parts.map((p) => ({
      name: p.product.name,
      quantity: Number(p.quantity),
      unitPrice: Number(p.unitPrice),
      totalPrice: Number(p.totalPrice),
    })),
    labors: ticket.labors.map((l) => ({
      name: l.name,
      hours: Number(l.hours),
      unitRate: Number(l.unitRate),
      totalPrice: Number(l.totalPrice),
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const ticket = await prisma.repairTicket.findUnique({ where: { approvalToken: token } });
  if (!ticket) return NextResponse.json({ error: "유효하지 않은 링크" }, { status: 404 });
  if (ticket.approvedAt) {
    return NextResponse.json({ error: "이미 승인되었습니다" }, { status: 400 });
  }
  if (ticket.approvalTokenExpiresAt && ticket.approvalTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "링크가 만료됐습니다" }, { status: 410 });
  }
  if (ticket.status !== "QUOTED") {
    return NextResponse.json({ error: "승인 가능한 상태가 아닙니다" }, { status: 400 });
  }

  const updated = await prisma.repairTicket.update({
    where: { id: ticket.id },
    data: {
      status: "APPROVED",
      approvalMethod: "REMOTE" as RepairApprovalMethod,
      approvedAt: new Date(),
      approvedByName: body?.name?.trim() || null,
    },
  });
  return NextResponse.json({ success: true, ticketNo: updated.ticketNo });
}
