import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supplierSchema } from "@/lib/validators/supplier";
import { Prisma } from "@prisma/client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      supplierProducts: { where: { isActive: true } },
      balanceLedger: { orderBy: { date: "desc" }, take: 20 },
      contacts: true,
    },
  });

  if (!supplier) {
    return NextResponse.json(
      { error: "거래처를 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  // 미지급 잔액 계산
  const balanceResult = await prisma.supplierLedger.aggregate({
    where: { supplierId: id },
    _sum: {
      debitAmount: true,
      creditAmount: true,
    },
  });

  const outstandingBalance = new Prisma.Decimal(
    (balanceResult._sum.debitAmount || new Prisma.Decimal(0)).toString()
  ).minus(
    new Prisma.Decimal(
      (balanceResult._sum.creditAmount || new Prisma.Decimal(0)).toString()
    )
  );

  return NextResponse.json({ ...supplier, outstandingBalance });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = supplierSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { contacts, ...data } = parsed.data;

  const supplier = await prisma.$transaction(async (tx) => {
    const updated = await tx.supplier.update({
      where: { id },
      data: {
        name: data.name,
        businessNumber: data.businessNumber || null,
        representative: data.representative || null,
        phone: data.phone || null,
        fax: data.fax || null,
        email: data.email || null,
        address: data.address || null,
        bankName: data.bankName || null,
        bankAccount: data.bankAccount || null,
        bankHolder: data.bankHolder || null,
        paymentMethod: data.paymentMethod,
        paymentTermDays: data.paymentTermDays,
        memo: data.memo || null,
      },
    });

    if (contacts !== undefined) {
      // 기존 담당자 중 전달되지 않은 것 삭제
      const keepIds = contacts.filter((c) => c.id).map((c) => c.id!);
      await tx.supplierContact.deleteMany({
        where: { supplierId: id, id: { notIn: keepIds } },
      });

      for (const c of contacts) {
        if (c.id) {
          await tx.supplierContact.update({
            where: { id: c.id },
            data: { name: c.name, phone: c.phone || null, email: c.email || null, position: c.position || null, memo: c.memo || null },
          });
        } else {
          await tx.supplierContact.create({
            data: { supplierId: id, name: c.name, phone: c.phone || null, email: c.email || null, position: c.position || null, memo: c.memo || null },
          });
        }
      }
    }

    return tx.supplier.findUnique({ where: { id }, include: { contacts: true } });
  });

  return NextResponse.json(supplier);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.supplier.update({
    where: { id },
    data: { isActive: false },
  });
  return NextResponse.json({ success: true });
}
