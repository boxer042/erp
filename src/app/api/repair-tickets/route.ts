import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { guardUser } from "@/lib/api-auth";
import { repairTicketCreateSchema } from "@/lib/validators/repair-ticket";
import { generateRepairTicketNo } from "@/lib/document-no";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const customerId = searchParams.get("customerId");
  const assignedToId = searchParams.get("assignedToId");
  const search = searchParams.get("search")?.trim() ?? "";
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) ?? [];

  const where: Prisma.RepairTicketWhereInput = {
    ...(status ? { status: status as never } : {}),
    ...(type ? { type: type as never } : {}),
    ...(customerId ? { customerId } : {}),
    ...(assignedToId ? { assignedToId } : {}),
    ...(ids.length > 0 ? { id: { in: ids } } : {}),
    ...(search
      ? {
          OR: [
            { ticketNo: { contains: search, mode: "insensitive" } },
            { customer: { name: { contains: search, mode: "insensitive" } } },
            { customer: { phone: { contains: search } } },
            { symptom: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const tickets = await prisma.repairTicket.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      customerMachine: { select: { id: true, name: true } },
      serialItem: { select: { id: true, code: true } },
      assignedTo: { select: { id: true, name: true } },
      _count: { select: { parts: true, labors: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: 200,
  });
  return NextResponse.json(tickets);
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  const body = await request.json();
  const parsed = repairTicketCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // 보증기간 기본값: CompanyInfo.defaultRepairWarrantyMonths
  let warrantyMonths = data.repairWarrantyMonths;
  if (warrantyMonths == null) {
    const company = await prisma.companyInfo.findUnique({
      where: { id: "singleton" },
      select: { defaultRepairWarrantyMonths: true },
    });
    warrantyMonths = company?.defaultRepairWarrantyMonths ?? null;
  }

  const ticket = await prisma.repairTicket.create({
    data: {
      ticketNo: generateRepairTicketNo(),
      type: data.type,
      customerId: data.customerId || null,
      customerMachineId: data.customerMachineId || null,
      serialItemId: data.serialItemId || null,
      status: "RECEIVED",
      receivedAt: new Date(),
      symptom: data.symptom?.trim() || null,
      diagnosis: data.diagnosis?.trim() || null,
      diagnosisFee: data.diagnosisFee,
      repairWarrantyMonths: warrantyMonths,
      parentRepairTicketId: data.parentRepairTicketId || null,
      assignedToId: data.assignedToId || null,
      memo: data.memo?.trim() || null,
      createdById: user.id,
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      customerMachine: { select: { id: true, name: true } },
      serialItem: { select: { id: true, code: true } },
      assignedTo: { select: { id: true, name: true } },
      parts: true,
      labors: true,
    },
  });
  return NextResponse.json(ticket, { status: 201 });
}
