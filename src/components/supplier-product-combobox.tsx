"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import {
  JmBadge,
  JmCombobox,
  JmComboboxDrawer,
  type JmComboboxItem,
} from "@/jm";
import { normalizeSearch } from "@/lib/utils";
import { useIsCompactDevice } from "@/hooks/use-mobile";

interface SupplierProductCostItem {
  id: string;
  name: string;
  costType: "FIXED" | "PERCENTAGE";
  value: string;
  perUnit: boolean;
  isTaxable: boolean;
}

interface SupplierProduct {
  id: string;
  name: string;
  spec?: string | null;
  supplierCode?: string | null;
  unitPrice: string;
  unitOfMeasure: string;
  /** 과세 여부 — onChange 콜백에서 판매상품 세금유형 자동 채움에 사용 */
  isTaxable?: boolean;
  incomingCosts?: SupplierProductCostItem[];
  /** 이 거래처상품이 이미 연결된 판매상품들 — 행에 "매핑 N" 배지로 표시 */
  productMappings?: Array<{ id: string; product: { id: string; name: string } }>;
}

type SpItem = JmComboboxItem & {
  sp: SupplierProduct;
};

interface SupplierProductComboboxProps {
  supplierProducts: SupplierProduct[];
  value: string;
  onChange: (sp: SupplierProduct) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

const HEIGHT_BY_SIZE: Record<NonNullable<SupplierProductComboboxProps["size"]>, string> = {
  sm: "h-9",
  md: "h-10",
  lg: "h-11",
};

function matchesSp(s: SupplierProduct, q: string) {
  const nq = normalizeSearch(q);
  return (
    normalizeSearch(s.name).includes(nq) ||
    (s.supplierCode ? normalizeSearch(s.supplierCode).includes(nq) : false) ||
    (s.spec ? normalizeSearch(s.spec).includes(nq) : false)
  );
}

/** 옵션값 렌더링 — 데스크탑 콤보박스 결과 + 모바일 드로워 결과 모두 사용 */
function renderSpItem(s: SupplierProduct) {
  const mappedCount = s.productMappings?.length ?? 0;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="flex-1 truncate text-[var(--jm-text)]">
        {s.name}
        {s.spec && (
          <span className="ml-1 text-[var(--jm-text-muted)]">· {s.spec}</span>
        )}
      </span>
      {mappedCount > 0 && (
        <JmBadge
          variant="warning"
          size="sm"
          shape="square"
          className="shrink-0 text-jm-2xs"
          title={s.productMappings!.map((m) => m.product.name).join(", ")}
        >
          매핑 {mappedCount}
        </JmBadge>
      )}
      {s.supplierCode && (
        <span className="text-jm-xs text-[var(--jm-text-muted)] shrink-0 font-[family-name:var(--jm-font-mono)]">
          {s.supplierCode}
        </span>
      )}
      <span className="text-jm-xs text-[var(--jm-text-muted)] shrink-0 tabular-nums">
        ₩{parseFloat(s.unitPrice).toLocaleString("ko-KR")}
      </span>
    </span>
  );
}

/**
 * 거래처 공급상품 선택 콤보박스.
 *
 * - 데스크탑 (mouse, ≥1024px): JmCombobox 팝오버
 * - 모바일/태블릿 (≤1023px 또는 coarse pointer): JmComboboxDrawer (바텀시트)
 *   가상 키보드가 떠도 dvh 단위로 자동 축소돼 입력창/결과 안 가려짐.
 */
export function SupplierProductCombobox({
  supplierProducts,
  value,
  onChange,
  onCreateNew,
  placeholder = "공급상품 선택...",
  disabled = false,
  size = "sm",
}: SupplierProductComboboxProps) {
  const isCompact = useIsCompactDevice();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = useMemo<SpItem[]>(
    () =>
      supplierProducts.map((s) => ({
        id: s.id,
        label: `${s.name}${s.spec ? ` · ${s.spec}` : ""}`,
        sp: s,
      })),
    [supplierProducts],
  );

  // 모바일/태블릿 — 트리거 버튼 + JmComboboxDrawer
  if (isCompact) {
    const selected = supplierProducts.find((s) => s.id === value) ?? null;
    return (
      <>
        <div className={`relative ${HEIGHT_BY_SIZE[size]}`}>
          <button
            type="button"
            onClick={() => !disabled && setDrawerOpen(true)}
            disabled={disabled}
            className={`flex w-full items-center gap-2 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] pl-3 pr-9 text-jm-sm hover:bg-[var(--jm-surface-muted)] disabled:opacity-50 disabled:cursor-not-allowed ${HEIGHT_BY_SIZE[size]}`}
          >
            <span
              className={`truncate text-left ${
                selected ? "text-[var(--jm-text)]" : "text-[var(--jm-text-muted)]"
              }`}
            >
              {selected
                ? `${selected.name}${selected.spec ? ` · ${selected.spec}` : ""}`
                : placeholder}
            </span>
            <span className="absolute inset-y-0 right-2 flex items-center">
              <ChevronsUpDown className="size-3.5 text-[var(--jm-text-muted)]" />
            </span>
          </button>
        </div>
        <JmComboboxDrawer<SupplierProduct>
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          items={supplierProducts}
          getKey={(s) => s.id}
          renderItem={renderSpItem}
          filterFn={matchesSp}
          onSelect={(s) => {
            onChange(s);
            setDrawerOpen(false);
          }}
          onCreate={(name) => {
            setDrawerOpen(false);
            onCreateNew(name);
          }}
          createLabel={(q) => (
            <span className="text-jm-sm">
              <span className="font-semibold">&ldquo;{q}&rdquo;</span>{" "}
              <span className="text-[var(--jm-text-muted)]">새 공급상품 등록</span>
            </span>
          )}
          title="공급상품 선택"
          placeholder="품명·규격·품번 검색..."
          emptyText="공급상품이 없습니다"
        />
      </>
    );
  }

  // 데스크탑 — 기존 JmCombobox 팝오버
  return (
    <JmCombobox<SpItem>
      items={items}
      value={value}
      size={size}
      onChange={(item) => onChange(item.sp)}
      onCreateNew={onCreateNew}
      placeholder={placeholder}
      searchPlaceholder="품명·규격·품번 검색..."
      emptyMessage="공급상품이 없습니다"
      disabled={disabled}
      matches={(item, q) => matchesSp(item.sp, q)}
      renderItem={(item) => renderSpItem(item.sp)}
    />
  );
}
