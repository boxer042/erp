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
  searchParams: Promise<{ auto?: string; supplyOnly?: string }>;
}) {
  const { id } = await params;
  const { our: OUR_COMPANY, bank: BANK_INFO } = await loadOurCompany();
  const { auto, supplyOnly } = await searchParams;
  const s = await prisma.statement.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      customer: true,
      // 연결된 Order 의 부분 결제 메타 — 명세표 헤더·메모 분기용
      order: {
        select: {
          paymentStatus: true,
          paidAmount: true,
          partialPaymentKind: true,
          totalAmount: true,
        },
      },
    },
  });
  if (!s) notFound();

  // 부분 결제 (PARTIAL_PAID) — 연결 Order 가 있을 때만 의미. statement 단독은 미적용.
  const isPartial =
    s.order?.paymentStatus === "PARTIAL_PAID" && s.order?.paidAmount !== null;
  const paid = isPartial ? Number(s.order!.paidAmount) : 0;
  const outstanding = isPartial
    ? Math.max(0, Number(s.order!.totalAmount) - paid)
    : 0;
  const partialNote = isPartial
    ? s.order!.partialPaymentKind === "DEPOSIT"
      ? `[계약금] 입금 ₩${paid.toLocaleString("ko-KR")} · 잔금 ₩${outstanding.toLocaleString("ko-KR")} 미수`
      : `[부분 결제] 즉시 결제 ₩${paid.toLocaleString("ko-KR")} · 잔금 ₩${outstanding.toLocaleString("ko-KR")} 미수`
    : null;
  const docTitle = isPartial
    ? s.order!.partialPaymentKind === "DEPOSIT"
      ? "계약금 명세표"
      : "부분 결제 명세표"
    : "거래명세표";
  const docMemo = [partialNote, s.memo].filter(Boolean).join(" · ");

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
      title={docTitle}
      docKind="statement"
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
      memo={docMemo || null}
      autoPrint={auto === "1"}
      supplyOnly={supplyOnly === "1"}
      fillPage
      compactSupplier
      bankName={BANK_INFO.name}
      bankHolder={BANK_INFO.holder}
      bankAccount={BANK_INFO.account}
    />
  );
}
