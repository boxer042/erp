import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DocumentPdf } from "@/components/document-pdf";

async function loadOurCompany() {
  const company = await prisma.companyInfo.findUnique({
    where: { id: "singleton" },
    include: {
      bankAccounts: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  const our = {
    name: company?.name || "우리 회사",
    businessNumber: company?.businessNumber ?? null,
    ceo: company?.ceo ?? null,
    phone: company?.phone ?? null,
    email: company?.email ?? null,
    address: company?.address ?? null,
    businessType: company?.businessType ?? null,
    businessItem: company?.businessItem ?? null,
  };
  const primaryBank =
    company?.bankAccounts.find((b) => b.isPrimary) ?? company?.bankAccounts[0] ?? null;
  const bank = {
    name: primaryBank?.bankName ?? null,
    holder: primaryBank?.holder ?? null,
    account: primaryBank?.account ?? null,
  };
  return { our, bank };
}

export default async function StatementPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  const { our: OUR_COMPANY, bank: BANK_INFO } = await loadOurCompany();
  const { auto } = await searchParams;
  const s = await prisma.statement.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      customer: true,
    },
  });
  if (!s) notFound();

  const buyer = {
    name: s.customer?.name || s.customerNameSnapshot || "",
    businessNumber: s.customer?.businessNumber || s.customerBusinessNumberSnapshot,
    ceo: s.customer?.ceo,
    phone: s.customer?.phone || s.customerPhoneSnapshot,
    email: s.customer?.email,
    address: s.customer?.address || s.customerAddressSnapshot,
  };

  return (
    <DocumentPdf
      title="거래명세표"
      documentNo={s.statementNo}
      issueDate={s.issueDate.toISOString()}
      supplier={OUR_COMPANY}
      buyer={buyer}
      items={s.items.map((it) => ({
        name: it.name,
        spec: it.spec,
        unitOfMeasure: it.unitOfMeasure,
        quantity: it.quantity.toString(),
        listPrice: it.listPrice.toString(),
        discountAmount: it.discountAmount.toString(),
        unitPrice: it.unitPrice.toString(),
        totalPrice: it.totalPrice.toString(),
        isTaxable: it.isTaxable,
        memo: it.memo,
      }))}
      subtotalAmount={s.subtotalAmount.toString()}
      taxAmount={s.taxAmount.toString()}
      totalAmount={s.totalAmount.toString()}
      memo={s.memo}
      autoPrint={auto === "1"}
      fillPage
      compactSupplier
      bankName={BANK_INFO.name}
      bankHolder={BANK_INFO.holder}
      bankAccount={BANK_INFO.account}
    />
  );
}
