export const DEFAULT_TAX_RATE = 0.1; // 10% 부가세

export const SALES_CHANNELS = [
  { name: "쿠팡", code: "COUPANG", commissionRate: 0.108 },
  { name: "네이버", code: "NAVER", commissionRate: 0.055 },
  { name: "자사몰", code: "OWN", commissionRate: 0 },
  { name: "오프라인", code: "OFFLINE", commissionRate: 0 },
] as const;

export const PAYMENT_METHODS = [
  { value: "CREDIT", label: "외상 (후불)" },
  { value: "PREPAID", label: "선불" },
] as const;

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "접수",
  CONFIRMED: "확인",
  PREPARING: "준비중",
  SHIPPED: "배송중",
  DELIVERED: "배송완료",
  CANCELLED: "취소",
  RETURNED: "반품",
};

export const INCOMING_STATUS_LABELS: Record<string, string> = {
  PENDING: "대기",
  CONFIRMED: "입고완료",
  CANCELLED: "취소",
};

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  INCOMING: "입고",
  OUTGOING: "출고",
  ADJUSTMENT_PLUS: "조정 +",
  ADJUSTMENT_MINUS: "조정 -",
  SET_CONSUME: "세트 소비",
  SET_PRODUCE: "세트 생산",
  RETURN: "반품 복원",
  INITIAL: "기초등록",
  STOCKTAKE_PLUS: "실사 +",
  STOCKTAKE_MINUS: "실사 -",
  INTERNAL_USE: "내부 사용",
  BOTTLE_OPEN_OUT: "병 따기 (출고)",
  BOTTLE_OPEN_IN: "병 따기 (벌크 입고)",
};

export const UNITS_OF_MEASURE = [
  { value: "EA", label: "개" },
  { value: "BOX", label: "박스" },
  { value: "KG", label: "kg" },
  { value: "G", label: "g" },
  { value: "L", label: "L" },
  { value: "ML", label: "mL" },
  { value: "SET", label: "세트" },
  { value: "PACK", label: "팩" },
] as const;
