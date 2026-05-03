"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ProductDetail } from "./types";
import { InlineTextEdit } from "./edit/inline-text-edit";

interface ProductHeaderBarProps {
  product: Pick<
    ProductDetail,
    | "id"
    | "name"
    | "sku"
    | "imageUrl"
    | "isSet"
    | "isCanonical"
    | "canonicalProductId"
    | "isBulk"
    | "productType"
  >;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  /** 상품명 인라인 편집 — 제공 시 hover Pencil 아이콘 노출 */
  onSaveName?: (next: string) => Promise<void>;
}

export function ProductHeaderBar({
  product,
  backHref = "/products",
  backLabel = "목록",
  actions,
  onSaveName,
}: ProductHeaderBarProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(backHref);
    }
  };

  // 대표 이미지는 페이지 하단 ProductMediaManager에서 관리. 여기서는 시각적 컨텍스트만 표시
  const renderThumb = () => {
    if (!product.imageUrl) return null;
    return (
      <div className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.imageUrl}
          alt={product.name}
          className="h-10 w-10 rounded-md object-cover border border-border"
        />
      </div>
    );
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        aria-label={backLabel}
        onClick={handleBack}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      {renderThumb()}
      {onSaveName ? (
        <h2 className="text-lg font-semibold truncate">
          <InlineTextEdit
            value={product.name}
            productId={product.id}
            onSave={onSaveName}
          />
        </h2>
      ) : (
        <h2 className="text-lg font-semibold truncate">{product.name}</h2>
      )}
      <Badge variant="outline">{product.sku}</Badge>
      {product.isSet && <Badge>세트</Badge>}
      {product.productType === "ASSEMBLED" && <Badge>조립</Badge>}
      {product.isCanonical && <Badge variant="default">대표</Badge>}
      {product.canonicalProductId && <Badge variant="secondary">변형</Badge>}
      {product.isBulk && <Badge variant="secondary">벌크원료</Badge>}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
