import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CatalogSearch } from "@/components/pos/catalog-search";

async function getProducts(query?: string) {
  return prisma.product.findMany({
    where: {
      isActive: true,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { sku: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      sku: true,
      brand: true,
      sellingPrice: true,
      imageUrl: true,
      productType: true,
    },
    orderBy: { name: "asc" },
    take: 200,
  });
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const products = await getProducts(q?.trim());

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">상품</h1>
        <CatalogSearch initial={q ?? ""} />
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          {q ? `"${q}"에 대한 결과가 없습니다` : "상품이 없습니다"}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <Link
              key={p.id}
              href={`/pos/catalog/${p.id}`}
              className="group overflow-hidden rounded-xl border border-border bg-background transition-all hover:border-primary hover:shadow-md"
            >
              <div className="aspect-square w-full overflow-hidden bg-muted">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                    이미지 없음
                  </div>
                )}
              </div>
              <div className="p-4">
                {p.brand ? (
                  <div className="text-xs text-muted-foreground">{p.brand}</div>
                ) : null}
                <div className="mt-1 line-clamp-2 text-base font-medium leading-snug">
                  {p.name}
                </div>
                <div className="mt-2 text-lg font-semibold tracking-tight">
                  ₩{Number(p.sellingPrice).toLocaleString("ko-KR")}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
