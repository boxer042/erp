"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Info, Package, ShoppingCart } from "lucide-react";

export interface ProductLite {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  sellingPrice: string;
  imageUrl: string | null;
  taxType: string;
  zeroRateEligible?: boolean;
  isBulk?: boolean;
  unitOfMeasure?: string;
  isCanonical?: boolean;
}

interface Props {
  products: ProductLite[];
  loading?: boolean;
  onAddToCart: (p: ProductLite) => void;
  onViewDetail: (p: ProductLite) => void;
}

export function ProductGrid({ products, loading, onAddToCart, onViewDetail }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 sm:gap-4 sm:p-4 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="flex flex-col gap-2 overflow-hidden p-0">
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="flex flex-col gap-1.5 p-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-5 w-1/2" />
              <div className="mt-1 flex gap-1.5">
                <Skeleton className="h-8 flex-1 rounded-md" />
                <Skeleton className="h-8 flex-1 rounded-md" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Package />
          </EmptyMedia>
          <EmptyTitle>상품이 없습니다</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 sm:gap-4 sm:p-4 md:grid-cols-4 lg:grid-cols-5">
      {products.map((p) => (
        <Card
          key={p.id}
          className="group flex flex-col gap-0 overflow-hidden p-0 transition-shadow hover:shadow-md"
        >
          <div className="relative aspect-square w-full bg-muted">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imageUrl}
                alt={p.name}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                이미지 없음
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 p-3">
            <div className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</div>
            <div className="text-base font-semibold tabular-nums">
              ₩
              {Math.round(
                Number(p.sellingPrice) * (p.taxType === "TAX_FREE" ? 1 : 1.1)
              ).toLocaleString("ko-KR")}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 flex-1"
                onClick={() => onViewDetail(p)}
              >
                <Info className="h-3.5 w-3.5" />
                <span>상세</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 flex-1"
                onClick={() => onAddToCart(p)}
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                <span>담기</span>
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
