import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { PaymentReceiptClient } from "./receipt-client";

/**
 * 수금 영수증 — CustomerPayment 단위.
 * 잔금 결제 / 일반 외상 수금 / 계약금 수금 후 잔금 수금 등 모든 CustomerPayment 에 적용.
 * 매장 사장님이 잔금 수금 직후 출력하거나 손님이 요청 시 발행.
 *
 * `?auto=1` 으로 진입 시 자동 인쇄 (수금 등록 직후 자동 팝업).
 */
export default async function CustomerPaymentReceiptPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const [payment, company] = await Promise.all([
    prisma.customerPayment.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true, phone: true, businessNumber: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.companyInfo.findUnique({ where: { id: "singleton" } }),
  ]);

  if (!payment) notFound();

  // 수금 직후 고객 잔액 — paymentDate 시점 가장 최근 ledger 잔액 (FIFO 매칭 후)
  const lastLedger = await prisma.customerLedger.findFirst({
    where: { customerId: payment.customerId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { balance: true },
  });

  return (
    <PaymentReceiptClient
      auto={sp.auto === "1"}
      data={{
        paymentNo: payment.id.slice(-8).toUpperCase(), // 단순 id 약식 표시
        paymentDate: format(new Date(payment.paymentDate), "yyyy-MM-dd HH:mm"),
        company: {
          name: company?.name ?? "우리 상호",
          phone: company?.phone ?? null,
          businessNumber: company?.businessNumber ?? null,
          address: company?.address ?? null,
          ceo: company?.ceo ?? null,
        },
        customer: {
          name: payment.customer.name,
          phone: payment.customer.phone ?? null,
          businessNumber: payment.customer.businessNumber ?? null,
        },
        amount: Number(payment.amount),
        method: payment.method,
        kind: payment.kind,
        memo: payment.memo,
        receivedBy: payment.createdBy.name,
        remainingBalance: lastLedger ? Number(lastLedger.balance) : 0,
      }}
    />
  );
}
