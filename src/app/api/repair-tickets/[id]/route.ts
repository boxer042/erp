import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, handleAuthError } from "@/lib/api-auth";

const updateSchema = z.object({
  symptom: z.string().trim().nullable().optional(),
  diagnosis: z.string().trim().nullable().optional(),
  repairNotes: z.string().trim().nullable().optional(),
  customerMachineId: z.string().nullable().optional(),
  memo: z.string().trim().nullable().optional(),
});

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
  try {
    await requireUser();
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const ticket = await prisma.repairTicket.update({
      where: { id },
      data: {
        ...(d.symptom !== undefined ? { symptom: d.symptom?.trim() || null } : {}),
        ...(d.diagnosis !== undefined ? { diagnosis: d.diagnosis?.trim() || null } : {}),
        ...(d.repairNotes !== undefined ? { repairNotes: d.repairNotes?.trim() || null } : {}),
        ...(d.customerMachineId !== undefined
          ? { customerMachineId: d.customerMachineId || null }
          : {}),
        ...(d.memo !== undefined ? { memo: d.memo?.trim() || null } : {}),
      },
    });
    return NextResponse.json(ticket);
  } catch (e) {
    const authResp = handleAuthError(e);
    if (authResp) return authResp;
    throw e;
  }
}
