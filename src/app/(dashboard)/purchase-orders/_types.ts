export type PurchaseOrderStatus =
  | "DRAFT"
  | "SENT"
  | "CONFIRMED"
  | "COUNTER_OFFER"
  | "PARTIAL"
  | "PARTIAL_RESENT"
  | "PARTIAL_REACCEPTED"
  | "PARTIAL_COMPLETED"
  | "RECEIVED"
  | "CLOSED"
  | "CANCELLED";

export interface PurchaseOrderListRow {
  id: string;
  poNo: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDate: string | null;
  totalAmount: string;
  memo: string | null;
  supplier: { id: string; name: string };
  createdBy: { name: string };
  _count: { items: number; incomings: number };
  items: Array<{
    id: string;
    name: string | null;       // 자유입력 라인일 때만 값. supplierProduct 없으면 이 값 사용
    quantity: string;
    receivedQty: string;
    pendingQty?: number;       // PENDING 입고 누적 (목록 응답에서 계산해서 추가)
    unitPrice: string;
    supplierProduct: {
      id: string;
      name: string;
      supplierCode: string | null;
      unitOfMeasure: string;
    } | null;
  }>;
}

// rowType 으로 자유입력 / 공급상품 라인 구분.
//   "product": supplierProductId 필수, name 은 supplierProductName 동기화 (편의용)
//   "free":    supplierProductId 비어있음, name 필수, unit/단가/수량 모두 직접 입력
export type PurchaseOrderRowType = "product" | "free";

export type ShippingMethodOption =
  | "COURIER"
  | "DIRECT_DELIVERY"
  | "QUICK_OR_CARGO"
  | "OTHER_SUPPLIER"
  | "PICKUP";

export const SHIPPING_METHOD_LABELS: Record<ShippingMethodOption, string> = {
  COURIER: "택배 출고",
  DIRECT_DELIVERY: "직접 배달",
  QUICK_OR_CARGO: "퀵 · 용달",
  OTHER_SUPPLIER: "다른 거래처 출고",
  PICKUP: "직접 수령 (매장 픽업)",
};

export interface PurchaseOrderItemForm {
  rowType: PurchaseOrderRowType;
  supplierProductId: string;
  supplierProductName: string;
  supplierCode: string | null;
  unitOfMeasure: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  memo: string;
  // 자유입력 라인의 품명 (rowType="free")
  name: string;
  // 가격 미정 토글 — true 면 단가는 0 으로 저장되고 외부 페이지에서 "가격 미정" 표시
  priceUndetermined: boolean;
}

export interface PurchaseOrderFormState {
  supplierId: string;
  supplierName: string;
  orderDate: string;       // yyyy-MM-dd
  expectedDate: string;    // yyyy-MM-dd
  memo: string;
  // 우리가 PO 발송 시 사전 선택하는 출고 방법. 비워두면 거래처가 [수락] 모달에서 선택.
  // "PICKUP" 으로 보내면 거래처 모달은 출고 방법 버튼 숨기고 출고 가능일만 받음.
  shippingMethod: ShippingMethodOption | "";
  // 가격 미정 라인이 있을 때 거래처가 입력한 단가를 우리가 검토 후 수락할지 여부.
  // false (기본): 거래처 입력 즉시 CONFIRMED. true: 거래처 입력 → COUNTER_OFFER → 우리 검토.
  requirePriceReview: boolean;
  items: PurchaseOrderItemForm[];
}

export const emptyItem = (rowType: PurchaseOrderRowType = "product"): PurchaseOrderItemForm => ({
  rowType,
  supplierProductId: "",
  supplierProductName: "",
  supplierCode: null,
  unitOfMeasure: "EA",
  quantity: "",
  unitPrice: "",
  totalPrice: "",
  memo: "",
  name: "",
  priceUndetermined: false,
});

export const statusLabels: Record<PurchaseOrderStatus, string> = {
  DRAFT: "작성중",
  SENT: "발송",
  CONFIRMED: "수락",
  COUNTER_OFFER: "단가 협상 중",
  PARTIAL: "부분입고 발생",
  PARTIAL_RESENT: "부분입고 재발송",
  PARTIAL_REACCEPTED: "부분입고 수락",
  PARTIAL_COMPLETED: "부분입고 완료",
  RECEIVED: "입고완료",
  CLOSED: "부분입고 종결",
  CANCELLED: "취소",
};

/* eslint-disable no-restricted-syntax -- 11개 PO 상태 구분용 카테고리 색상(다크 대응 포함). jm 5색 시맨틱으로 환원 불가 — 의도된 다색 팔레트. */
// 상태별 배지 색상 — 상태 구분이 목적이라 다색 팔레트 직접 사용
export const statusBadgeClass: Record<PurchaseOrderStatus, string> = {
  DRAFT: "bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] border-[var(--jm-border)]",
  SENT: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  CONFIRMED: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800",
  COUNTER_OFFER: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-300 dark:bg-fuchsia-950 dark:text-fuchsia-300 dark:border-fuchsia-800",
  PARTIAL: "bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  PARTIAL_RESENT: "bg-orange-50 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  PARTIAL_REACCEPTED: "bg-violet-50 text-violet-800 border-violet-300 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
  PARTIAL_COMPLETED: "bg-teal-50 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  RECEIVED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  CLOSED: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
  CANCELLED: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
};
/* eslint-enable no-restricted-syntax */
