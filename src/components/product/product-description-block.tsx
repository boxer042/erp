import { ProductSection } from "./product-section";
import { InlineTextEdit } from "./edit/inline-text-edit";
import type { ProductDetail } from "./types";

interface ProductDescriptionBlockProps {
  product: Pick<ProductDetail, "id" | "description" | "memo">;
  showMemo?: boolean;
  /** 설명 인라인 편집 — 제공 시 Pencil 노출 */
  onSaveDescription?: (next: string) => Promise<void>;
  /** 메모 인라인 편집 — 제공 시 Pencil 노출 */
  onSaveMemo?: (next: string) => Promise<void>;
}

export function ProductDescriptionBlock({
  product,
  showMemo = true,
  onSaveDescription,
  onSaveMemo,
}: ProductDescriptionBlockProps) {
  const hasDescription = !!product.description?.trim();
  const hasMemo = showMemo && !!product.memo?.trim();
  const editable = !!onSaveDescription || !!(showMemo && onSaveMemo);

  if (!hasDescription && !hasMemo && !editable) {
    return (
      <ProductSection title="상품 설명">
        <p className="text-sm text-muted-foreground">등록된 상품 설명이 없습니다</p>
      </ProductSection>
    );
  }

  return (
    <ProductSection title="상품 설명">
      <div className="space-y-4">
        {(hasDescription || onSaveDescription) && (
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">설명</div>
            {onSaveDescription ? (
              <div className="text-sm whitespace-pre-wrap leading-relaxed">
                <InlineTextEdit
                  value={product.description ?? ""}
                  productId={product.id}
                  onSave={onSaveDescription}
                  multiline
                  allowEmpty
                  placeholder="설명 추가..."
                />
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{product.description}</p>
            )}
          </div>
        )}
        {showMemo && (hasMemo || onSaveMemo) && (
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">메모 (내부)</div>
            {onSaveMemo ? (
              <div className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">
                <InlineTextEdit
                  value={product.memo ?? ""}
                  productId={product.id}
                  onSave={onSaveMemo}
                  multiline
                  allowEmpty
                  placeholder="메모 추가..."
                />
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">
                {product.memo}
              </p>
            )}
          </div>
        )}
      </div>
    </ProductSection>
  );
}
