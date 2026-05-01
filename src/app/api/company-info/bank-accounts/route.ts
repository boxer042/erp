import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";
import { bankAccountSchema } from "@/lib/validators/company-info";

const SINGLETON_ID = "singleton";

export async function POST(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const body = await request.json();
  const parsed = bankAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const company = await prisma.companyInfo.findUnique({ where: { id: SINGLETON_ID } });
  if (!company) {
    return NextResponse.json(
      { error: "사업자 정보를 먼저 등록해 주세요" },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const last = await prisma.companyBankAccount.findFirst({
    where: { companyId: SINGLETON_ID },
    orderBy: { sortOrder: "desc" },
  });
  const nextSort = data.sortOrder ?? (last ? last.sortOrder + 1 : 0);

  const existingCount = await prisma.companyBankAccount.count({ where: { companyId: SINGLETON_ID } });

  const created = await prisma.$transaction(async (tx) => {
    // 첫 통장이면 자동 primary, 또는 isPrimary=true이면 다른 row 해제
    const shouldBePrimary = data.isPrimary || existingCount === 0;
    if (shouldBePrimary) {
      await tx.companyBankAccount.updateMany({
        where: { companyId: SINGLETON_ID, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.companyBankAccount.create({
      data: {
        companyId: SINGLETON_ID,
        bankName: data.bankName,
        holder: data.holder,
        account: data.account,
        isPrimary: shouldBePrimary,
        sortOrder: nextSort,
      },
    });
  });

  return NextResponse.json(created, { status: 201 });
}
