import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DocumentPdf } from "@/components/document-pdf";

const OUR_COMPANY = {
  name: process.env.COMPANY_NAME || "우리 회사",
  businessNumber: process.env.COMPANY_BIZ_NO || null,
  ceo: process.env.COMPANY_CEO || null,
  phone: process.env.COMPANY_PHONE || null,
  email: process.env.COMPANY_EMAIL || null,
  address: process.env.COMPANY_ADDRESS || null,
  businessType: process.env.COMPANY_BUSINESS_TYPE || null,
  businessItem: process.env.COMPANY_BUSINESS_ITEM || null,
};

const BANK_INFO = {
  name: process.env.COMPANY_BANK_NAME || null,
  holder: process.env.COMPANY_BANK_HOLDER || null,
  account: process.env.COMPANY_BANK_ACCOUNT || null,
};

export default async function StatementPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
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
