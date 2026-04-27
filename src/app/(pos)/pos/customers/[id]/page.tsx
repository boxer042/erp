import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ChevronLeft } from "lucide-react";
import { CustomerDetailTabs } from "@/components/pos/customer-detail-tabs";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      orders: {
        orderBy: { orderDate: "desc" },
        take: 50,
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  isSet: true,
                  setComponents: {
                    include: {
                      component: { select: { id: true, name: true, sku: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      quotations: { orderBy: { issueDate: "desc" }, take: 50 },
      statements: { orderBy: { issueDate: "desc" }, take: 50 },
    },
  });

  if (!customer) notFound();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link
        href="/pos/customers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> 고객 목록
      </Link>

      <div className="mb-6 rounded-xl border border-border bg-background p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold tracking-tight">{customer.name}</div>
            <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
              <div>{customer.phone}</div>
              {customer.businessNumber ? <div>사업자: {customer.businessNumber}</div> : null}
              {customer.ceo ? <div>대표자: {customer.ceo}</div> : null}
              {customer.email ? <div>{customer.email}</div> : null}
              {customer.address ? <div>{customer.address}</div> : null}
            </div>
          </div>
        </div>
      </div>

      <CustomerDetailTabs
        customerId={customer.id}
        orders={customer.orders.map((o) => ({
          id: o.id,
          orderNo: o.orderNo,
          orderDate: o.orderDate.toISOString(),
          totalAmount: Number(o.totalAmount),
          status: o.status,
          itemCount: o.items.length,
          paymentMethod: o.paymentMethod,
          items: o.items.map((item) => ({
            id: item.id,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            totalPrice: Number(item.totalPrice),
            productName: item.product?.name ?? "",
            productSku: item.product?.sku ?? "",
            isSet: item.product?.isSet ?? false,
            components: (item.product?.setComponents ?? []).map((sc) => ({
              id: sc.id,
              label: sc.label ?? sc.component.name,
              componentName: sc.component.name,
              componentSku: sc.component.sku,
              quantity: Number(sc.quantity),
            })),
          })),
        }))}
        quotations={customer.quotations.map((q) => ({
          id: q.id,
          quotationNo: q.quotationNo,
          issueDate: q.issueDate.toISOString(),
          totalAmount: Number(q.totalAmount),
          status: q.status,
        }))}
        statements={customer.statements.map((s) => ({
          id: s.id,
          statementNo: s.statementNo,
          issueDate: s.issueDate.toISOString(),
          totalAmount: Number(s.totalAmount),
        }))}
      />
    </div>
  );
}
