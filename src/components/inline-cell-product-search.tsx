"use client";

import {
  MobileInlineCellProductSearch,
  type PendingNewProduct,
  type SupplierProductLike,
} from "@/components/inline-cell-product-search-mobile";

export type { PendingNewProduct, SupplierProductLike };

interface InlineCellProductSearchProps<T extends SupplierProductLike> {
  rowIndex: number;
  products: T[];
  onSelect: (product: T) => void;
  /** 검색어로 새 항목 생성 — incoming/initial 은 pending row 추가, returns 는 거래처상품 등록 시트 호출 */
  onCreateNew: (name: string) => void;
  /** 이미 다른 행에 추가된 공급상품 id 목록 — 시각 배지 또는 비활성화 처리 */
  existingIds: string[];
  selectedName?: string;

  // ── 옵션 모드 (incoming/initial 만 사용) ────────────────────────────
  /** 이 행이 새 항목(pending)에서 만들어졌거나 재사용 중일 때 표시 */
  isNew?: boolean;
  /** 다른 행에서 만든 pending 을 재사용 중이면 그 원본 행 번호 */
  pendingSourceRow?: number;
  /** 폼 안에서 생성된 새 항목 목록 — "이미 입력된 신규 항목" 그룹 노출 */
  pendingNewProducts?: PendingNewProduct[];
  /** 위 그룹에서 항목 선택 시 콜백 */
  onSelectPending?: (item: PendingNewProduct) => void;
  /** 공급상품 fetch 중 표시 (거래처 변경 직후 등) */
  loading?: boolean;

  // ── 옵션 모드 (returns 등) ─────────────────────────────────────────
  /** true 이면 existingIds 매칭 항목을 비활성화(선택 불가). false (기본) 면 배지만 표시 */
  disableAlreadyAdded?: boolean;
}

/**
 * 테이블 셀 내 공급상품 검색 — incoming / initial / returns 공용.
 *
 * - 데스크탑 (≥1024px non-touch): h-7 Popover + Command (테이블 셀 밀도 유지)
 * - 모바일/태블릿: MobileInlineCellProductSearch (JmDrawer 바텀시트)
 *
 * 검색 필드: name · supplierCode · spec (normalizeSearch — 한국어 초/중/종성 분리 매칭).
 * IME 안전성: Enter 처리 시 isComposing 가드.
 * "직접 입력" Enter UX: onCreateNew 콜백 호출 — 페이지 측에서 pending row 추가 또는 시트 오픈.
 *
 * @example
 * // 풀 기능 (incoming/initial)
 * <InlineCellProductSearch
 *   rowIndex={idx}
 *   products={supplierProducts}
 *   onSelect={(sp) => selectRow(idx, sp)}
 *   onCreateNew={(name) => addPendingRow(idx, name)}
 *   existingIds={items.map((i) => i.supplierProductId)}
 *   selectedName={item.name}
 *   isNew={item.isNew}
 *   pendingSourceRow={item.pendingSourceRow}
 *   pendingNewProducts={pendingNewProducts}
 *   onSelectPending={(p) => reusePendingFromRow(idx, p)}
 *   loading={spQuery.isPending}
 * />
 *
 * @example
 * // 단순 모드 (returns) — pending/loading 없이 중복만 막음
 * <InlineCellProductSearch
 *   rowIndex={idx}
 *   products={supplierProducts}
 *   onSelect={(sp) => selectRow(idx, sp)}
 *   onCreateNew={(name) => openQuickRegisterSheet(name)}
 *   existingIds={items.map((i) => i.supplierProductId).filter(Boolean)}
 *   selectedName={item.supplierProductName}
 *   disableAlreadyAdded
 * />
 */
export function InlineCellProductSearch<T extends SupplierProductLike>({
  rowIndex,
  products,
  onSelect,
  onCreateNew,
  existingIds,
  selectedName = "",
  isNew = false,
  pendingSourceRow,
  pendingNewProducts,
  onSelectPending,
  loading = false,
  disableAlreadyAdded = false,
}: InlineCellProductSearchProps<T>) {
  // 데스크탑·모바일 모두 하단 드로워로 통일 — 검색 UX 일관성 + 결과 영역 더 넓게 확보.
  // 모바일은 가상 키보드 안 가리는 dvh 동작이 핵심, 데스크탑도 같은 컴포넌트 재사용.
  return (
    <MobileInlineCellProductSearch
      rowIndex={rowIndex}
      products={products}
      onSelect={onSelect}
      onCreateNew={onCreateNew}
      existingIds={existingIds}
      selectedName={selectedName}
      isNew={isNew}
      pendingSourceRow={pendingSourceRow}
      pendingNewProducts={pendingNewProducts}
      onSelectPending={onSelectPending}
      disableAlreadyAdded={disableAlreadyAdded}
      loading={loading}
    />
  );
}
