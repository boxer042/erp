import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SupplierLedgerPdf } from "@/components/supplier-ledger-pdf";
import {
  SupplierItemsPdf,
  type ItemsPdfRow,
} from "@/components/supplier-items-pdf";

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

export default async function SupplierLedgerPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<{ from?: string; to?: string; auto?: string; view?: string }>;
}) {
  const { supplierId } = await params;
  const { from, to, auto, view } = await searchParams;
  const OUR_COMPANY = await loadOurCompany();

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: {
      id: true,
      name: true,
      businessNumber: true,
      representative: true,
      phone: true,
      email: true,
      address: true,
    },
  });
  if (!supplier) notFound();

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  // 이월 잔액: from 이전 마지막 엔트리의 balance
  const openingBalance = fromDate
    ? await (async () => {
        const before = await prisma.supplierLedger.findFirst({
          where: { supplierId, date: { lt: fromDate } },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          select: { balance: true },
        });
        return before ? Number(before.balance) : 0;
      })()
    : 0;

  const supplierInfo = {
    name: supplier.name,
    businessNumber: supplier.businessNumber,
    ceo: supplier.representative,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
  };

  // ─── 품목별 뷰 PDF ───
  if (view === "items") {
    const incomings = await prisma.incoming.findMany({
      where: {
        supplierId,
        status: "CONFIRMED",
        ...(fromDate || toDate
          ? {
              incomingDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lt: toDate } : {}),
              },
            }
          : {}),
      },
      include: {
        items: {
          include: {
            supplierProduct: {
              select: {
                id: true,
                name: true,
                spec: true,
                supplierCode: true,
                unitOfMeasure: true,
                isTaxable: true,
              },
            },
          },
        },
      },
      orderBy: { incomingDate: "asc" },
    });

    const paymentLedgers = await prisma.supplierLedger.findMany({
      where: {
        supplierId,
        type: { in: ["PAYMENT", "ADJUSTMENT", "REFUND"] },
        ...(fromDate || toDate
          ? {
              date: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lt: toDate } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "asc" },
    });

    const rows: ItemsPdfRow[] = [];
    for (const inc of incomings) {
      for (const it of inc.items) {
        const unitPrice = Number(it.unitPrice);
        const qty = Number(it.quantity);
        const origPrice = it.originalPrice ? Number(it.originalPrice) : unitPrice;
        const discountPerUnit = origPrice > unitPrice ? origPrice - unitPrice : 0;
        const supply = Number(it.totalPrice);
        const totalWithTax = it.supplierProduct.isTaxable
          ? Math.round(supply * 1.1)
          : supply;
        rows.push({
          id: it.id,
          kind: "item",
          date: inc.incomingDate.toISOString(),
          incomingNo: inc.incomingNo,
          productName: it.supplierProduct.name,
          supplierCode: it.supplierProduct.supplierCode,
          spec: it.supplierProduct.spec,
          unitOfMeasure: it.supplierProduct.unitOfMeasure,
          quantity: qty,
          unitPrice,
          discountPerUnit,
          totalWithTax,
        });
      }
    }
    const TYPE_LABEL: Record<string, string> = {
      PAYMENT: "결제",
      ADJUSTMENT: "조정",
      REFUND: "환급",
    };
    for (const p of paymentLedgers) {
      rows.push({
        id: p.id,
        kind: "payment",
        date: p.date.toISOString(),
        typeLabel: TYPE_LABEL[p.type] ?? p.type,
        description: p.description,
        debitAmount: p.debitAmount.toString(),
        creditAmount: p.creditAmount.toString(),
      });
    }
    // 날짜 오름차순 정렬 (결제·품목 섞어서)
    rows.sort((a, b) => a.date.localeCompare(b.date));

    // 기말 잔액: 기간 내 마지막 원장 엔트리의 balance (없으면 openingBalance)
    const lastLedger = await prisma.supplierLedger.findFirst({
      where: {
        supplierId,
        ...(fromDate || toDate
          ? {
              date: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lt: toDate } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { balance: true },
    });
    const endingBalance = lastLedger ? Number(lastLedger.balance) : openingBalance;

    return (
      <SupplierItemsPdf
        company={OUR_COMPANY}
        supplier={supplierInfo}
        periodFrom={from ?? null}
        periodTo={to ?? null}
        openingBalance={openingBalance}
        endingBalance={endingBalance}
        rows={rows}
        autoPrint={auto === "1"}
      />
    );
  }

  // ─── 원장 뷰 PDF (기본) ───
  const entries = await prisma.supplierLedger.findMany({
    where: {
      supplierId,
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
    <SupplierLedgerPdf
      company={OUR_COMPANY}
      supplier={supplierInfo}
      periodFrom={from ?? null}
      periodTo={to ?? null}
      openingBalance={openingBalance}
      entries={entries.map((e) => ({
        id: e.id,
        date: e.date.toISOString(),
        type: e.type as "PURCHASE" | "PAYMENT" | "ADJUSTMENT" | "REFUND",
        description: e.description,
        debitAmount: e.debitAmount.toString(),
        creditAmount: e.creditAmount.toString(),
        balance: e.balance.toString(),
      }))}
      autoPrint={auto === "1"}
    />
  );
}
