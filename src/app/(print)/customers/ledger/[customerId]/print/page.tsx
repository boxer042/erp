import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CustomerLedgerPdf } from "@/components/customer-ledger-pdf";

async function loadOurCompany() {
  const company = await prisma.companyInfo.findUnique({
    where: { id: "singleton" },
  });
  return {
    name: company?.name || "우리 회사",
    businessNumber: company?.businessNumber ?? null,
    ceo: company?.ceo ?? null,
    phone: company?.phone ?? null,
    email: company?.email ?? null,
    address: company?.address ?? null,
  };
}

export default async function CustomerLedgerPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ from?: string; to?: string; auto?: string; supplyOnly?: string }>;
}) {
  const { customerId } = await params;
  const { from, to, auto, supplyOnly } = await searchParams;
  const OUR_COMPANY = await loadOurCompany();

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      businessNumber: true,
      ceo: true,
      phone: true,
      email: true,
      address: true,
    },
  });
  if (!customer) notFound();

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  // 이월 잔액 — from 이전 마지막 엔트리
  const openingBalance = fromDate
    ? await (async () => {
        const before = await prisma.customerLedger.findFirst({
          where: { customerId, date: { lt: fromDate } },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          select: { balance: true },
        });
        return before ? Number(before.balance) : 0;
      })()
    : 0;

  const customerInfo = {
    name: customer.name,
    businessNumber: customer.businessNumber,
    ceo: customer.ceo,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
  };

  const entries = await prisma.customerLedger.findMany({
    where: {
      customerId,
      ...(fromDate || toDate
        ? {
            date: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lt: toDate } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  return (
    <CustomerLedgerPdf
      company={OUR_COMPANY}
      customer={customerInfo}
      periodFrom={from ?? null}
      periodTo={to ?? null}
      openingBalance={openingBalance}
      entries={entries.map((e) => ({
        id: e.id,
        date: e.date.toISOString(),
        type: e.type as "SALE" | "RECEIPT" | "ADJUSTMENT" | "REFUND",
        description: e.description,
        debitAmount: e.debitAmount.toString(),
        creditAmount: e.creditAmount.toString(),
        balance: e.balance.toString(),
      }))}
      autoPrint={auto === "1"}
      supplyOnly={supplyOnly === "1"}
    />
  );
}
