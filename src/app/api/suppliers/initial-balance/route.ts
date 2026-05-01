import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { initialBalanceSchema } from "@/lib/validators/initial-balance";
import { rebalanceSupplierLedger } from "@/lib/supplier-ledger";
import { guardAdmin } from "@/lib/api-auth";

// 기초 미지급금 이력 조회
export async function GET() {
  const ledgers = await prisma.supplierLedger.findMany({
    where: { referenceType: "INITIAL_BALANCE" },
    include: { supplier: { select: { id: true, name: true, paymentMethod: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(ledgers);
}

// 기초 미지급금 일괄 등록
export async function POST(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const body = await request.json();
  const parsed = initialBalanceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { entries } = parsed.data;

  // 1회성 가드 사전 검사
  const supplierIds = entries.map((e) => e.supplierId);
  const existing = await prisma.supplierLedger.findMany({
    where: {
      supplierId: { in: supplierIds },
      referenceType: "INITIAL_BALANCE",
    },
    select: {
      supplierId: true,
      supplier: { select: { name: true } },
    },
  });

  if (existing.length > 0) {
    const seen = new Set<string>();
    const duplicates = existing
      .filter((e) => {
        if (seen.has(e.supplierId)) return false;
        seen.add(e.supplierId);
        return true;
      })
      .map((e) => ({ supplierId: e.supplierId, name: e.supplier.name }));
    return NextResponse.json(
      {
        error: "다음 거래처는 이미 기초 미지급금이 등록되어 있습니다. 해당 행을 제거하고 다시 시도해주세요.",
        duplicates,
      },
      { status: 409 },
    );
  }

  const results = await prisma.$transaction(async (tx) => {
    const created: Array<{ id: string; supplierId: string; name: string; balance: number }> = [];

    for (const entry of entries) {
      const amount = parseFloat(entry.amount);
      const date = entry.date ? new Date(entry.date) : new Date();

      const lastLedger = await tx.supplierLedger.findFirst({
        where: { supplierId: entry.supplierId },
        orderBy: { createdAt: "desc" },
      });
      const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
      const newBalance = prevBalance + amount;

      const ledger = await tx.supplierLedger.create({
        data: {
          supplierId: entry.supplierId,
          date,
          type: "ADJUSTMENT",
          description: entry.memo ? `기초 미지급금 — ${entry.memo}` : "기초 미지급금",
          debitAmount: amount,
          creditAmount: 0,
          balance: newBalance,
          referenceType: "INITIAL_BALANCE",
        },
        include: { supplier: { select: { name: true } } },
      });

      created.push({
        id: ledger.id,
        supplierId: entry.supplierId,
        name: ledger.supplier.name,
        balance: newBalance,
      });
    }

    // 모든 거래처 재계산 (기초잔액 날짜가 기존 거래보다 과거일 수 있음)
    const uniqueIds = Array.from(new Set(entries.map((e) => e.supplierId)));
    for (const id of uniqueIds) {
      await rebalanceSupplierLedger(tx, id);
    }

    return created;
  });

  return NextResponse.json({
    success: true,
    count: results.length,
    entries: results,
  });
}
