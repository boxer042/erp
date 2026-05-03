import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerSchema } from "@/lib/validators/customer";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) {
    return NextResponse.json({ error: "고객을 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json(customer);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const customer = await prisma.customer.update({
    where: { id },
    data: {
      name: data.name,
      phone: data.phone,
      businessNumber: data.businessNumber ?? null,
      ceo: data.ceo ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      memo: data.memo ?? null,
    },
  });
  return NextResponse.json(customer);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const openRepairCount = await prisma.repairTicket.count({
    where: { customerId: id, status: { notIn: ["PICKED_UP", "CANCELLED"] } },
  });
  if (openRepairCount > 0) {
    return NextResponse.json(
      {
        error: `진행중 수리 ${openRepairCount}건이 있어 삭제할 수 없습니다. 먼저 수리를 완료하거나 취소하세요.`,
      },
      { status: 409 },
    );
  }
  await prisma.customer.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
