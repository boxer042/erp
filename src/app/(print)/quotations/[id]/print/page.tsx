import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DocumentPdf } from "@/components/document-pdf";

// 공급자(우리) 정보는 환경변수/설정에서 읽을 수 있도록 추후 확장. 지금은 placeholder.
const OUR_COMPANY = {
  name: process.env.COMPANY_NAME || "우리 회사",
  businessNumber: process.env.COMPANY_BIZ_NO || null,
  ceo: process.env.COMPANY_CEO || null,
  phone: process.env.COMPANY_PHONE || null,
  email: process.env.COMPANY_EMAIL || null,
  address: process.env.COMPANY_ADDRESS || null,
  businessType: process.env.COMPANY_BUSINESS_TYPE || null,   // 업태
  businessItem: process.env.COMPANY_BUSINESS_ITEM || null,   // 종목
};

const BANK_INFO = {
  name: process.env.COMPANY_BANK_NAME || null,        // 은행명
  holder: process.env.COMPANY_BANK_HOLDER || null,    // 예금주
  account: process.env.COMPANY_BANK_ACCOUNT || null,  // 계좌번호
};

export default async function QuotationPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  const { auto } = await searchParams;
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
