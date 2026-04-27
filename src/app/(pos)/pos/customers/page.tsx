import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Search, Plus } from "lucide-react";
import { CustomerSearchInput } from "@/components/pos/customer-search-input";

export default async function PosCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim();

  const customers = await prisma.customer.findMany({
    where: {
      isActive: true,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { phone: { contains: query } },
              { businessNumber: { contains: query } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">고객</h1>
        <div className="flex items-center gap-2">
          <CustomerSearchInput initial={q ?? ""} />
          <Link
            href="/pos/customers/new"
            className="flex h-11 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> 신규
          </Link>
        </div>
      </div>

      {customers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          {query ? `"${query}"에 대한 고객이 없습니다` : "등록된 고객이 없습니다"}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-background">
          {customers.map((c) => (
            <li key={c.id}>
              <Link
                href={`/pos/customers/${c.id}`}
                className="flex items-center justify-between p-4 hover:bg-muted/50"
              >
                <div>
                  <div className="text-base font-medium">{c.name}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {c.phone}
                    {c.businessNumber ? <span className="ml-2">· {c.businessNumber}</span> : null}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {c.address ?? ""}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
