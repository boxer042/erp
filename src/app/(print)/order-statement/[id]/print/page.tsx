import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DocumentPdf } from "@/components/document-pdf";

/**
 * 주문 → 거래명세표 인쇄. 별도 Statement 레코드 없이 Order 데이터로 바로 렌더.
 * 통합 판매내역 상세의 [거래명세표] 버튼이 새 탭으로 연다.
 */
async function loadOurCompany() {
  const company = await prisma.companyInfo.findUnique({
    where: { id: "singleton" },
    include: {
      bankAccounts: {
        orderBy: [
          { isPrimary: "desc" },
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
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
    company?.bankAccounts.find((b) => b.isPrimary) ??
    company?.bankAccounts[0] ??
    null;
  const bank = {
    name: primaryBank?.bankName ?? null,
    holder: primaryBank?.holder ?? null,
    account: primaryBank?.account ?? null,
  };
  return { our, bank };
}

export default async function OrderStatementPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string; supplyOnly?: string }>;
}) {
  const { id } = await params;
  const { our: OUR_COMPANY, bank: BANK_INFO } = await loadOurCompany();
  const { auto, supplyOnly } = await searchParams;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              spec: true,
              unitOfMeasure: true,
              taxType: true,
            },
          },
        },
      },
    },
  });
  if (!order) notFound();

  const buyer = {
    name: order.customer?.name || order.customerName || "",
    businessNumber: order.customer?.businessNumber ?? null,
    ceo: order.customer?.ceo ?? null,
    phone: order.customer?.phone || order.customerPhone || null,
    email: order.customer?.email ?? null,
    address: order.customer?.address || order.shippingAddress || null,
  };

  // 부분 결제 (PARTIAL_PAID) — 영수증/명세표 헤더 라벨 분기 + 메모에 결제·잔금 명시
  //   DEPOSIT  → "계약금 명세표"     (계약금 ₩X 입금 / 잔금 ₩Y 미수)
  //   PARTIAL  → "부분 결제 명세표"   (즉시 결제 ₩X / 잔금 ₩Y 미수)
  const isPartial =
    order.paymentStatus === "PARTIAL_PAID" && order.paidAmount !== null;
  const paid = isPartial ? Number(order.paidAmount) : 0;
  const outstanding = isPartial
    ? Math.max(0, Number(order.totalAmount) - paid)
    : 0;
  const partialNote = isPartial
    ? order.partialPaymentKind === "DEPOSIT"
      ? `[계약금] 입금 ₩${paid.toLocaleString("ko-KR")} · 잔금 ₩${outstanding.toLocaleString("ko-KR")} 미수`
      : `[부분 결제] 즉시 결제 ₩${paid.toLocaleString("ko-KR")} · 잔금 ₩${outstanding.toLocaleString("ko-KR")} 미수`
    : null;
  const docTitle = isPartial
    ? order.partialPaymentKind === "DEPOSIT"
      ? "계약금 명세표"
      : "부분 결제 명세표"
    : "거래명세표";
  const docMemo = [partialNote, order.memo].filter(Boolean).join(" · ");

  return (
    <DocumentPdf
      title={docTitle}
      docKind="statement"
      documentNo={order.orderNo}
      issueDate={order.orderDate.toISOString()}
      supplier={OUR_COMPANY}
      buyer={buyer}
      items={order.items.map((it) => ({
        name: it.product?.name ?? it.serviceName ?? "—",
        spec: it.product?.spec ?? null,
        unitOfMeasure: it.product?.unitOfMeasure ?? "EA",
        quantity: it.quantity.toString(),
        listPrice: (it.listPrice ?? it.unitPrice).toString(),
        discountAmount: (it.discountAmount ?? 0).toString(),
        unitPrice: it.unitPrice.toString(),
        totalPrice: it.totalPrice.toString(),
        // 상품은 taxType 기준, 서비스(기술료) 라인은 항상 과세
        isTaxable: it.product ? it.product.taxType === "TAXABLE" : true,
        memo: null,
      }))}
      subtotalAmount={order.subtotalAmount.toString()}
      taxAmount={order.taxAmount.toString()}
      totalAmount={order.totalAmount.toString()}
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
