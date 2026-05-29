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
  /** 상품에 활성 ProductOption 슬롯이 등록돼 있는지 — 카트 라인의 "옵션 선택" 트리거 노출용 */
  hasProductOptions?: boolean;
  /** Product.productType — OPTION_PARENT 면 자체 재고 X, SWAP 옵션 선택 강제 */
  productType?: "FINISHED" | "PARTS" | "SET" | "ASSEMBLED" | "OPTION_PARENT";
  /**
   * OPTION_PARENT 상품의 옵션 SWAP 값들 중 최저가(세전).
   * 카탈로그 노출 시 "₩50,000~" 형식 표시. 일반 FINISHED 상품은 null.
   */
  minOptionPrice?: number | null;
  /**
   * UsedItem marker — 검색 결과에 중고 단품도 통합 표시할 때 사용.
   * id 는 UsedItem.id (Product 와 별개), name 에 자동 "(중고)" prefix.
   * 카트 추가·결제 시 이 필드 있으면 UsedItem 흐름으로 분기.
   */
  usedItemId?: string;
}
