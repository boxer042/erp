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

  // 분할 출고 — 같은 splitGroupId 형제 주문(매장수령 A + 택배 백오더 B)을 합산해
  // 증빙 1장으로 발행 (docs/SPLIT_FULFILLMENT.md §8). 비분할(splitGroupId=null)이면
  // 클릭한 단일 주문 그대로 — 기존 동작 byte-identical 유지.
  const clicked = await prisma.order.findUnique({
    where: { id },
    select: { splitGroupId: true },
  });
  if (!clicked) notFound();

  const orders = await prisma.order.findMany({
    where: clicked.splitGroupId ? { splitGroupId: clicked.splitGroupId } : { id },
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
    // 대표(splitParentId=null) 먼저 → 백오더 B. 단일 주문도 그대로 첫 번째.
    orderBy: [{ splitParentId: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
  });
  if (orders.length === 0) notFound();

  const primary = orders[0];
  const allItems = orders.flatMap((o) => o.items);
  const subtotalAmount = orders.reduce((s, o) => s + Number(o.subtotalAmount), 0);
  const taxAmount = orders.reduce((s, o) => s + Number(o.taxAmount), 0);
  const totalAmount = orders.reduce((s, o) => s + Number(o.totalAmount), 0);
  const isSplitGroup = orders.length > 1;

  const buyer = {
    name: primary.customer?.name || primary.customerName || "",
    businessNumber: primary.customer?.businessNumber ?? null,
    ceo: primary.customer?.ceo ?? null,
    phone: primary.customer?.phone || primary.customerPhone || null,
    email: primary.customer?.email ?? null,
    address: primary.customer?.address || primary.shippingAddress || null,
  };

  // 부분 결제 (PARTIAL_PAID) — 영수증/명세표 헤더 라벨 분기 + 메모에 결제·잔금 명시.
  // 분할 그룹은 전액결제만 허용(분할+부분결제 차단)이라 단일 주문에만 적용.
  //   DEPOSIT  → "계약금 명세표"     (계약금 ₩X 입금 / 잔금 ₩Y 미수)
  //   PARTIAL  → "부분 결제 명세표"   (즉시 결제 ₩X / 잔금 ₩Y 미수)
  const isPartial =
    !isSplitGroup &&
    primary.paymentStatus === "PARTIAL_PAID" &&
    primary.paidAmount !== null;
  const paid = isPartial ? Number(primary.paidAmount) : 0;
  const outstanding = isPartial
    ? Math.max(0, Number(primary.totalAmount) - paid)
    : 0;
  const partialNote = isPartial
    ? primary.partialPaymentKind === "DEPOSIT"
      ? `[계약금] 입금 ₩${paid.toLocaleString("ko-KR")} · 잔금 ₩${outstanding.toLocaleString("ko-KR")} 미수`
      : `[부분 결제] 즉시 결제 ₩${paid.toLocaleString("ko-KR")} · 잔금 ₩${outstanding.toLocaleString("ko-KR")} 미수`
    : null;
  const docTitle = isPartial
    ? primary.partialPaymentKind === "DEPOSIT"
      ? "계약금 명세표"
      : "부분 결제 명세표"
    : "거래명세표";
  // 분할 그룹이면 합산 안내 (매장수령 대표 + 택배 백오더 합산)
  const splitNote = isSplitGroup
    ? `분할 출고 합산 — ${orders.map((o) => o.orderNo).join(" + ")}`
    : null;
  const docMemo = [splitNote, partialNote, primary.memo]
    .filter(Boolean)
    .join(" · ");

  return (
    <DocumentPdf
      title={docTitle}
      docKind="statement"
      documentNo={primary.orderNo}
      issueDate={primary.orderDate.toISOString()}
      supplier={OUR_COMPANY}
      buyer={buyer}
      items={allItems.map((it) => ({
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
      subtotalAmount={subtotalAmount.toString()}
      taxAmount={taxAmount.toString()}
      totalAmount={totalAmount.toString()}
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
