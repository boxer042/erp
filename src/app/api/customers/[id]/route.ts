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
  await prisma.customer.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
