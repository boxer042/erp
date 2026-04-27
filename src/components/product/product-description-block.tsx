import { ProductSection } from "./product-section";
import type { ProductDetail } from "./types";

interface ProductDescriptionBlockProps {
  product: Pick<ProductDetail, "description" | "memo">;
  showMemo?: boolean;
}

export function ProductDescriptionBlock({
  product,
  showMemo = true,
}: ProductDescriptionBlockProps) {
  const hasDescription = !!product.description?.trim();
  const hasMemo = showMemo && !!product.memo?.trim();

  if (!hasDescription && !hasMemo) {
    return (
      <ProductSection title="상품 설명">
        <p className="text-sm text-muted-foreground">등록된 상품 설명이 없습니다</p>
      </ProductSection>
    );
  }

  return (
    <ProductSection title="상품 설명">
      <div className="space-y-4">
        {hasDescription && (
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">설명</div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{product.description}</p>
          </div>
        )}
        {hasMemo && (
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">메모 (내부)</div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">
              {product.memo}
            </p>
          </div>
        )}
      </div>
    </ProductSection>
  );
}
