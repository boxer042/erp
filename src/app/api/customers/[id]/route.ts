import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerSchema } from "@/lib/validators/customer";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";

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
  const isBusiness = data.type === "BUSINESS";

  // 사업자번호 중복 체크 — 자신 제외
  if (isBusiness && data.businessNumber) {
    const normalizedBN = data.businessNumber.replace(/[^\d]/g, "");
    if (normalizedBN.length === 10) {
      const conflict = await prisma.customer.findFirst({
        where: {
          isActive: true,
          businessNumber: { contains: normalizedBN },
          id: { not: id },
        },
        select: { id: true, name: true },
      });
      if (conflict) {
        return NextResponse.json(
          {
            error: `같은 사업자번호로 이미 등록된 다른 고객이 있습니다 — ${conflict.name}`,
            existing: conflict,
          },
          { status: 409 },
        );
      }
    }
  }

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      type: data.type,
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      memo: data.memo ?? null,
      businessNumber: isBusiness ? data.businessNumber ?? null : null,
      ceo: isBusiness ? data.ceo ?? null : null,
      fax: isBusiness ? data.fax ?? null : null,
      businessType: isBusiness ? data.businessType ?? null : null,
      businessItem: isBusiness ? data.businessItem ?? null : null,
      address: data.address ?? null,
      shippingAddress: data.shippingAddress ?? null,
      contactName: isBusiness ? data.contactName ?? null : null,
      contactPhone: isBusiness ? data.contactPhone ?? null : null,
      contactPosition: isBusiness ? data.contactPosition ?? null : null,
    },
  });

  const auditUser = await getCurrentUser();
  await recordAudit(prisma, {
    userId: auditUser?.id ?? null,
    entity: "Customer",
    entityId: id,
    action: "UPDATE",
    meta: { name: data.name, type: data.type },
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

  const auditUser = await getCurrentUser();
  await recordAudit(prisma, {
    userId: auditUser?.id ?? null,
    entity: "Customer",
    entityId: id,
    action: "DELETE",
    meta: { softDelete: true },
  });

  return NextResponse.json({ success: true });
}
