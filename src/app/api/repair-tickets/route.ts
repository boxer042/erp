import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { genTicketNo } from "@/lib/repair";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const customerId = searchParams.get("customerId");

  const tickets = await prisma.repairTicket.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(customerId ? { customerId } : {}),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      customerMachine: { select: { id: true, name: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: 200,
  });
  return NextResponse.json(tickets);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { customerId, customerMachineId, symptom, memo, labors = [], parts = [] } = body ?? {};
  if (!customerId) return NextResponse.json({ error: "customerId 필수" }, { status: 400 });

  const ticket = await prisma.repairTicket.create({
    data: {
      ticketNo: genTicketNo(),
      customerId,
      customerMachineId: customerMachineId || null,
      status: "RECEIVED",
      receivedAt: new Date(),
      symptom: symptom?.trim() || null,
      memo: memo?.trim() || null,
      createdById: user.id,
      labors: labors.length > 0 ? {
        create: labors.map((l: { name: string; hours?: number; unitRate: number }) => ({
          name: l.name,
          hours: l.hours ?? 1,
          unitRate: l.unitRate,
          totalPrice: (l.hours ?? 1) * l.unitRate,
        })),
      } : undefined,
      parts: parts.length > 0 ? {
        create: parts.map((p: { productId: string; quantity: number; unitPrice: number }) => ({
          productId: p.productId,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
          totalPrice: p.quantity * p.unitPrice,
        })),
      } : undefined,
    },
    include: {
      labors: true,
      parts: true,
    },
  });
  return NextResponse.json(ticket, { status: 201 });
}
