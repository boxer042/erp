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
    quantity: string;
    receivedQty: string;
    pendingQty?: number;     // PENDING 입고 누적 (목록 응답에서 계산해서 추가)
    unitPrice: string;
    supplierProduct: {
      id: string;
      name: string;
      supplierCode: string | null;
      unitOfMeasure: string;
    };
  }>;
}

export interface PurchaseOrderItemForm {
  supplierProductId: string;
  supplierProductName: string;
  supplierCode: string | null;
  unitOfMeasure: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  memo: string;
}

export interface PurchaseOrderFormState {
  supplierId: string;
  supplierName: string;
  orderDate: string;       // yyyy-MM-dd
  expectedDate: string;    // yyyy-MM-dd
  memo: string;
  items: PurchaseOrderItemForm[];
}

export const emptyItem = (): PurchaseOrderItemForm => ({
  supplierProductId: "",
  supplierProductName: "",
  supplierCode: null,
  unitOfMeasure: "EA",
  quantity: "",
  unitPrice: "",
  totalPrice: "",
  memo: "",
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

// shadcn Badge variant 와 매핑 (Tailwind 색상 직접 — primary/secondary/outline/destructive 외에 커스텀 필요)
export const statusBadgeClass: Record<PurchaseOrderStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
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
