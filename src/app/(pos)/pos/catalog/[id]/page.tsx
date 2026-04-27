import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { AddToCartButton } from "@/components/pos/add-to-cart-button";
import {
  ProductDescriptionBlock,
  ProductInfoCard,
  ProductMediaGallery,
} from "@/components/product";
import type { ProductDetail } from "@/components/product/types";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      media: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      brandRef: { select: { id: true, name: true, logoUrl: true } },
      category: { select: { id: true, name: true } },
    },
  });

  if (!product || !product.isActive) notFound();

  // Decimal/Date 직렬화
  const productJson = JSON.parse(JSON.stringify(product)) as ProductDetail;
  const mainImage =
    productJson.media?.find((m) => m.type === "IMAGE")?.url ??
    productJson.imageUrl;

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <Link
        href="/pos/catalog"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> 카탈로그로
      </Link>

      <div className="grid gap-6 md:grid-cols-2">
        <ProductMediaGallery
          imageUrl={productJson.imageUrl}
          media={productJson.media}
          variant="customer"
          productName={productJson.name}
          bare
        />

        <div className="space-y-6">
          <ProductInfoCard product={productJson} variant="customer" />

          <AddToCartButton
            product={{
              id: productJson.id,
              name: productJson.name,
              sku: productJson.sku,
              unitPrice: Number(productJson.sellingPrice),
              imageUrl: mainImage ?? null,
            }}
          />

          <ProductDescriptionBlock product={productJson} showMemo={false} />
        </div>
      </div>
    </div>
  );
}
