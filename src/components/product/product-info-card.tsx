import { Pencil } from "lucide-react";
import { JmBadge, JmButton } from "@/jm";
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

function CustomerField({ label, value, full }: FieldItem) {
  return (
    <div className={`space-y-1 ${full ? "sm:col-span-2" : ""}`}>
      <dt className="text-jm-2xs font-medium text-[var(--jm-text-muted)]">{label}</dt>
      <dd className="text-jm-sm text-[var(--jm-text)]">
        {value || <span className="text-[var(--jm-text-muted)]">-</span>}
      </dd>
    </div>
  );
}

function AdminField({ label, value, full }: FieldItem) {
  const isEmpty = value == null || value === "" || value === false;
  return (
    <div className={`flex ${full ? "col-span-2 items-start" : "items-center"} gap-2`}>
      <span
        className={`text-[var(--jm-text-muted)] w-28 shrink-0 ${full ? "pt-0.5" : ""}`}
      >
        {label}
      </span>
      <span
        className={isEmpty ? "text-[var(--jm-text-muted)]" : "text-[var(--jm-text)]"}
      >
        {isEmpty ? "-" : value}
      </span>
    </div>
  );
}

export function ProductInfoCard({ product, variant = "admin", onEdit }: ProductInfoCardProps) {
  const isCustomer = variant === "customer";
  const displayVat = toVatPrice(product.sellingPrice, product.taxType);

  const adminFields: FieldItem[] = [
    { label: "상품명", value: product.name },
    {
      label: "SKU",
      value: (
        <JmBadge variant="outline" size="sm" shape="square">
          {product.sku}
        </JmBadge>
      ),
    },
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
        <JmBadge variant="default" size="sm" shape="square">
          {PRODUCT_TYPE_LABELS[product.productType] ?? product.productType}
        </JmBadge>
      ),
    },
    { label: "단위", value: product.unitOfMeasure },
    {
      label: "세금유형",
      value: (
        <div className="flex items-center gap-1">
          <JmBadge
            variant={product.taxType === "TAXABLE" ? "default" : "outline"}
            size="sm"
            shape="square"
          >
            {TAX_TYPE_LABELS[product.taxType] ?? product.taxType}
          </JmBadge>
          {product.zeroRateEligible && (
            <JmBadge variant="outline" size="sm" shape="square">
              영세율 가능
            </JmBadge>
          )}
        </div>
      ),
    },
    {
      label: "개별추적",
      value: product.trackable ? (
        <div className="flex items-center gap-1">
          <JmBadge variant="info" size="sm" shape="square">
            시리얼 라벨 발번
          </JmBadge>
          {product.warrantyMonths != null && product.warrantyMonths > 0 && (
            <span className="text-jm-xs text-[var(--jm-text-muted)]">
              보증 {product.warrantyMonths}개월
            </span>
          )}
        </div>
      ) : null,
    },
    { label: "모델명", value: product.modelName },
    { label: "규격", value: product.spec },
    {
      label: "등록일",
      value: product.createdAt ? formatDateOnly(product.createdAt) : null,
    },
    {
      label: "최종 수정",
      value: product.updatedAt ? formatDateOnly(product.updatedAt) : null,
    },
    {
      label: "상태",
      value:
        product.isActive === false ? (
          <JmBadge variant="danger" size="sm" shape="square">
            비활성
          </JmBadge>
        ) : (
          <JmBadge variant="success" size="sm" shape="square">
            활성
          </JmBadge>
        ),
    },
    { label: "메모", value: product.memo, full: true },
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
        <span className="tabular-nums font-medium text-jm-base">
          ₩{fmtPrice(displayVat)}
        </span>
      ),
    },
  ];

  return (
    <ProductSection
      title="기본 정보"
      actions={
        onEdit ? (
          <JmButton size="sm" variant="outline" onClick={onEdit}>
            <Pencil />
            <span>편집</span>
          </JmButton>
        ) : undefined
      }
    >
      {isCustomer ? (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          {customerFields.map((f) => (
            <CustomerField key={f.label} {...f} />
          ))}
        </dl>
      ) : (
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-jm-sm">
          {adminFields.map((f) => (
            <AdminField key={f.label} {...f} />
          ))}
        </div>
      )}
    </ProductSection>
  );
}
