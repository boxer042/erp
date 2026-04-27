import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticket = await prisma.repairTicket.findUnique({
    where: { id },
    include: {
      customer: true,
      customerMachine: true,
      parts: { include: { product: { select: { id: true, name: true, sku: true } } }, orderBy: { createdAt: "asc" } },
      labors: { orderBy: { createdAt: "asc" } },
      orders: { select: { id: true, orderNo: true, totalAmount: true, paymentMethod: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
  if (!ticket) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  return NextResponse.json(ticket);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { symptom, diagnosis, repairNotes, customerMachineId, memo } = body ?? {};
  const ticket = await prisma.repairTicket.update({
    where: { id },
    data: {
      ...(symptom !== undefined ? { symptom: symptom?.trim() || null } : {}),
      ...(diagnosis !== undefined ? { diagnosis: diagnosis?.trim() || null } : {}),
      ...(repairNotes !== undefined ? { repairNotes: repairNotes?.trim() || null } : {}),
      ...(customerMachineId !== undefined ? { customerMachineId: customerMachineId || null } : {}),
      ...(memo !== undefined ? { memo: memo?.trim() || null } : {}),
    },
  });
  return NextResponse.json(ticket);
}
