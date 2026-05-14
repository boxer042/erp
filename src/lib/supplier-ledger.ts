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

/**
 * 거래처의 모든 confirmed 입고 paymentStatus 를 결제 합계 기준으로 FIFO 재매칭.
 * 결제 등록/수정/삭제 후 호출 — POST/PUT/DELETE 모두에서 일관된 상태 보장.
 *
 * 정책 (Order paymentStatus FIFO 와 동일):
 * - paymentMethod 와 무관하게 모든 거래처는 FIFO 매칭.
 *   결제 합계만큼 가장 오래된 입고부터 fully-paid 마킹.
 *   부분 매칭은 잔액에만 반영 (입고 단위 통째로 PAID 만 처리).
 */
export async function recomputeIncomingPaymentStatus(
  tx: Prisma.TransactionClient,
  supplierId: string,
): Promise<{ paidCount: number; totalCount: number }> {
  const incomings = await tx.incoming.findMany({
    where: { supplierId, status: "CONFIRMED" },
    orderBy: { incomingDate: "asc" },
    include: {
      items: {
        include: {
          supplierProduct: { select: { isTaxable: true } },
        },
      },
    },
  });

  // FIFO 매칭
  const paySum = await tx.supplierPayment.aggregate({
    where: { supplierId },
    _sum: { amount: true },
  });
  let remaining = Number(paySum._sum.amount ?? 0);

  const paidIds: string[] = [];
  const unpaidIds: string[] = [];
  for (const inc of incomings) {
    const total = inc.items.reduce((sum, item) => {
      const supply = Number(item.totalPrice);
      const tax = item.supplierProduct.isTaxable ? Math.round(supply * 0.1) : 0;
      return sum + supply + tax;
    }, 0);
    if (remaining + 0.01 >= total) {
      remaining -= total;
      paidIds.push(inc.id);
    } else {
      unpaidIds.push(inc.id);
    }
  }

  await Promise.all([
    paidIds.length > 0
      ? tx.incoming.updateMany({
          where: { id: { in: paidIds } },
          data: { paymentStatus: "PAID" },
        })
      : Promise.resolve(),
    unpaidIds.length > 0
      ? tx.incoming.updateMany({
          where: { id: { in: unpaidIds } },
          data: { paymentStatus: "UNPAID" },
        })
      : Promise.resolve(),
  ]);

  return { paidCount: paidIds.length, totalCount: incomings.length };
}
