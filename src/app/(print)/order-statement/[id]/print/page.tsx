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
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  const { our: OUR_COMPANY, bank: BANK_INFO } = await loadOurCompany();
  const { auto } = await searchParams;

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

  return (
    <DocumentPdf
      title="거래명세표"
      docKind="statement"
      documentNo={order.orderNo}
      issueDate={order.orderDate.toISOString()}
      supplier={OUR_COMPANY}
      buyer={buyer}
      items={order.items.map((it) => ({
        name: it.product?.name ?? it.serviceName ?? "—",
        spec: it.product?.sku ?? null,
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
      memo={order.memo}
      autoPrint={auto === "1"}
      fillPage
      compactSupplier
      bankName={BANK_INFO.name}
      bankHolder={BANK_INFO.holder}
      bankAccount={BANK_INFO.account}
    />
  );
}
