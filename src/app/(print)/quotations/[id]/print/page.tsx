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

export default async function QuotationPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  const { auto } = await searchParams;
  const { our: OUR_COMPANY, bank: BANK_INFO } = await loadOurCompany();
  const q = await prisma.quotation.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      customer: true,
      supplier: true,
    },
  });
  if (!q) notFound();

  const isSales = q.type === "SALES";
  const counterParty = isSales
    ? {
        name: q.customer?.name || "",
        businessNumber: q.customer?.businessNumber,
        ceo: q.customer?.ceo,
        phone: q.customer?.phone,
        email: q.customer?.email,
        address: q.customer?.address,
      }
    : {
        name: q.supplier?.name || "",
        businessNumber: q.supplier?.businessNumber,
        ceo: q.supplier?.representative,
        phone: q.supplier?.phone,
        email: q.supplier?.email,
        address: q.supplier?.address,
      };

  // 판매 견적서: 공급자=우리, 받는자=고객
  // 매입 견적서: 공급자=거래처, 받는자=우리
  const supplier = isSales ? OUR_COMPANY : counterParty;
  const buyer = isSales ? counterParty : OUR_COMPANY;

  return (
    <DocumentPdf
      title="견적서"
      documentNo={q.quotationNo}
      issueDate={q.issueDate.toISOString()}
      validUntil={q.validUntil?.toISOString()}
      supplier={supplier}
      buyer={buyer}
      items={q.items.map((it) => ({
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
      subtotalAmount={q.subtotalAmount.toString()}
      taxAmount={q.taxAmount.toString()}
      totalAmount={q.totalAmount.toString()}
      memo={q.memo}
      terms={q.terms}
      autoPrint={auto === "1"}
      fillPage
      compactSupplier
      bankName={BANK_INFO.name}
      bankHolder={BANK_INFO.holder}
      bankAccount={BANK_INFO.account}
    />
  );
}
