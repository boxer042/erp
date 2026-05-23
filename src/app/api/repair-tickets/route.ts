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
  const serialItemId = searchParams.get("serialItemId");
  const posSessionId = searchParams.get("posSessionId");
  const excludeId = searchParams.get("excludeId");
  const search = searchParams.get("search")?.trim() ?? "";
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) ?? [];

  const where: Prisma.RepairTicketWhereInput = {
    ...(status ? { status: status as never } : {}),
    ...(type ? { type: type as never } : {}),
    ...(customerId ? { customerId } : {}),
    ...(assignedToId ? { assignedToId } : {}),
    ...(serialItemId ? { serialItemId } : {}),
    ...(posSessionId ? { posSessionId } : {}),
    ...(excludeId ? { id: { not: excludeId } } : {}),
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
      serialItem: {
        select: { id: true, code: true, source: true, displayName: true },
      },
      assignedTo: { select: { id: true, name: true } },
      repairCategory: { select: { id: true, name: true } },
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

  // 보증기간 + 진단비 기본값 — CompanyInfo 한 번 조회로 두 값 같이 가져옴
  let warrantyMonths = data.repairWarrantyMonths;
  let diagnosisFee = data.diagnosisFee;
  if (warrantyMonths == null || diagnosisFee == null || diagnosisFee === 0) {
    const company = await prisma.companyInfo.findUnique({
      where: { id: "singleton" },
      select: {
        defaultRepairWarrantyMonths: true,
        defaultDiagnosisFee: true,
      },
    });
    if (warrantyMonths == null) {
      warrantyMonths = company?.defaultRepairWarrantyMonths ?? null;
    }
    // 사용자가 명시적으로 0 / 미입력 보냈는데 회사 기본값 있으면 채움 — 사용자가 진단비 0 원하면 그대로 보내짐
    if ((diagnosisFee == null || diagnosisFee === 0) && company?.defaultDiagnosisFee) {
      diagnosisFee = Number(company.defaultDiagnosisFee);
    }
  }

  const ticket = await prisma.repairTicket.create({
    data: {
      ticketNo: generateRepairTicketNo(),
      type: data.type,
      workKind: data.workKind,
      customerId: data.customerId || null,
      customerMachineId: data.customerMachineId || null,
      serialItemId: data.serialItemId || null,
      status: "RECEIVED",
      receivedAt: new Date(),
      symptom: data.symptom?.trim() || null,
      diagnosis: data.diagnosis?.trim() || null,
      diagnosisFee: diagnosisFee ?? data.diagnosisFee,
      repairWarrantyMonths: warrantyMonths,
      parentRepairTicketId: data.parentRepairTicketId || null,
      // 담당자 기본값 — 명시 미지정 시 현재 user 가 기본 담당자
      assignedToId: data.assignedToId ?? user.id,
      memo: data.memo?.trim() || null,
      // 미등록 손님 (customerId=null) 일 때 카트 세션 매핑 — 클라이언트 추적 끊겨도 DB 에서 복원 가능
      posSessionId: data.customerId ? null : data.posSessionId || null,
      // 수리 카테고리 — null 이면 "기타"
      repairCategoryId: data.repairCategoryId || null,
      createdById: user.id,
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      customerMachine: { select: { id: true, name: true } },
      serialItem: {
        select: { id: true, code: true, source: true, displayName: true },
      },
      assignedTo: { select: { id: true, name: true } },
      parts: true,
      labors: true,
    },
  });
  return NextResponse.json(ticket, { status: 201 });
}
