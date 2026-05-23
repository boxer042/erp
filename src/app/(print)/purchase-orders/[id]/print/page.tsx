import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PurchaseOrderPdf } from "@/components/purchase-order-pdf";

export default async function PurchaseOrderPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  const { auto } = await searchParams;

  const company = await prisma.companyInfo.findUnique({
    where: { id: "singleton" },
    select: {
      name: true,
      ceo: true,
      phone: true,
      email: true,
      address: true,
    },
  });

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          supplierProduct: {
            select: { name: true, spec: true, unitOfMeasure: true, supplierCode: true },
          },
        },
      },
      supplier: { select: { name: true, businessNumber: true, representative: true } },
    },
  });
  if (!po) notFound();

  const subtotal = Number(po.totalAmount);
  const tax = Math.round(subtotal * 0.1);
  const grandTotal = subtotal + tax;

  return (
    <PurchaseOrderPdf
      documentNo={po.poNo}
      orderDate={po.orderDate.toISOString()}
      expectedDate={po.expectedDate?.toISOString() ?? null}
      shippingMethod={po.shippingMethod ?? null}
      promisedDate={po.promisedDate?.toISOString() ?? null}
      shippingMemo={po.shippingMemo ?? null}
      issuer={
        company
          ? {
              name: company.name,
              ceo: company.ceo,
              phone: company.phone,
              email: company.email,
              address: company.address,
            }
          : null
      }
      supplier={{
        name: po.supplier.name,
        representative: po.supplier.representative,
        businessNumber: po.supplier.businessNumber,
      }}
      items={po.items.map((it) => ({
        name: it.supplierProduct?.name ?? it.name ?? "",
        spec: it.supplierProduct?.spec ?? null,
        supplierCode: it.supplierProduct?.supplierCode ?? null,
        unitOfMeasure: it.supplierProduct?.unitOfMeasure ?? "EA",
        priceUndetermined: it.priceUndetermined,
        quantity: it.quantity.toString(),
        unitPrice: it.unitPrice.toString(),
        totalPrice: it.totalPrice.toString(),
      }))}
      subtotalAmount={subtotal}
      taxAmount={tax}
      totalAmount={grandTotal}
      memo={po.memo}
      autoPrint={auto === "1"}
    />
  );
}
