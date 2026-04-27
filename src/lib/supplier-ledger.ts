import type { Prisma } from "@prisma/client";

/**
 * 거래처 원장의 balance를 "날짜 → 등록시각" 순으로 재계산.
 * 백-입력(과거 일자로 추가)된 엔트리가 있어도 날짜순 잔액이 일관되게 유지됨.
 * 모든 생성/수정/삭제 경로 뒤에 호출.
 */
export async function rebalanceSupplierLedger(
  tx: Prisma.TransactionClient,
  supplierId: string,
) {
  const ledgers = await tx.supplierLedger.findMany({
    where: { supplierId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: { id: true, debitAmount: true, creditAmount: true },
  });

  let balance = 0;
  for (const l of ledgers) {
    balance += Number(l.debitAmount) - Number(l.creditAmount);
    await tx.supplierLedger.update({
      where: { id: l.id },
      data: { balance },
    });
  }
  return balance;
}
