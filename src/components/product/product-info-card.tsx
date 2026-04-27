import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TAX_TYPE_LABELS,
  PRODUCT_TYPE_LABELS,
  fmtPrice,
  formatDateOnly,
  toVatPrice,
} from "./helpers";
import { ProductSection } from "./product-section";
import type { ProductCardVariant, ProductDetail } from "./types";

interface ProductInfoCardProps {
  product: ProductDetail;
  variant?: ProductCardVariant;
  /** 편집 버튼 클릭 핸들러 — 제공 시 우측 상단에 "편집" 버튼 노출 */
  onEdit?: () => void;
}

interface FieldItem {
  label: string;
  value: React.ReactNode;
  full?: boolean;
}

function Field({ label, value, full }: FieldItem) {
  return (
    <div className={`space-y-1 ${full ? "sm:col-span-2" : ""}`}>
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || <span className="text-muted-foreground">-</span>}</dd>
    </div>
  );
}

export function ProductInfoCard({ product, variant = "admin", onEdit }: ProductInfoCardProps) {
  const isCustomer = variant === "customer";
  const displayVat = toVatPrice(product.sellingPrice, product.taxType);
  const displayList = product.listPrice
    ? toVatPrice(product.listPrice, product.taxType)
    : null;

  const adminFields: FieldItem[] = [
    { label: "상품명", value: product.name },
    { label: "SKU", value: <Badge variant="outline">{product.sku}</Badge> },
    {
      label: "카테고리",
      value: product.category?.name ?? null,
    },
    {
      label: "브랜드",
      value: product.brandRef?.name ?? product.brand ?? null,
    },
    {
      label: "상품유형",
      value: (
        <Badge variant="secondary">
          {PRODUCT_TYPE_LABELS[product.productType] ?? product.productType}
        </Badge>
      ),
    },
    { label: "단위", value: product.unitOfMeasure },
    {
      label: "세금유형",
      value: (
        <Badge variant={product.taxType === "TAXABLE" ? "secondary" : "outline"}>
          {TAX_TYPE_LABELS[product.taxType] ?? product.taxType}
        </Badge>
      ),
    },
    { label: "모델명", value: product.modelName },
    { label: "규격", value: product.spec },
    {
      label: "정가 / 판매가",
      value: (
        <span className="tabular-nums">
          {displayList != null ? `₩${fmtPrice(displayList)} / ` : ""}
          <span className="font-medium">₩{fmtPrice(displayVat)}</span>
          {product.taxType === "TAXABLE" && (
            <span className="text-xs text-muted-foreground ml-1.5">(VAT 포함)</span>
          )}
        </span>
      ),
    },
    {
      label: "등록 / 수정",
      value:
        product.createdAt || product.updatedAt
          ? `${product.createdAt ? formatDateOnly(product.createdAt) : "-"} / ${
              product.updatedAt ? formatDateOnly(product.updatedAt) : "-"
            }`
          : null,
    },
    {
      label: "상태",
      value:
        product.isActive === false ? (
          <Badge variant="destructive">비활성</Badge>
        ) : (
          <Badge variant="secondary">활성</Badge>
        ),
    },
  ];

  const customerFields: FieldItem[] = [
    { label: "상품명", value: product.name },
    {
      label: "브랜드",
      value: product.brandRef?.name ?? product.brand ?? null,
    },
    { label: "모델명", value: product.modelName },
    { label: "규격", value: product.spec },
    {
      label: "판매가",
      value: (
        <span className="tabular-nums font-medium text-base">
          ₩{fmtPrice(displayVat)}
        </span>
      ),
    },
  ];

  const fields = isCustomer ? customerFields : adminFields;

  return (
    <ProductSection
      title="기본 정보"
      actions={
        onEdit ? (
          <Button size="sm" variant="outline" className="h-7" onClick={onEdit}>
            <Pencil className="h-3 w-3 mr-1" />
            편집
          </Button>
        ) : undefined
      }
    >
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        {fields.map((f) => (
          <Field key={f.label} {...f} />
        ))}
      </dl>
    </ProductSection>
  );
}
