import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";
import { bankAccountSchema } from "@/lib/validators/company-info";

const SINGLETON_ID = "singleton";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json();
  const parsed = bankAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.companyBankAccount.updateMany({
        where: { companyId: SINGLETON_ID, isPrimary: true, NOT: { id } },
        data: { isPrimary: false },
      });
    }
    return tx.companyBankAccount.update({
      where: { id },
      data: {
        bankName: data.bankName,
        holder: data.holder,
        account: data.account,
        isPrimary: data.isPrimary ?? false,
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    });
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const { id } = await params;

  const target = await prisma.companyBankAccount.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "통장을 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.companyBankAccount.delete({ where: { id } });
    // 삭제된 게 primary였으면 가장 오래된 row를 primary로 승격
    if (target.isPrimary) {
      const next = await tx.companyBankAccount.findFirst({
        where: { companyId: SINGLETON_ID },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      if (next) {
        await tx.companyBankAccount.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
