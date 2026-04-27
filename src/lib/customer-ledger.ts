import type { Prisma } from "@prisma/client";

/**
 * 고객 원장의 balance를 createdAt 순서대로 재계산.
 * 양의 잔액 = 미수금(고객이 우리에게 지급할 금액).
 */
export async function rebalanceCustomerLedger(
  tx: Prisma.TransactionClient,
  customerId: string,
) {
  const ledgers = await tx.customerLedger.findMany({
    where: { customerId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: { id: true, debitAmount: true, creditAmount: true },
  });

  let balance = 0;
  for (const l of ledgers) {
    balance += Number(l.debitAmount) - Number(l.creditAmount);
    await tx.customerLedger.update({
      where: { id: l.id },
      data: { balance },
    });
  }
  return balance;
}
