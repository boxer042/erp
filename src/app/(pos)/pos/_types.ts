/**
 * POS 전역 타입 — 모드/상품/세션 등.
 */

/** 상품 그리드 / 검색 결과의 단순 row 타입. ProductsMode 와 ProductGridCard 가 공유. */
export interface ProductLite {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  spec: string | null;
  sellingPrice: string;
  /** 공식 판매 정가(세전) — 가격 다이얼로그에서 입력가와 비교해 할인/인상 표시 */
  listPrice?: string;
  imageUrl: string | null;
  taxType: string;
  zeroRateEligible?: boolean;
  isBulk?: boolean;
  unitOfMeasure?: string;
  isCanonical?: boolean;
  autoMapped?: boolean;
}
