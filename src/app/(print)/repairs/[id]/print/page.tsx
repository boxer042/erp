import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { RepairStatementPdf, type RepairStatementData } from "@/components/repair-statement-pdf";

async function loadCompany() {
  const company = await prisma.companyInfo.findUnique({
    where: { id: "singleton" },
  });
  return {
    name: company?.name ?? "우리 상호",
    businessNumber: company?.businessNumber ?? null,
    ceo: company?.ceo ?? null,
    phone: company?.phone ?? null,
    email: company?.email ?? null,
    address: company?.address ?? null,
  };
}

export default async function RepairPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const [ticket, company] = await Promise.all([
    prisma.repairTicket.findUnique({
      where: { id },
      include: {
        customer: true,
        customerMachine: true,
        serialItem: { include: { product: true } },
        parts: {
          where: { status: "USED" }, // 고객 영수증엔 USED만
          include: { product: true },
          orderBy: { createdAt: "asc" },
        },
        labors: { orderBy: { createdAt: "asc" } },
      },
    }),
    loadCompany(),
  ]);

  if (!ticket) notFound();

  const deviceLine =
    ticket.serialItem?.product?.name ?? ticket.customerMachine?.name ?? null;

  const td = ticket.totalDiscount || "0";
  const usedTotal = ticket.parts.reduce(
    (s, p) => s + Number(p.totalPrice),
    0,
  );
  const laborTotal = ticket.labors.reduce(
    (s, l) => s + Number(l.totalPrice),
    0,
  );
  const subtotal = usedTotal + laborTotal + Number(ticket.diagnosisFee);
  const discountAmount = td.endsWith("%")
    ? Math.round((subtotal * (parseFloat(td) || 0)) / 100)
    : parseInt(td.replace(/,/g, ""), 10) || 0;

  const repair: RepairStatementData = {
    ticketNo: ticket.ticketNo,
    type: ticket.type,
    receivedAt: format(ticket.receivedAt, "yyyy-MM-dd HH:mm"),
    pickedUpAt: ticket.pickedUpAt ? format(ticket.pickedUpAt, "yyyy-MM-dd HH:mm") : null,
    customerName: ticket.customer?.name ?? "(미등록)",
    customerPhone: ticket.customer?.phone ?? null,
    deviceLine,
    serialCode: ticket.serialItem?.code ?? null,
    symptom: ticket.symptom,
    diagnosis: ticket.diagnosis,
    repairNotes: ticket.repairNotes,
    parts: ticket.parts.map((p) => ({
      name: p.product.name,
      sku: p.product.sku,
      quantity: p.quantity.toString(),
      unitPrice: p.unitPrice.toString(),
      totalPrice: p.totalPrice.toString(),
    })),
    labors: ticket.labors.map((l) => ({
      name: l.name,
      hours: l.hours.toString(),
      unitRate: l.unitRate.toString(),
      totalPrice: l.totalPrice.toString(),
    })),
    diagnosisFee: Number(ticket.diagnosisFee),
    totalDiscount: discountAmount,
    finalAmount: Number(ticket.finalAmount) > 0 ? Number(ticket.finalAmount) : Math.max(0, subtotal - discountAmount),
    repairWarrantyMonths: ticket.repairWarrantyMonths,
    repairWarrantyEnds: ticket.repairWarrantyEnds
      ? format(ticket.repairWarrantyEnds, "yyyy-MM-dd")
      : null,
  };

  return (
    <div className="h-screen w-screen">
      <RepairStatementPdf company={company} repair={repair} autoPrint={sp.auto === "1"} />
    </div>
  );
}
