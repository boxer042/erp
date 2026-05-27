"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { JmBadge, JmIconButton } from "@/jm";
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
  /** SKU 인라인 편집 — 제공 시 hover Pencil 아이콘 노출 */
  onSaveSku?: (next: string) => Promise<void>;
}

export function ProductHeaderBar({
  product,
  backHref = "/products",
  backLabel = "목록",
  actions,
  onSaveName,
  onSaveSku,
}: ProductHeaderBarProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(backHref);
    }
  };

  const renderThumb = () => {
    if (!product.imageUrl) return null;
    return (
      <div className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.imageUrl}
          alt={product.name}
          className="h-10 w-10 rounded-md object-cover border border-[var(--jm-border)]"
        />
      </div>
    );
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <JmIconButton
        variant="ghost"
        size="sm"
        className="shrink-0"
        aria-label={backLabel}
        onClick={handleBack}
      >
        <ArrowLeft />
      </JmIconButton>
      {renderThumb()}
      {onSaveName ? (
        <h2 className="text-jm-md font-semibold truncate text-[var(--jm-text)]">
          <InlineTextEdit
            value={product.name}
            productId={product.id}
            onSave={onSaveName}
          />
        </h2>
      ) : (
        <h2 className="text-jm-md font-semibold truncate text-[var(--jm-text)]">
          {product.name}
        </h2>
      )}
      {onSaveSku ? (
        <InlineTextEdit
          value={product.sku}
          productId={product.id}
          onSave={onSaveSku}
          display={
            <JmBadge variant="outline" size="sm" shape="square">
              {product.sku}
            </JmBadge>
          }
        />
      ) : (
        <JmBadge variant="outline" size="sm" shape="square">
          {product.sku}
        </JmBadge>
      )}
      {product.isSet && (
        <JmBadge variant="info" size="sm" shape="square">
          세트
        </JmBadge>
      )}
      {product.productType === "ASSEMBLED" && (
        <JmBadge variant="info" size="sm" shape="square">
          조립
        </JmBadge>
      )}
      {product.isCanonical && (
        <JmBadge variant="success" size="sm" shape="square">
          변형대표
        </JmBadge>
      )}
      {product.canonicalProductId && (
        <JmBadge variant="default" size="sm" shape="square">
          변형
        </JmBadge>
      )}
      {product.isBulk && (
        <JmBadge variant="default" size="sm" shape="square">
          벌크원료
        </JmBadge>
      )}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
